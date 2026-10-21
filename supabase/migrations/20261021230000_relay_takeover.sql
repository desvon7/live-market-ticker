-- Newest overlay wins: a freshly opened overlay may take the single Finnhub
-- connection from an older or forgotten copy (that copy then pauses), so a
-- hidden duplicate source or a stale lease can never leave OBS blank.
DROP FUNCTION IF EXISTS public.claim_ticker_relay(uuid, uuid);
CREATE OR REPLACE FUNCTION public.claim_ticker_relay(p_channel uuid, p_owner uuid, p_force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed boolean; previous uuid; live boolean;
BEGIN
  INSERT INTO public.ticker_relay (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT owner_id, expires_at > now() INTO previous, live FROM public.ticker_relay WHERE id = 1 FOR UPDATE;
  UPDATE public.ticker_relay
     SET channel_id = p_channel, owner_id = p_owner, expires_at = now() + interval '45 seconds', status = 'connecting',
         duplicate_at = CASE WHEN live AND previous IS DISTINCT FROM p_owner THEN now() ELSE duplicate_at END
   WHERE id = 1 AND (p_force OR NOT live OR owner_id = p_owner);
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF NOT claimed THEN UPDATE public.ticker_relay SET duplicate_at = now() WHERE id = 1; END IF;
  RETURN claimed;
END; $$;
REVOKE ALL ON FUNCTION public.claim_ticker_relay(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ticker_relay(uuid, uuid, boolean) TO service_role;
