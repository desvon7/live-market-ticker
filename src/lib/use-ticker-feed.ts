import { useEffect, useRef, useState } from "react";
import {
  type Access,
  type FeedEvent,
  type FeedStatus,
  type MarketSession,
  type NewsItem,
  type Quote,
  RelayClose,
  sanitizeConfig,
  relayUrl,
  type TickerConfig,
  tradeBaseline,
  withChange,
} from "./market";

const SPARK_POINTS = 40;
const SPARK_INTERVAL = 30_000;

export type FeedState = {
  config: TickerConfig | null;
  quotes: Record<string, Quote>;
  sparks: Record<string, number[]>;
  status: FeedStatus;
  message: string | null;
  market: MarketSession | null;
  news: NewsItem[];
};

function instanceId() {
  // Survives a reload of the same OBS source so it can reclaim its own lease.
  try {
    const existing = sessionStorage.getItem("ticker-instance");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("ticker-instance", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// One relay WebSocket per open overlay. Quotes are kept across reconnects so the
// ticker never blanks; the status says when they stop being live.
export function useTickerFeed(access: Access | null): FeedState {
  const [state, setState] = useState<FeedState>({
    config: null,
    quotes: {},
    sparks: {},
    status: "connecting",
    message: null,
    market: null,
    news: [],
  });
  const sparkTimes = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!access) return;
    const instance = instanceId();
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;
    let rotating = false;
    // Newest copy wins: only this page's first connection may take the
    // connection from another copy, so two open copies never fight over it.
    let takeover = true;
    let silentTimer: ReturnType<typeof setTimeout> | undefined;

    const patch = (next: Partial<FeedState> | ((s: FeedState) => Partial<FeedState>)) =>
      setState((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) }));

    const mergeQuotes = (incoming: Quote[]) =>
      patch((s) => {
        const quotes = { ...s.quotes };
        let sparks = s.sparks;
        for (const q of incoming) {
          const existing = quotes[q.symbol];
          if (existing && existing.timestamp > q.timestamp) continue;
          const previousClose = q.previousClose ?? tradeBaseline(existing ?? null, q.timestamp);
          quotes[q.symbol] =
            q.previousClose === null && previousClose !== null
              ? withChange(q.symbol, q.price, q.timestamp, previousClose, q.source)
              : q;
          // Sparkline: one point per 30 s from what this overlay has seen.
          const last = sparkTimes.current[q.symbol] ?? 0;
          if (q.timestamp - last >= SPARK_INTERVAL || !sparks[q.symbol]) {
            sparkTimes.current[q.symbol] = q.timestamp;
            sparks = {
              ...sparks,
              [q.symbol]: [...(sparks[q.symbol] ?? []), q.price].slice(-SPARK_POINTS),
            };
          }
        }
        return { quotes, sparks };
      });

    const schedule = (delay: number) => {
      if (stopped) return;
      retry = setTimeout(connect, delay);
    };

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(relayUrl);
      socket = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({ type: "hello", id: access!.id, key: access!.key, instance, takeover }),
        );
        takeover = false;
      };
      ws.onmessage = (event) => {
        let data: FeedEvent;
        try {
          data = JSON.parse(String(event.data)) as FeedEvent;
        } catch {
          return;
        }
        switch (data.type) {
          case "config":
            patch({ config: sanitizeConfig(data.config) });
            break;
          case "quotes":
            attempts = 0;
            mergeQuotes(data.quotes);
            break;
          case "status":
            if (silentTimer && data.status === "connected") clearTimeout(silentTimer);
            patch({ status: data.status, message: data.message ?? null });
            break;
          case "market":
            patch({ market: data.market });
            break;
          case "news":
            patch({ news: data.items });
            break;
          case "rotate":
            rotating = true;
            break;
        }
      };
      ws.onclose = (event) => {
        if (socket !== ws || stopped) return;
        if (rotating || event.code === RelayClose.rotate) {
          // Planned hand-over: reconnect at once and only surface it if slow.
          rotating = false;
          silentTimer = setTimeout(
            () => patch({ status: "reconnecting", message: "Reconnecting to the market relay" }),
            4000,
          );
          return schedule(150);
        }
        if (event.code === RelayClose.invalidLink) return patch({ status: "error" });
        if (event.code === RelayClose.duplicate) {
          patch({ status: "duplicate" });
          return schedule(15_000);
        }
        patch((s) => ({
          status: "reconnecting",
          message:
            s.status === "error" && s.message ? s.message : "Reconnecting to the market relay",
        }));
        schedule(Math.min(30_000, 1000 * 2 ** attempts++));
      };
    }

    // Last known config and quotes let a reloaded overlay draw immediately,
    // clearly marked as connecting/offline until the relay answers.
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(access.id)) ?? "null") as {
        config?: unknown;
        quotes?: Record<string, Quote>;
      } | null;
      if (cached?.config)
        patch({ config: sanitizeConfig(cached.config), quotes: cached.quotes ?? {} });
    } catch {
      // no cache
    }

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (silentTimer) clearTimeout(silentTimer);
      socket?.close(1000, "Overlay closed");
    };
  }, [access?.id, access?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!access) return;
    const save = () => {
      try {
        const { config, quotes } = latest.current;
        if (config) localStorage.setItem(cacheKey(access.id), JSON.stringify({ config, quotes }));
      } catch {
        // storage unavailable
      }
    };
    const timer = setInterval(save, 30_000);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [access?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

const cacheKey = (id: string) => `ticker-cache:${id}`;
