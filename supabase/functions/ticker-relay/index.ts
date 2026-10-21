// Live market relay: one overlay WebSocket in, one Finnhub WebSocket out.
//
// The overlay opens wss://<project>.supabase.co/functions/v1/ticker-relay and
// sends {type:"hello", id, key, instance}. The relay checks the overlay key,
// claims the single free-plan Finnhub lease (ticker_relay row 1), sends REST
// snapshots, then streams batched trades. It closes everything when the
// overlay disconnects, so the Finnhub connection only exists while OBS is open.
//
// Edge Functions have a wall-clock limit (150 s on the Free plan, 400 s on paid
// plans), so the relay hands over before the limit: it sends {type:"rotate"},
// keeps the lease for the same instance, and the overlay reconnects at once.
import { admin, keyPattern, sha256, uuidPattern } from "../_shared/db.ts";
import { finnhub, ProviderError } from "../_shared/finnhub.ts";
import {
  activeSymbols,
  type FeedEvent,
  type FeedStatus,
  type Quote,
  RelayClose,
  sanitizeConfig,
  type TickerConfig,
  tradeBaseline,
  withChange,
} from "../_shared/market.ts";

const LEASE_MS = 45_000;
const HEARTBEAT_MS = 5_000;
const FLUSH_MS = 400;
const QUOTE_CACHE_MS = 15_000;
const MARKET_MS = 5 * 60_000;
const NEWS_MS = 5 * 60_000;
const MAX_SECONDS = Math.max(30, Number(Deno.env.get("RELAY_MAX_SECONDS") ?? 140));

Deno.serve((req) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("The ticker relay only accepts WebSocket connections.", { status: 426 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  relay(socket);
  // Keep the worker alive while the socket is open; otherwise the runtime may
  // reclaim an isolate that has no pending work (the wall-clock cap still applies).
  const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(
    closed,
  );
  return response;
});

function relay(client: WebSocket) {
  let started = false;
  let session: ReturnType<typeof startSession> | undefined;
  let closed = false;
  const helloTimer = setTimeout(() => close(RelayClose.badRequest, "No hello received"), 10_000);

  function send(event: FeedEvent) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
  }
  function close(code: number, reason: string) {
    try {
      client.close(code, reason);
    } catch {
      // already closing
    }
  }

  client.onmessage = (event) => {
    if (started) return;
    started = true;
    clearTimeout(helloTimer);
    let hello: { type?: string; id?: string; key?: string; instance?: string };
    try {
      hello = JSON.parse(String(event.data));
    } catch {
      return close(RelayClose.badRequest, "Invalid hello");
    }
    if (
      hello.type !== "hello" ||
      !uuidPattern.test(hello.id ?? "") ||
      !keyPattern.test(hello.key ?? "") ||
      !uuidPattern.test(hello.instance ?? "")
    ) {
      return close(RelayClose.badRequest, "Invalid hello");
    }
    session = startSession(
      { id: hello.id!, key: hello.key!, instance: hello.instance! },
      send,
      close,
      () => closed,
    );
  };
  client.onclose = () => {
    closed = true;
    clearTimeout(helloTimer);
    void session?.then((stop) => stop?.(true));
  };
  client.onerror = () => close(1011, "Socket error");
}

