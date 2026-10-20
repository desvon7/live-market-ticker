# Roadmap — OBS Stock Ticker

- [x] Use the user's connected external Supabase project instead of Lovable Cloud
- [x] Add Finnhub API key secret
- [ ] Connect Logo.dev + verified ticker→domain map with dashboard overrides
- [ ] Swappable market-data provider adapter (Finnhub now, Polygon/Massive later; overlay untouched)
- [ ] SPY/QQQ/DIA/IWM labeled as ETFs, never as index values, until index entitlement exists
- [x] Confirm WebSocket hosting choice: Option 1, live backend relay while OBS is open
- [ ] Implement relay lifetime and single-copy coordination using connected Supabase
- [ ] Show reconnecting state when the Finnhub connection drops
- [ ] Warn the dashboard when a second ticker copy tries to connect on the free plan
- [ ] Transparent overlay route for OBS
- [ ] Private dashboard behind secret link, live-synced to overlay
