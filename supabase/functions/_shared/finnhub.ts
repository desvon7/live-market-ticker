// Finnhub market-data adapter. Only Edge Functions import this, so the API key
// stays server-side. Swap this module to change providers; the overlay only
// sees the normalized Quote/NewsItem/MarketSession shapes.
import { type MarketSession, type NewsItem, type Quote, withChange } from "./market.ts";
import { redact } from "./db.ts";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function finnhub(apiKey: string) {
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(`https://finnhub.io/api/v1/${path}`, {
      headers: { "X-Finnhub-Token": apiKey },
    });
    if (!response.ok) {
      const detail = redact((await response.text()).slice(0, 200), apiKey);
      throw new ProviderError(
        response.status === 429
          ? "Finnhub rate limit reached"
          : `Finnhub ${response.status}: ${detail}`,
        response.status,
      );
    }
    return response.json() as Promise<T>;
  }

  return {
    async quote(symbol: string): Promise<Quote | null> {
      const q = await get<{ c: number; pc: number; t: number }>(
        `quote?symbol=${encodeURIComponent(symbol)}`,
      );
      if (!(q.c > 0) || !(q.t > 0)) return null;
      return withChange(symbol, q.c, q.t * 1000, q.pc > 0 ? q.pc : null, "snapshot");
    },

    async marketStatus(): Promise<MarketSession> {
      const m = await get<{ isOpen: boolean; session: string | null; holiday: string | null }>(
        "stock/market-status?exchange=US",
      );
      const session =
        m.session === "pre-market" || m.session === "regular" || m.session === "post-market"
          ? m.session
          : "closed";
      return { isOpen: !!m.isOpen, session, holiday: m.holiday ?? null, checkedAt: Date.now() };
    },

    async news(scope: "general" | "selected", symbols: string[]): Promise<NewsItem[]> {
      type Row = {
        id: number;
        headline: string;
        source: string;
        datetime: number;
        url: string;
        related?: string;
      };
      const tidy = (rows: Row[]) =>
        rows
          .filter((r) => r.headline && r.datetime)
          .map((r) => ({
            id: r.id,
            headline: r.headline.trim(),
            source: r.source,
            datetime: r.datetime,
            url: r.url,
            related: r.related ?? "",
          }));
      if (scope === "general") return tidy(await get<Row[]>("news?category=general")).slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
      const rows: NewsItem[] = [];
      for (const symbol of symbols.slice(0, 5)) {
        rows.push(
          ...tidy(
            await get<Row[]>(
              `company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`,
            ),
          ).slice(0, 3),
        );
      }
      return rows.sort((a, b) => b.datetime - a.datetime).slice(0, 10);
    },

    // One upstream WebSocket per call. Reconnects with backoff until stop() is called.
    stream(
      symbols: string[],
      onTrades: (trades: { s: string; p: number; t: number }[]) => void,
      onStatus: (status: "connected" | "reconnecting" | "error", message?: string) => void,
    ) {
      let stopped = false;
      let socket: WebSocket | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;
      const schedule = (message: string) => {
        if (stopped || retry !== undefined) return;
        onStatus("reconnecting", message);
        retry = setTimeout(
          () => {
            retry = undefined;
            open();
          },
          Math.min(30_000, 1000 * 2 ** attempts++),
        );
      };
      const open = () => {
        if (stopped) return;
        const ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}`);
        socket = ws;
        ws.onopen = () => {
          attempts = 0;
          for (const symbol of symbols) ws.send(JSON.stringify({ type: "subscribe", symbol }));
          onStatus("connected");
        };
        ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(String(event.data));
            if (packet.type === "trade" && Array.isArray(packet.data)) onTrades(packet.data);
            else if (packet.type === "error")
              onStatus(
                "error",
                redact(String(packet.msg ?? "Finnhub rejected a subscription"), apiKey),
              );
          } catch {
            onStatus("error", "Unreadable market-data message");
          }
        };
        ws.onerror = () => ws.close();
        ws.onclose = () => {
          if (socket === ws) schedule("Reconnecting to Finnhub");
        };
      };
      open();
      return () => {
        stopped = true;
        if (retry !== undefined) clearTimeout(retry);
        try {
          socket?.close();
        } catch {
          // already closed
        }
      };
    },
  };
}
