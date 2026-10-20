import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// Service-role client. Edge Functions receive SUPABASE_URL and the service key
// automatically; nothing here is ever sent to a browser.
function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return keys["default"] ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

const url = Deno.env.get("SUPABASE_URL");
const key = serviceKey();
if (!url || !key)
  throw new Error("SUPABASE_URL and a service key must be available to Edge Functions.");

export const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Access keys are 32 random bytes, base64url-encoded in the browser.
export const keyPattern = /^[A-Za-z0-9_-]{40,100}$/;

export function redact(text: string, secret: string | undefined) {
  return secret ? text.replaceAll(secret, "[redacted]") : text;
}
