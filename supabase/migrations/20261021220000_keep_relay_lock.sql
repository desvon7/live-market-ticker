-- Deleting the ticker (to start over) used to cascade-delete the relay lock
-- row, after which no overlay could ever connect. Keep the row instead.
ALTER TABLE public.ticker_relay DROP CONSTRAINT IF EXISTS ticker_relay_channel_id_fkey;
ALTER TABLE public.ticker_relay
  ADD CONSTRAINT ticker_relay_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.ticker_channels(id) ON DELETE SET NULL;
INSERT INTO public.ticker_relay (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Recreate the lock row on demand too, in case it was removed by hand.
CREATE OR REPLACE FUNCTION public.claim_ticker_relay(p_channel uuid, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed boolean;
BEGIN
  INSERT INTO public.ticker_relay (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  UPDATE public.ticker_relay
     SET channel_id = p_channel, owner_id = p_owner, expires_at = now() + interval '45 seconds', status = 'connecting'
   WHERE id = 1 AND (expires_at <= now() OR owner_id = p_owner);
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF NOT claimed THEN UPDATE public.ticker_relay SET duplicate_at = now() WHERE id = 1; END IF;
  RETURN claimed;
END; $$;
REVOKE ALL ON FUNCTION public.claim_ticker_relay(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ticker_relay(uuid, uuid) TO service_role;
