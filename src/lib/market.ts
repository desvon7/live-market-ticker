export * from "../../supabase/functions/_shared/market.ts";
import type { Quote } from "../../supabase/functions/_shared/market.ts";

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

// The overlay key is stored on the server encrypted with the dashboard key
// (AES-GCM, key = SHA-256 of the dashboard key), so every device with the
// dashboard link can show the overlay link and the server can't read it.
const toB64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function sealingKey(controlKey: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ticker-overlay-seal:${controlKey}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealOverlayKey(controlKey: string, overlayKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await sealingKey(controlKey),
      new TextEncoder().encode(overlayKey),
    ),
  );
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return toB64url(out);
}
export async function openOverlayKey(controlKey: string, sealed: string) {
  try {
    const bytes = fromB64url(sealed);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await sealingKey(controlKey),
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function randomKey() {
  return toB64url(crypto.getRandomValues(new Uint8Array(32)));
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
export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}
export function formatTime(timestamp: number) {
  return (
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET"
  );
}
