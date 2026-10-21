export * from "../../supabase/functions/_shared/market.ts";
import { etDay, type Quote } from "../../supabase/functions/_shared/market.ts";

// Browser-safe settings only: the publishable URL of the Supabase project.
// Provider and logo keys live in Supabase Edge Function secrets.
const supabaseUrl = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").replace(/\/+$/, "");
export const functionsUrl = `${supabaseUrl}/functions/v1`;
export const relayUrl = functionsUrl.replace(/^http/, "ws") + "/ticker-relay";
const publishableKey = String(import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "");

export type Access = { id: string; key: string };

// Secret links carry "<id>.<key>" in the URL fragment, which browsers never
// send to the web host, so the keys stay out of server logs.
export function parseAccess(hash: string): Access | null {
  const match = /^#?([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,100})$/i.exec(hash.trim());
  return match ? { id: match[1] as string, key: match[2] as string } : null;
}

export function accessLink(path: "/overlay" | "/dashboard", access: Access) {
  return `${window.location.origin}${path}#${access.id}.${access.key}`;
}

export function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function logoSrc(
  symbol: string,
  channelId: string,
  overrides: { domains: Record<string, string>; logos: Record<string, string> },
) {
  const custom = overrides.logos[symbol];
  if (custom) return custom;
  const domain = overrides.domains[symbol];
  return `${functionsUrl}/ticker-logo?symbol=${encodeURIComponent(symbol)}&c=${channelId}${domain ? `&d=${encodeURIComponent(domain)}` : ""}`;
}

export async function control<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${functionsUrl}/ticker-control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(publishableKey ? { apikey: publishableKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(data.error ?? `Request failed (${response.status})`), {
      status: response.status,
      data,
    });
  return data;
}

const priceFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatPrice(price: number) {
  return price >= 1 ? priceFormat.format(price) : price.toPrecision(3);
}
export function formatChange(quote: Quote) {
  if (quote.change === null || quote.percent === null) return null;
  const sign = quote.change > 0 ? "+" : quote.change < 0 ? "−" : "";
  return {
    abs: `${sign}${priceFormat.format(Math.abs(quote.change))}`,
    pct: `${sign}${Math.abs(quote.percent).toFixed(2)}%`,
  };
}
// Times from today show just the clock; older ones also name the day, so a
// Friday close seen on Monday doesn't read like a fresh price.
export function formatTime(timestamp: number, now = Date.now()) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  if (etDay(timestamp) === etDay(now)) return `${time} ET`;
  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
  return `${day}, ${time} ET`;
}
