// Logo resolver: GET ?symbol=NVDA[&c=<ticker id>] → company logo image.
// Domains come from the verified registry or the dashboard's per-symbol
// override; the Logo.dev key stays here and never reaches the browser.
// Only those domains are fetched, so this is not an open image proxy.
import { admin, uuidPattern } from "../_shared/db.ts";
import { corsHeaders } from "../_shared/http.ts";
import { logoDomain, normalizeSymbol, sanitizeConfig } from "../_shared/market.ts";

const notFound = (status = 404) =>
  new Response(null, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const params = new URL(req.url).searchParams;
  const symbol = normalizeSymbol(params.get("symbol"));
  if (!symbol) return notFound(400);
  const channel = params.get("c") ?? "";
  let domains: Record<string, string> = {};
  if (uuidPattern.test(channel)) {
    const { data } = await admin
      .from("ticker_channels")
      .select("config")
      .eq("id", channel)
      .maybeSingle();
    if (data) domains = sanitizeConfig(data.config).domains;
  }
  const domain = logoDomain(symbol, { domains });
  if (!domain) return notFound();
  const token = Deno.env.get("LOGO_DEV_PUBLISHABLE_KEY");
  if (!token) return notFound(503);
  const upstream = await fetch(
    `https://img.logo.dev/${domain}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true&fallback=404`,
  );
  if (!upstream.ok) return notFound(upstream.status === 404 ? 404 : 502);
  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
});
