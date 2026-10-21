// Dashboard API. Every action except "create" needs the dashboard (control)
// key from the secret link; keys are only ever stored as SHA-256 hashes.
//
// POST JSON { action, ... }:
//   exists  {} → { exists, publicSite }                           (no key; lets setup ask for a link)
//   create  { controlKey, overlayKey, overlaySealed?, site?, setupCode? } → { id }  (only when none exists)
//   replace { id, key, controlKey, overlayKey, overlaySealed?, site? } → { id }
//           "Create a new ticker" when one exists: proven by the current dashboard key,
//           it issues new links (the old ones stop working) and resets settings.
//   read    { id, key, symbols?, site? } → { config, previous, presets, overlaySealed, publicSite, relay, quotes }
//           site: the page's address when it isn't a Lovable preview. The server keeps
//           the latest one so links copied inside a preview point at the published site
//           (preview addresses ask OBS for a Lovable login). Only keyed calls can set it.
//   status  { id, key, symbols? } → { relay, quotes }
//           symbols: what the dashboard preview shows (the draft), so it gets prices
//           too. While no overlay is open, read/status also refresh quotes and the
//           market session from Finnhub's free REST API, all symbols in one pass so
//           they update together.
//   apply   { id, key, config } → { config }   publishes to the overlay, keeps the old one for restore
//   restore { id, key } → { config }
//   preset  { id, key, name, config } / deletePreset { id, key, name } → { presets }
//   rotate  { id, key, role: "control" | "overlay", newKey, overlaySealed? } → { ok }
//   seal    { id, key, overlaySealed } → { ok }
//           overlaySealed is the overlay key encrypted in the browser with the dashboard
//           key, so any device with the dashboard link can show the overlay link.
import { admin, keyPattern, sha256, uuidPattern } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { finnhub, ProviderError } from "../_shared/finnhub.ts";
import {
  activeSymbols,
  defaultConfig,
  MAX_LIST,
  type MarketSession,
  normalizeOrigin,
  normalizeSymbol,
  sanitizeConfig,
} from "../_shared/market.ts";

const MAX_PRESETS = 30;
// Finnhub's free plan allows 60 REST calls a minute, so a full refresh of N
// symbols waits at least N × 1.2 s. Closed-market prices don't move.
const SNAPSHOT_MS_PER_SYMBOL = 1200;
const SNAPSHOT_MIN_AGE_MS = 60_000;
const SNAPSHOT_CLOSED_AGE_MS = 10 * 60_000;
const SNAPSHOT_CONCURRENCY = 4;
const MARKET_MAX_AGE_MS = 5 * 60_000;