async function startSession(
  access: { id: string; key: string; instance: string },
  send: (event: FeedEvent) => void,
  close: (code: number, reason: string) => void,
  isClosed: () => boolean,
): Promise<((release: boolean) => Promise<void>) | undefined> {
  const overlayHash = await sha256(access.key);
  const { data: channel, error } = await admin
    .from("ticker_channels")
    .select("config, updated_at")
    .eq("id", access.id)
    .eq("overlay_hash", overlayHash)
    .maybeSingle();
  if (error) {
    send({ type: "status", status: "error", message: "Ticker database unavailable" });
    close(RelayClose.unavailable, "Database unavailable");
    return;
  }
  if (!channel) {
    send({
      type: "status",
      status: "error",
      message: "This overlay link is invalid or has been replaced.",
    });
    close(RelayClose.invalidLink, "Invalid overlay link");
    return;
  }
  const apiKey = Deno.env.get("FINNHUB_API_KEY");
  if (!apiKey) {
    send({
      type: "status",
      status: "error",
      message: "FINNHUB_API_KEY is not set in Supabase Edge Function secrets.",
    });
    close(RelayClose.unavailable, "Provider not configured");
    return;
  }
  if (isClosed()) return;

  const { data: claimed, error: claimError } = await admin.rpc("claim_ticker_relay", {
    p_channel: access.id,
    p_owner: access.instance,
  });
  if (claimError) {
    send({
      type: "status",
      status: "error",
      message: "Could not reserve the market-data connection",
    });
    close(RelayClose.unavailable, "Lease unavailable");
    return;
  }
  if (!claimed) {
    send({
      type: "status",
      status: "duplicate",
      message:
        "Another ticker copy is already connected. The free Finnhub plan allows one connection.",
    });
    close(RelayClose.duplicate, "Duplicate ticker");
    return;
  }

  const provider = finnhub(apiKey);
  let config: TickerConfig = sanitizeConfig(channel.config);
  let configVersion = channel.updated_at as string;
  let symbols: string[] = [];
  let stopStream: (() => void) | undefined;
  let alive = true;
  let busy = false;
  let feedGeneration = 0;
  let lastQuoteCache = 0;
  let lastMarket = 0;
  let lastNews = 0;
  let status: FeedStatus = "connecting";
  const baselines = new Map<string, Quote | null>();
  const latest = new Map<string, Quote>();
  const pending = new Map<string, Quote>();
  const dirty = new Set<string>();

  const setStatus = (next: FeedStatus, message?: string) => {
    status = next;
    send({ type: "status", status: next, ...(message ? { message } : {}) });
    void admin
      .from("ticker_relay")
      .update({ status: next, message: message ?? null })
      .eq("id", 1)
      .eq("owner_id", access.instance);
  };

  const record = (quote: Quote) => {
    latest.set(quote.symbol, quote);
    dirty.add(quote.symbol);
  };

  async function startFeed() {
    const generation = ++feedGeneration;
    stopStream?.();
    stopStream = undefined;
    symbols = activeSymbols(config);
    setStatus("connecting");
    void admin.from("ticker_relay").update({ symbols }).eq("id", 1).eq("owner_id", access.instance);
    // REST snapshots give the previous close for daily change and a value to
    // show when the market is closed (no trades arrive then).
    const missing = symbols.filter((symbol) => !baselines.has(symbol));
    const batch: Quote[] = [];
    for (const symbol of missing) {
      if (!alive || generation !== feedGeneration) return;
      try {
        const quote = await provider.quote(symbol);
        baselines.set(symbol, quote);
        if (quote) {
          batch.push(quote);
          record(quote);
        }
      } catch (e) {
        if (e instanceof ProviderError && e.status === 429) {
          setStatus("error", "Finnhub rate limit reached; waiting for live trades");
          await new Promise((r) => setTimeout(r, 1500));
        } else if (e instanceof ProviderError && e.status === 401) {
          setStatus("error", "Finnhub rejected the API key. Check the FINNHUB_API_KEY secret.");
          return;
        }
      }
      if (batch.length >= 8) send({ type: "quotes", quotes: batch.splice(0) });
    }
    const cached = symbols.flatMap((symbol) =>
      latest.has(symbol) && !batch.some((q) => q.symbol === symbol) ? [latest.get(symbol)!] : [],
    );
    send({ type: "quotes", quotes: [...batch, ...cached] });
    if (!alive || generation !== feedGeneration) return;
    const subscribed = new Set(symbols);
    stopStream = provider.stream(
      symbols,
      (trades) => {
        for (const t of trades) {
          if (!subscribed.has(t.s) || !(t.p > 0) || !(t.t > 0)) continue;
          const previous = pending.get(t.s);
          if (previous && previous.timestamp > t.t) continue;
          const baseline = tradeBaseline(baselines.get(t.s) ?? null, t.t);
          pending.set(t.s, withChange(t.s, t.p, t.t, baseline, "trade"));
        }
      },
      (next, message) => setStatus(next, message),
    );
  }

  async function refreshMarket(force = false) {
    if (!force && Date.now() - lastMarket < MARKET_MS) return;
    lastMarket = Date.now();
    try {
      const market = await provider.marketStatus();
      send({ type: "market", market });
      void admin
        .from("ticker_relay")
        .update({ market })
        .eq("id", 1)
        .eq("owner_id", access.instance);
    } catch {
      // Market status is optional decoration; quotes keep flowing without it.
    }
  }

  async function refreshNews(force = false) {
    if (!config.news) return;
    if (!force && Date.now() - lastNews < NEWS_MS) return;
    lastNews = Date.now();
    try {
      send({
        type: "news",
        items: await provider.news(
          config.newsScope,
          symbols.filter((s) => !["SPY", "QQQ", "DIA", "IWM"].includes(s)),
        ),
      });
    } catch {
      // Keep the previous headlines on the overlay.
    }
  }

  async function cacheQuotes() {
    if (Date.now() - lastQuoteCache < QUOTE_CACHE_MS || dirty.size === 0) return;
    lastQuoteCache = Date.now();
    const rows = [...dirty].flatMap((symbol) => {
      const q = latest.get(symbol);
      return q
        ? [
            {
              symbol,
              price: q.price,
              previous_close: q.previousClose,
              quote_time: new Date(q.timestamp).toISOString(),
              source: q.source,
              updated_at: new Date().toISOString(),
            },
          ]
        : [];
    });
    dirty.clear();
    await admin.from("ticker_quotes").upsert(rows);
  }

  const flush = setInterval(() => {
    if (!pending.size) return;
    const quotes = [...pending.values()];
    pending.clear();
    for (const quote of quotes) record(quote);
    send({ type: "quotes", quotes });
  }, FLUSH_MS);

  const heartbeat = setInterval(async () => {
    if (!alive || busy) return;
    busy = true;
    try {
      send({ type: "ping" });
      const { data: lease } = await admin
        .from("ticker_relay")
        .update({ expires_at: new Date(Date.now() + LEASE_MS).toISOString(), status })
        .eq("id", 1)
        .eq("owner_id", access.instance)
        .select("owner_id")
        .maybeSingle();
      if (!lease) {
        send({
          type: "status",
          status: "duplicate",
          message: "Another ticker copy took over the market-data connection.",
        });
        await stop(false);
        close(RelayClose.duplicate, "Lease lost");
        return;
      }
      const { data: row } = await admin
        .from("ticker_channels")
        .select("config, updated_at, overlay_hash")
        .eq("id", access.id)
        .maybeSingle();
      if (!row || row.overlay_hash !== overlayHash) {
        send({ type: "status", status: "error", message: "This overlay link has been replaced." });
        await stop(true);
        close(RelayClose.invalidLink, "Overlay link rotated");
        return;
      }
      if (row.updated_at !== configVersion) {
        configVersion = row.updated_at;
        const previousNews = `${config.news}:${config.newsScope}`;
        config = sanitizeConfig(row.config);
        send({ type: "config", config });
        if (`${config.news}:${config.newsScope}` !== previousNews) void refreshNews(true);
      }
      // Re-evaluated every beat so timed random shuffles take effect too.
      if (activeSymbols(config).join() !== symbols.join()) void startFeed();
      await Promise.all([refreshMarket(), refreshNews(), cacheQuotes()]);
    } catch {
      setStatus("reconnecting", "Relay lost contact with the database");
    } finally {
      busy = false;
    }
  }, HEARTBEAT_MS);

  const rotation = setTimeout(async () => {
    send({ type: "rotate" });
    await stop(false);
    close(RelayClose.rotate, "Rotating relay");
  }, MAX_SECONDS * 1000);

  async function stop(release: boolean) {
    if (!alive) return;
    alive = false;
    feedGeneration++;
    stopStream?.();
    clearInterval(flush);
    clearInterval(heartbeat);
    clearTimeout(rotation);
    lastQuoteCache = 0;
    await cacheQuotes().catch(() => {});
    if (release) {
      await admin
        .from("ticker_relay")
        .update({ status: "offline", message: null, expires_at: new Date().toISOString() })
        .eq("id", 1)
        .eq("owner_id", access.instance);
    }
  }

  await admin
    .from("ticker_relay")
    .update({ started_at: new Date().toISOString(), message: null })
    .eq("id", 1)
    .eq("owner_id", access.instance);
  send({ type: "config", config });
  void refreshMarket(true);
  void startFeed().then(() => refreshNews(true));
  if (isClosed()) await stop(true);
  return stop;
}
