-- =====================================================================
-- SEC-005 — Anti-replay nonce store for HMAC-signed internal requests.
--
-- Backs `lib/security/hmac-auth.ts :: registerNonce()`. Each incoming
-- /api/telegram/internal/* request must carry a unique X-Lex-Nonce ;
-- the server attempts to INSERT it here, and a PK conflict means the
-- request is a replay and must be rejected.
--
-- Window contract :
--   - Caller timestamp must be within ±5 min of server clock.
--   - We keep nonces for 15 min (3× the window) as a safety margin
--     against clock drift between Vercel edges.
--
-- Hardened : RLS enabled, no policies ⇒ only the service-role key can
-- read/write this table. Never expose via anon/authenticated keys.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.telegram_hmac_nonces (
  nonce       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_hmac_nonces_created
  ON public.telegram_hmac_nonces (created_at);

-- ---------------------------------------------------------------------
-- Cleanup function — removes nonces older than 15 minutes.
-- The replay window is 5 minutes (see HMAC_ALLOWED_SKEW_MS) ; we keep
-- 3× that as a margin for clock skew and to avoid races where a valid
-- but slightly-late request finds its nonce already purged.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_telegram_hmac_nonces()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.telegram_hmac_nonces
  WHERE created_at < NOW() - INTERVAL '15 minutes';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_telegram_hmac_nonces() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- pg_cron schedule (uncomment after verifying pg_cron is enabled on the
-- project). Runs every 5 minutes.
-- ---------------------------------------------------------------------
-- SELECT cron.schedule(
--   'purge-telegram-hmac-nonces',
--   '*/5 * * * *',
--   $$ SELECT public.purge_old_telegram_hmac_nonces(); $$
-- );

-- ---------------------------------------------------------------------
-- RLS : lock down. Only service-role bypasses RLS in Supabase, so with
-- no policies declared, no anon/authenticated client can read or write.
-- ---------------------------------------------------------------------
ALTER TABLE public.telegram_hmac_nonces ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  public.telegram_hmac_nonces IS
  'SEC-005 anti-replay store for HMAC-signed /api/telegram/internal/* requests. Service-role only.';
COMMENT ON COLUMN public.telegram_hmac_nonces.nonce      IS '32-hex-char (16 random bytes) nonce from X-Lex-Nonce header.';
COMMENT ON COLUMN public.telegram_hmac_nonces.created_at IS 'Insert timestamp ; purged after 15 minutes.';
