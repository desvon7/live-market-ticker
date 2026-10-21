# Live Market Ticker

A broadcast-style stock ticker for the bottom of an OBS scene, with a private dashboard that controls it.

- **`/overlay#<id>.<overlay key>`**: a transparent 1920 × 1080 page for an OBS Browser Source. It shows only the ticker.
- **`/dashboard#<id>.<dashboard key>`**: a private control panel. You edit a draft, preview it, then press **Apply to stream**. It also has presets, restore-previous, pause/resume/reset, and a duplicate-copy warning.
- **`/`**: one-time setup. It creates the ticker and shows the two secret links.

This project was built with [Lovable](https://lovable.dev) and syncs with the [Lovable editor](https://lovable.dev/projects/57207cd6-1c82-4baf-a670-97d442b45f5d).

## Architecture

```
OBS Browser Source ──wss──▶ Supabase Edge Function  ticker-relay ──wss──▶ Finnhub trades
      (/overlay)                  │  lease + config + quote cache               + REST quote / market status / news
                                  ▼
Dashboard (/dashboard) ──https──▶ ticker-control ──▶ Postgres: ticker_channels, ticker_relay, ticker_quotes
<img> logos ──────────────https──▶ ticker-logo ──▶ Logo.dev (key stays server-side)
```

- **Secrets stay in Supabase.** `FINNHUB_API_KEY` and `LOGO_DEV_PUBLISHABLE_KEY` are Edge Function secrets. The browser bundle only contains the public Supabase URL and publishable key.
- **The relay runs only while OBS has the overlay open.** Each open overlay gets its own relay connection, and each relay opens one Finnhub WebSocket. When the overlay closes, the Finnhub socket closes and the lease is released.
- **Single-copy lease.** The free Finnhub plan allows one WebSocket per key. Row 1 of `ticker_relay` is a 45-second lease, renewed every 5 seconds. If a second overlay copy connects, it gets a `duplicate` status and retries every 15 seconds. The dashboard shows a warning when that happens.
- **Worker hand-over.** Supabase Edge Functions have a wall-clock limit: 150 s on the Free plan, 400 s on paid plans ([limits](https://supabase.com/docs/guides/functions/limits)). The relay sends `rotate` at `RELAY_MAX_SECONDS` (default 140) and keeps its lease, and the overlay reconnects immediately. Quotes stay on screen during the hand-over. "Reconnecting" only appears if the hand-over takes longer than 4 seconds.
- **Config sync.** The dashboard writes the config to `ticker_channels`. The relay checks it every 5 seconds and pushes changes to the overlay, so OBS never needs a reload. If the set of symbols changes, the relay resubscribes.
- **Secret links.** Keys are 32 random bytes generated in the browser and stored only as SHA-256 hashes. They sit in the URL fragment (`#…`), which browsers never send to the web host. The overlay key can only display the ticker. The dashboard key can change it. Either key can be replaced from **Links & OBS**.

Code map:

| Module | Path |
| --- | --- |
| Stock registry, sectors, modes, config sanitizer (shared by Deno and the browser) | `supabase/functions/_shared/market.ts` |
| Market-data adapter (Finnhub) | `supabase/functions/_shared/finnhub.ts` |
| Relay / connection manager | `supabase/functions/ticker-relay/index.ts` |
| Config, presets, health API | `supabase/functions/ticker-control/index.ts` |
| Logo resolver | `supabase/functions/ticker-logo/index.ts` |
| Overlay renderer + animation engine | `src/components/ticker/TickerBar.tsx` |
| Overlay feed client (reconnect, cache) | `src/lib/use-ticker-feed.ts` |
| Pages | `src/routes/index.tsx`, `overlay.tsx`, `dashboard.tsx` |
| Database | `supabase/migrations/` |

## Deploy

You need the [Supabase CLI](https://supabase.com/docs/guides/cli), a [Finnhub](https://finnhub.io) API key, and a [Logo.dev](https://logo.dev) publishable key (`pk_…`).

```sh
# 1. Link the repo to your Supabase project
supabase login
supabase link --project-ref xghyvoojqntijrdkdliv

# 2. Database: lets the dashboard use secret links, adds the single-ticker lock and the quote cache
supabase db push
#    If it reports that 20261020030325 already exists remotely but isn't recorded, run:
#    supabase migration repair --status applied 20261020030325 && supabase db push

# 3. Secrets (server-side only)
supabase secrets set FINNHUB_API_KEY=xxxx LOGO_DEV_PUBLISHABLE_KEY=pk_xxxx
#    Paid Supabase plan? Allow longer relay sessions:
#    supabase secrets set RELAY_MAX_SECONDS=390

# 4. Edge Functions (supabase/config.toml sets verify_jwt = false; each one checks its own secret-link keys)
supabase functions deploy ticker-relay
supabase functions deploy ticker-control
supabase functions deploy ticker-logo
```

5. **Frontend:** in Lovable, click **Publish** (or **Share → Publish**). Commits pushed to `main` sync into Lovable first. If you previously added `FINNHUB_API_KEY` or `LOGO_DEV_PUBLISHABLE_KEY` as Lovable secrets, delete them there; the app no longer reads them.
6. Open the published site's `/` page right away and click **Create my ticker**. Save both links in a password manager. Only one ticker can exist per project, so nobody else can create one after you. To also lock the setup page before you get to it, set `TICKER_SETUP_CODE`.

Lost both links? Run `delete from public.ticker_channels;` in the Supabase SQL editor, then create the ticker again. (Leave `ticker_relay` alone: its single row is the connection lock.)

## OBS setup

1. In OBS, open **Sources → + → Browser**.
2. **URL:** paste the overlay link (`https://<your-site>/overlay#…`). Use the **published** site's address. Lovable's editor preview addresses (`id-preview--….lovable.app`, `….lovableproject.com`) ask for a Lovable login, which OBS can't get past. Once the dashboard has been opened on the published site, links copied anywhere (even in the preview) use that address automatically; `VITE_PUBLIC_SITE_URL` pins it explicitly. The overlay page and the Edge Functions need no login.
3. **Width 1920, Height 1080.** Leave Custom CSS empty; the page is already transparent outside the ticker.
4. Turn **off** "Shutdown source when not visible" so the ticker stays connected. You can turn on "Refresh browser when scene becomes active", but it isn't needed.
5. The strip sits flush with the bottom of the 1920 × 1080 canvas. Leave the source at 0,0 with no scaling. To keep a webcam corner clear, set **Appearance → Safe area** in the dashboard.
6. Layering: put the Browser Source above your background or gameplay and below any graphics that should cover the ticker.
7. **Use only one Browser Source with this link.** To show it in other scenes, use right-click → Copy, then **Paste (Reference)**. A duplicated source counts as a second connection, gets paused, and triggers the dashboard warning.
8. Check the feed: the left cap should read **Market open · Live trades** during market hours. Outside market hours it reads **Market closed · Last trade <time> ET**.
9. Test reconnects: disable and re-enable the source, or toggle your network. The cap should switch to **Reconnecting** and then recover without blanking the prices.
10. Open the dashboard on another monitor, change the mode or sector, and click **Apply to stream**. The ticker updates within about 5 seconds.
11. Before going live, run it for 30 minutes or more. Quotes should keep updating across several relay hand-overs (every ~140 s on the Free plan).

## Data, labeling and licensing

- **Quotes:** Finnhub's free plan provides US stock and ETF trades over WebSocket (up to 50 symbols) and a REST `quote` call for the previous close and last price. The ticker says **Live trades** only when a trade arrived in the last minute. Otherwise it shows the time of the last trade. Prices older than 15 minutes are dimmed.
- **ETFs vs. indices:** SPY, QQQ, DIA and IWM always carry an `ETF` badge and show the ETF's share price. Index values (S&P 500, Nasdaq Composite, VIX) need a data plan that includes indices and are not faked.
- **News:** these are Finnhub general or company headlines, shown with their source and publication time, refreshed every 5 minutes. Nothing is generated by this app.
- **Logos:** they come from Logo.dev, using a verified ticker→domain map in `_shared/market.ts`. You can override the domain or set an https logo URL in **Logos**. Unknown symbols show their initials rather than a guessed logo. Check that your Finnhub and Logo.dev plans permit display on a public or commercial stream (Logo.dev's free tier requires attribution).

## API contracts

`ticker-relay` (WebSocket). The client sends `{type:"hello", id, key, instance}` once. The server then sends:
`config`, `quotes` (batched every 400 ms), `status` (`connecting | connected | reconnecting | duplicate | error | offline`), `market`, `news`, `rotate`, and `ping`.
Close codes: `4000` rotate (reconnect now), `4001` bad hello, `4003` invalid or replaced link (stop), `4009` duplicate copy (retry in 15 s), `4503` backend not configured.

`ticker-control` (POST JSON). Actions: `create`, `read`, `status`, `apply`, `restore`, `preset`, `deletePreset`, `rotate`. See the header comment in `supabase/functions/ticker-control/index.ts`.

`ticker-logo` (GET). `?symbol=NVDA&c=<ticker id>` returns the logo image, or 404 when no verified domain exists.

## Development

```sh
bun install          # or npm i
bun run dev          # web app at http://localhost:8080
bun run test         # unit + routing tests
bun run build
supabase functions serve   # Edge Functions locally (needs Docker); put secrets in supabase/functions/.env
```

See `.env.example` and `supabase/functions/.env.example`.