type Body = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  try {
    const action = str(body["action"]);
    if (action === "create") return await create(body);
    if (action === "exists") {
      const { count, error } = await admin
        .from("ticker_channels")
        .select("id", { count: "exact", head: true });
      if (error) return json({ error: "Database unavailable" }, 503);
      const { data: site } = await admin.from("ticker_channels").select("public_site").limit(1);
      return json({ exists: (count ?? 0) > 0, publicSite: site?.[0]?.public_site ?? null });
    }
    const id = str(body["id"]);
    const key = str(body["key"]);
    if (!uuidPattern.test(id) || !keyPattern.test(key))
      return json({ error: "Invalid dashboard link." }, 400);
    const { data: row, error } = await admin
      .from("ticker_channels")
      .select("config, previous_config, presets")
      .eq("id", id)
      .eq("control_hash", await sha256(key))
      .maybeSingle();
    if (error) return json({ error: "Database unavailable" }, 503);
    if (!row) return json({ error: "This dashboard link is invalid or has been replaced." }, 403);
    const presets = (row.presets ?? {}) as Record<string, unknown>;
    const config = sanitizeConfig(row.config);

    switch (action) {
      case "read":
        return json({
          config,
          previous: row.previous_config ? sanitizeConfig(row.previous_config) : null,
          presets,
          ...(await readExtras(id, body["site"])),
          ...(await liveState(config, body["symbols"])),
        });
      case "status":
        return json(await liveState(config, body["symbols"]));
      case "apply": {
        const next = sanitizeConfig(body["config"]);
        await update(id, { config: next, previous_config: config });
        return json({ config: next });
      }
      case "restore": {
        const next = row.previous_config ? sanitizeConfig(row.previous_config) : defaultConfig;
        await update(id, { config: next, previous_config: config });
        return json({ config: next });
      }
      case "preset": {
        const name = str(body["name"]).trim().slice(0, 40);
        if (!name) return json({ error: "Name the preset." }, 400);
        if (!(name in presets) && Object.keys(presets).length >= MAX_PRESETS)
          return json({ error: `Up to ${MAX_PRESETS} presets.` }, 400);
        const next = { ...presets, [name]: sanitizeConfig(body["config"]) };
        await update(id, { presets: next });
        return json({ presets: next });
      }
      case "deletePreset": {
        const next = { ...presets };
        delete next[str(body["name"])];
        await update(id, { presets: next });
        return json({ presets: next });
      }
      case "rotate": {
        const role = str(body["role"]);
        const newKey = str(body["newKey"]);
        if ((role !== "control" && role !== "overlay") || !keyPattern.test(newKey))
          return json({ error: "Invalid rotation request." }, 400);
        await update(id, {
          [role === "control" ? "control_hash" : "overlay_hash"]: await sha256(newKey),
        });
        // The old seal no longer matches either key, so replace or clear it.
        await storeSealed(id, sealed(body["overlaySealed"]));
        return json({ ok: true });
      }
      case "replace": {
        const controlKey = str(body["controlKey"]);
        const overlayKey = str(body["overlayKey"]);
        if (
          !keyPattern.test(controlKey) ||
          !keyPattern.test(overlayKey) ||
          controlKey === overlayKey
        )
          return json({ error: "Invalid keys." }, 400);
        // The relay notices the new overlay hash within 5 s and disconnects old overlays.
        await update(id, {
          control_hash: await sha256(controlKey),
          overlay_hash: await sha256(overlayKey),
          config: defaultConfig,
          previous_config: null,
          presets: {},
        });
        await storeSealed(id, sealed(body["overlaySealed"]));
        const site = normalizeOrigin(body["site"]);
        if (site) await storeSite(id, site);
        return json({ id });
      }
      case "seal": {
        const value = sealed(body["overlaySealed"]);
        if (!value) return json({ error: "Invalid overlay seal." }, 400);
        return json({ ok: await storeSealed(id, value) });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});

const sealedPattern = /^[A-Za-z0-9_-]{40,200}$/;
const sealed = (value: unknown) => (sealedPattern.test(str(value)) ? str(value) : null);

// overlay_sealed and public_site come from later migrations; until they are
// applied, links still work and only these conveniences are unavailable.
async function readExtras(id: string, site: unknown) {
  const { data, error } = await admin
    .from("ticker_channels")
    .select("overlay_sealed, public_site")
    .eq("id", id)
    .maybeSingle();
  if (error) return { overlaySealed: null, publicSite: null };
  let publicSite = (data?.public_site as string | null) ?? null;
  const reported = normalizeOrigin(site);
  if (reported && reported !== publicSite && (await storeSite(id, reported))) publicSite = reported;
  return { overlaySealed: (data?.overlay_sealed as string | null) ?? null, publicSite };
}
async function storeSite(id: string, site: string) {
  const { error } = await admin.from("ticker_channels").update({ public_site: site }).eq("id", id);
  if (error) console.error("public_site unavailable", error.message);
  return !error;
}
async function storeSealed(id: string, value: string | null) {
  const { error } = await admin
    .from("ticker_channels")
    .update({ overlay_sealed: value })
    .eq("id", id);
  if (error) console.error("overlay_sealed unavailable", error.message);
  return !error;
}

async function update(id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("ticker_channels").update(values).eq("id", id);
  if (error) throw error;
}

async function create(body: Body) {
  const controlKey = str(body["controlKey"]);
  const overlayKey = str(body["overlayKey"]);
  if (!keyPattern.test(controlKey) || !keyPattern.test(overlayKey) || controlKey === overlayKey)
    return json({ error: "Invalid keys." }, 400);
  const setupCode = Deno.env.get("TICKER_SETUP_CODE");
  if (setupCode && str(body["setupCode"]) !== setupCode)
    return json({ error: "Setup code required.", needsSetupCode: true }, 403);
  const { data, error } = await admin
    .from("ticker_channels")
    .insert({
      control_hash: await sha256(controlKey),
      overlay_hash: await sha256(overlayKey),
      config: defaultConfig,
    })
    .select("id")
    .single();
  // The singleton index rejects a second ticker (Postgres unique violation).
  if (error?.code === "23505")
    return json(
      { error: "This ticker is already set up. Open it with your dashboard link.", exists: true },
      409,
    );
  if (error || !data) throw error ?? new Error("Insert failed");
  const seal = sealed(body["overlaySealed"]);
  if (seal) await storeSealed(data.id, seal);
  const site = normalizeOrigin(body["site"]);
  if (site) await storeSite(data.id, site);
  return json({ id: data.id });
}

async function liveState(config: ReturnType<typeof sanitizeConfig>, requested: unknown) {
  const shown = Array.isArray(requested) ? requested.map(normalizeSymbol) : [];
  const symbols = [
    ...new Set([
      ...shown.filter((s): s is string => !!s),
      ...activeSymbols(config),
      ...config.etfs,
    ]),
  ].slice(0, MAX_LIST);
  const [{ data: relay }, { data: cached }] = await Promise.all([
    admin
      .from("ticker_relay")
      .select("status, message, expires_at, duplicate_at, market, symbols, started_at, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("ticker_quotes")
      .select("symbol, price, previous_close, quote_time, source, updated_at")
      .in("symbol", symbols),
  ]);
  const live = !!relay && Date.parse(relay.expires_at) > Date.now();
  let quotes = cached ?? [];
  let market = (relay?.market ?? null) as MarketSession | null;
  // The relay keeps the cache fresh while OBS is open; otherwise use REST snapshots.
  const apiKey = Deno.env.get("FINNHUB_API_KEY");
  if (!live && apiKey) {
    const refreshed = await refreshSnapshots(apiKey, symbols, quotes, market);
    quotes = refreshed.quotes;
    market = refreshed.market;
  }
  return {
    relay: relay
      ? {
          live,
          status: live ? relay.status : "offline",
          message: live ? relay.message : null,
          duplicateAt: relay.duplicate_at,
          market,
          symbols: live ? relay.symbols : [],
          startedAt: relay.started_at,
          updatedAt: relay.updated_at,
          hasProviderKey: !!apiKey,
          hasLogoKey: !!Deno.env.get("LOGO_DEV_PUBLISHABLE_KEY"),
        }
      : null,
    quotes: quotes.map((q) => ({
      symbol: q.symbol,
      price: q.price,
      previousClose: q.previous_close,
      timestamp: Date.parse(q.quote_time),
      source: q.source,
    })),
  };
}

type CachedRow = {
  symbol: string;
  price: number;
  previous_close: number | null;
  quote_time: string;
  source: string;
  updated_at: string;
};

async function refreshSnapshots(
  apiKey: string,
  symbols: string[],
  cached: CachedRow[],
  market: MarketSession | null,
) {
  const provider = finnhub(apiKey);
  const bySymbol = new Map(cached.map((q) => [q.symbol, q]));
  const now = Date.now();
  if (!market || now - (market.checkedAt ?? 0) > MARKET_MAX_AGE_MS) {
    try {
      market = await provider.marketStatus();
      await admin.from("ticker_relay").update({ market }).eq("id", 1);
    } catch {
      // keep the previous session label
    }
  }
  // Refresh as one batch: when any symbol is due, everything at least half
  // due goes too, so the preview's prices change together.
  const maxAge =
    market?.session === "closed"
      ? SNAPSHOT_CLOSED_AGE_MS
      : Math.max(SNAPSHOT_MIN_AGE_MS, symbols.length * SNAPSHOT_MS_PER_SYMBOL);
  const age = (s: string) => {
    const row = bySymbol.get(s);
    return row ? now - Date.parse(row.updated_at) : Infinity;
  };
  const due = symbols.some((s) => age(s) > maxAge)
    ? symbols.filter((s) => age(s) > maxAge / 2)
    : [];
  const rows: CachedRow[] = [];
  let limited = false;
  const worker = async () => {
    for (let symbol = due.shift(); symbol && !limited; symbol = due.shift()) {
      try {
        const q = await provider.quote(symbol);
        if (!q) continue;
        rows.push({
          symbol,
          price: q.price,
          previous_close: q.previousClose,
          quote_time: new Date(q.timestamp).toISOString(),
          source: "snapshot",
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        // Rate limit or bad key: show what is cached and try again next poll.
        if (e instanceof ProviderError && (e.status === 429 || e.status === 401)) limited = true;
      }
    }
  };
  await Promise.all(Array.from({ length: SNAPSHOT_CONCURRENCY }, worker));
  if (rows.length) {
    await admin.from("ticker_quotes").upsert(rows);
    for (const row of rows) bySymbol.set(row.symbol, row);
  }
  return { quotes: [...bySymbol.values()], market };
}
