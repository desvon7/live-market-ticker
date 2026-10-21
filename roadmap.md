# Roadmap — OBS Stock Ticker

Implementation order: bottom overlay + real Finnhub relay first, then private dashboard; 1920×1080 transparent OBS canvas.

- [ ] Replace fixed ticker cap with Subscribe / Javon Journey branding, preserving feed warnings
- [ ] Add persistent Dark, Light, Apple Glass interface modes and verify switching

- [x] Use the user's connected external Supabase project instead of Lovable Cloud
- [x] Finnhub and Logo.dev keys live only in Supabase Edge Function secrets
- [x] Logo.dev via Edge Function + verified ticker→domain map with dashboard domain/URL overrides
- [x] Swappable market-data provider adapter (`supabase/functions/_shared/finnhub.ts`)
- [x] SPY/QQQ/DIA/IWM labeled as ETFs, never as index values, until index entitlement exists
- [x] Live backend relay while OBS is open (one Finnhub WebSocket per open ticker)
- [x] Relay lease + single-copy coordination in Supabase (`ticker_relay`)
- [x] Reconnecting state when the Finnhub or relay connection drops
- [x] Dashboard warning when a second ticker copy tries to connect on the free plan
- [x] Transparent overlay route for OBS (`/overlay`)
- [x] Private dashboard behind secret link, draft → Apply to stream, presets, restore
- [ ] Index values (S&P 500, Nasdaq Composite, VIX) — needs a provider plan with index data
- [ ] Bitcoin / Ethereum — Finnhub crypto trades work on the free plan, but daily change needs a second data source
- [ ] Bid/ask display and volume- or mover-weighted random picks — need a paid quote plan
- [ ] Uploaded logo files (URL overrides work today)
