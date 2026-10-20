// Dashboard API. Every action except "create" needs the dashboard (control)
// key from the secret link; keys are only ever stored as SHA-256 hashes.
//
// POST JSON { action, ... }:
//   create  { controlKey, overlayKey, setupCode? } → { id }      (only when no ticker exists yet)
//   read    { id, key } → { config, previous, presets, relay, quotes }
//   status  { id, key } → { relay, quotes }
//   apply   { id, key, config } → { config }   publishes to the overlay, keeps the old one for restore
//   restore { id, key } → { config }
//   preset  { id, key, name, config } / deletePreset { id, key, name } → { presets }
//   rotate  { id, key, role: "control" | "overlay", newKey } → { ok }
import { admin, keyPattern, sha256, uuidPattern } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { activeSymbols, defaultConfig, sanitizeConfig } from "../_shared/market.ts";

const MAX_PRESETS = 30;

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
          ...(await liveState(config)),
        });
      case "status":
        return json(await liveState(config));
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
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});

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
  return json({ id: data.id });
}

async function liveState(config: ReturnType<typeof sanitizeConfig>) {
  const [{ data: relay }, { data: quotes }] = await Promise.all([
    admin
      .from("ticker_relay")
      .select("status, message, expires_at, duplicate_at, market, symbols, started_at, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("ticker_quotes")
      .select("symbol, price, previous_close, quote_time, source")
      .in("symbol", [...new Set([...activeSymbols(config), ...config.etfs])]),
  ]);
  const live = !!relay && Date.parse(relay.expires_at) > Date.now();
  return {
    relay: relay
      ? {
          live,
          status: live ? relay.status : "offline",
          message: live ? relay.message : null,
          duplicateAt: relay.duplicate_at,
          market: relay.market,
          symbols: live ? relay.symbols : [],
          startedAt: relay.started_at,
          updatedAt: relay.updated_at,
          hasProviderKey: !!Deno.env.get("FINNHUB_API_KEY"),
          hasLogoKey: !!Deno.env.get("LOGO_DEV_PUBLISHABLE_KEY"),
        }
      : null,
    quotes: (quotes ?? []).map((q) => ({
      symbol: q.symbol,
      price: q.price,
      previousClose: q.previous_close,
      timestamp: Date.parse(q.quote_time),
      source: q.source,
    })),
  };
}
