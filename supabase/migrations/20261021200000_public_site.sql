-- The published site address, remembered from the last time the dashboard ran
-- outside a Lovable preview, so links copied inside a preview don't ask OBS
-- for a Lovable login.
ALTER TABLE public.ticker_channels ADD COLUMN IF NOT EXISTS public_site text;
