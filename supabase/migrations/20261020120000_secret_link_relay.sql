-- Secret-link access: the dashboard and overlay authenticate with long random
-- keys (stored only as SHA-256 hashes). Only Edge Functions using the service
-- role read or write these tables.
ALTER TABLE public.ticker_channels ALTER COLUMN user_id DROP NOT NULL;
DROP POLICY IF EXISTS "Owners read their channel" ON public.ticker_channels;
REVOKE ALL ON public.ticker_channels FROM anon, authenticated;

-- One ticker per Supabase project (the free Finnhub plan allows one stream).
-- This also makes "create" first-come-only, so a stranger cannot add a second one.
CREATE UNIQUE INDEX IF NOT EXISTS ticker_channels_singleton ON public.ticker_channels ((true));

ALTER TABLE public.ticker_relay ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.ticker_relay ADD COLUMN IF NOT EXISTS market jsonb;
ALTER TABLE public.ticker_relay ADD COLUMN IF NOT EXISTS symbols text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.ticker_relay ADD COLUMN IF NOT EXISTS started_at timestamptz;
REVOKE ALL ON public.ticker_relay FROM anon, authenticated;

-- Last quote the relay saw per symbol, so the dashboard preview can show real
-- values without opening a second Finnhub connection.
CREATE TABLE IF NOT EXISTS public.ticker_quotes (
  symbol text PRIMARY KEY,
  price double precision NOT NULL,
  previous_close double precision,
  quote_time timestamptz NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticker_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticker_quotes FROM anon, authenticated;
GRANT ALL ON public.ticker_quotes TO service_role;
CREATE POLICY "Only trusted relay service" ON public.ticker_quotes FOR ALL TO service_role USING (true) WITH CHECK (true);
