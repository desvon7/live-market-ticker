-- The overlay key, encrypted in the browser with the dashboard key, so any
-- device that has the dashboard link can show the overlay link. The server
-- cannot decrypt it.
ALTER TABLE public.ticker_channels ADD COLUMN IF NOT EXISTS overlay_sealed text;
