-- ============================================================================
-- 263_telegram_bot_safe.sql
-- Version safe de la migration Telegram :
-- - Sépare les CREATE TABLE des dépendances optionnelles (vw_tax_calendar)
-- - Wrap les RLS policies en DROP IF EXISTS pour idempotence
-- - Wrap le seed et la vue en DO/EXCEPTION
-- - Wrap les triggers en DROP IF EXISTS
--
-- À exécuter même si 262_telegram_bot.sql a échoué : tout est idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. telegram_users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_users (
  chat_id            BIGINT       PRIMARY KEY,
  user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_societe_id UUID                  REFERENCES public.societes(id) ON DELETE SET NULL,
  telegram_username  TEXT,
  telegram_firstname TEXT,
  telegram_lastname  TEXT,
  verified           BOOLEAN      NOT NULL DEFAULT false,
  verification_code  TEXT,
  verification_expires_at TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  language_code      TEXT         NOT NULL DEFAULT 'fr',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_user_id      ON public.telegram_users(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_societe_id   ON public.telegram_users(current_societe_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_verification ON public.telegram_users(verification_code) WHERE verification_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. telegram_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
  id          BIGSERIAL    PRIMARY KEY,
  chat_id     BIGINT       NOT NULL REFERENCES public.telegram_users(chat_id) ON DELETE CASCADE,
  societe_id  UUID                  REFERENCES public.societes(id) ON DELETE CASCADE,
  role        TEXT         NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content     TEXT,
  tool_name   TEXT,
  tool_input  JSONB,
  tool_output JSONB,
  tokens_in   INT,
  tokens_out  INT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id_time ON public.telegram_sessions(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_societe_id  ON public.telegram_sessions(societe_id);

-- ----------------------------------------------------------------------------
-- 3. telegram_actions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_actions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     BIGINT       NOT NULL,
  user_id     UUID                  REFERENCES auth.users(id),
  societe_id  UUID                  REFERENCES public.societes(id),
  intent      TEXT         NOT NULL,
  payload     JSONB,
  result      JSONB,
  status      TEXT         NOT NULL CHECK (status IN ('success', 'denied', 'error', 'pending')),
  error_msg   TEXT,
  duration_ms INT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_actions_societe_time ON public.telegram_actions(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_actions_intent       ON public.telegram_actions(intent);
CREATE INDEX IF NOT EXISTS idx_telegram_actions_status       ON public.telegram_actions(status);

-- ----------------------------------------------------------------------------
-- 4. telegram_alerts_config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_alerts_config (
  societe_id          UUID         PRIMARY KEY REFERENCES public.societes(id) ON DELETE CASCADE,
  enable_mra_deadlines     BOOLEAN NOT NULL DEFAULT true,
  mra_deadline_advance_days INT    NOT NULL DEFAULT 7,
  enable_leave_requests    BOOLEAN NOT NULL DEFAULT true,
  enable_leave_approvals   BOOLEAN NOT NULL DEFAULT true,
  enable_low_balance       BOOLEAN NOT NULL DEFAULT true,
  low_balance_threshold_mur NUMERIC(14,2) NOT NULL DEFAULT 50000,
  enable_invoice_overdue   BOOLEAN NOT NULL DEFAULT true,
  invoice_overdue_days     INT     NOT NULL DEFAULT 30,
  enable_daily_digest      BOOLEAN NOT NULL DEFAULT false,
  daily_digest_time        TIME    NOT NULL DEFAULT '08:00',
  enable_weekly_kpis       BOOLEAN NOT NULL DEFAULT false,
  weekly_kpis_day          INT     NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- RLS — idempotent (DROP POLICY IF EXISTS + CREATE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.telegram_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_alerts_config  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_users_self_select ON public.telegram_users;
CREATE POLICY telegram_users_self_select ON public.telegram_users
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS telegram_users_self_update ON public.telegram_users;
CREATE POLICY telegram_users_self_update ON public.telegram_users
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Policies utilisant user_societes : on les wrap pour ne pas planter si la table
-- a un nom/colonne différent (sera créé/réessayé manuellement si nécessaire)
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS telegram_sessions_societe_select ON public.telegram_sessions';
  EXECUTE 'CREATE POLICY telegram_sessions_societe_select ON public.telegram_sessions
    FOR SELECT USING (
      societe_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_societes us
        WHERE us.user_id = auth.uid() AND us.societe_id = telegram_sessions.societe_id
      )
    )';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped telegram_sessions_societe_select policy (user_societes missing or different schema): %', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS telegram_actions_societe_select ON public.telegram_actions';
  EXECUTE 'CREATE POLICY telegram_actions_societe_select ON public.telegram_actions
    FOR SELECT USING (
      societe_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_societes us
        WHERE us.user_id = auth.uid() AND us.societe_id = telegram_actions.societe_id
      )
    )';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped telegram_actions_societe_select policy: %', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS telegram_alerts_config_societe_all ON public.telegram_alerts_config';
  EXECUTE 'CREATE POLICY telegram_alerts_config_societe_all ON public.telegram_alerts_config
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.user_societes us
        WHERE us.user_id = auth.uid() AND us.societe_id = telegram_alerts_config.societe_id
      )
    )';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped telegram_alerts_config_societe_all policy: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- Trigger updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_users_touch ON public.telegram_users;
CREATE TRIGGER trg_telegram_users_touch BEFORE UPDATE ON public.telegram_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_telegram_alerts_config_touch ON public.telegram_alerts_config;
CREATE TRIGGER trg_telegram_alerts_config_touch BEFORE UPDATE ON public.telegram_alerts_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- RPC : génère un code de vérification 6-chars one-shot
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.telegram_generate_verification_code(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := upper(translate(
    substring(md5(random()::text || clock_timestamp()::text), 1, 6),
    '01l',
    'XYZ'
  ));

  INSERT INTO public.telegram_users (chat_id, user_id, verification_code, verification_expires_at, verified)
  VALUES (-abs(hashtext(p_user_id::text || v_code))::bigint, p_user_id, v_code, now() + interval '15 minutes', false)
  ON CONFLICT (chat_id) DO UPDATE
    SET verification_code = EXCLUDED.verification_code,
        verification_expires_at = EXCLUDED.verification_expires_at,
        verified = false;

  RETURN v_code;
END;
$$;

-- Permet à n'importe quel user authentifié d'appeler la fonction
GRANT EXECUTE ON FUNCTION public.telegram_generate_verification_code(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Seed config par défaut (wrappé pour pas planter si societes a une structure inattendue)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'INSERT INTO public.telegram_alerts_config (societe_id)
           SELECT id FROM public.societes
           ON CONFLICT (societe_id) DO NOTHING';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Seed telegram_alerts_config skipped: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- Vue MRA alerts — wrappée car dépend de vw_tax_calendar (mig 260) qui peut manquer
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE $sql$
    CREATE OR REPLACE VIEW public.vw_telegram_mra_alerts AS
    SELECT
      tc.societe_id,
      tc.echeance_type,
      tc.reference,
      tc.date_echeance,
      tc.statut,
      (tc.date_echeance - CURRENT_DATE) AS days_until,
      s.nom AS societe_nom,
      cfg.mra_deadline_advance_days,
      cfg.enable_mra_deadlines
    FROM public.vw_tax_calendar tc
    JOIN public.societes s ON s.id = tc.societe_id
    LEFT JOIN public.telegram_alerts_config cfg ON cfg.societe_id = tc.societe_id
    WHERE tc.statut IN ('a_faire', 'en_attente', 'overdue')
      AND tc.date_echeance >= CURRENT_DATE - INTERVAL '30 days'
  $sql$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'View vw_telegram_mra_alerts not created (vw_tax_calendar likely missing): %', SQLERRM;
END $$;

COMMENT ON TABLE public.telegram_users         IS 'Mapping Telegram chat_id ↔ user Lexora ↔ société active.';
COMMENT ON TABLE public.telegram_sessions      IS 'Mémoire conversationnelle de l''AI Agent.';
COMMENT ON TABLE public.telegram_actions       IS 'Audit log des actions exécutées par le bot.';
COMMENT ON TABLE public.telegram_alerts_config IS 'Configuration des alertes proactives par société.';
