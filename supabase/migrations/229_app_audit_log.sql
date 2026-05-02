-- ============================================================================
-- Migration 229 — Table app_audit_log unifiée
-- ============================================================================
--
-- Sprint 7 / Production-readiness :
--   • Centralise les actions critiques de l'application (clôture exercice,
--     reset société, modifications config sensibles, paie verrouillage,
--     suppressions, export données, etc.) dans une seule table.
--   • paie_audit_log reste pour le périmètre paie spécifique (rétro-compat),
--     les futures actions paie devraient aussi écrire ici (double-write).
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,
  user_email   TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  societe_id   UUID,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.app_audit_log IS
  'Audit trail unifié des actions critiques (Sprint 7). Tenant scoped via societe_id.';
COMMENT ON COLUMN public.app_audit_log.action IS
  'Code d''action ex: cloture.execute, societe.reset, paie.verrouillage, user.delete, export.dgi';
COMMENT ON COLUMN public.app_audit_log.target_type IS
  'Type de l''entité cible ex: societe, exercice, bulletin_paie, facture';
COMMENT ON COLUMN public.app_audit_log.target_id IS
  'Identifiant de l''entité cible (UUID en string ou autre identifiant lisible)';
COMMENT ON COLUMN public.app_audit_log.details IS
  'Payload JSON libre — éviter PII non nécessaires.';

-- ── 2. Index ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_audit_log_societe_created
  ON public.app_audit_log (societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_action_created
  ON public.app_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_user_created
  ON public.app_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_target
  ON public.app_audit_log (target_type, target_id);

-- ── 3. RLS — tenant scoped ───────────────────────────────────────────────
ALTER TABLE public.app_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='app_audit_log'
       AND policyname='app_audit_log_tenant_select'
  ) THEN
    EXECUTE 'CREATE POLICY app_audit_log_tenant_select ON public.app_audit_log
             FOR SELECT USING (
               public.is_global_admin()
               OR (societe_id IS NULL AND auth.uid() = user_id)
               OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
             )';
  END IF;

  -- INSERT autorisé pour tout user authentifié sur sa propre ligne ou sur une
  -- société à laquelle il a accès. Le service-role (qui bypasse RLS) reste
  -- la voie principale via la function app_log_action ci-dessous.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='app_audit_log'
       AND policyname='app_audit_log_tenant_insert'
  ) THEN
    EXECUTE 'CREATE POLICY app_audit_log_tenant_insert ON public.app_audit_log
             FOR INSERT WITH CHECK (
               public.is_global_admin()
               OR (societe_id IS NULL AND auth.uid() = user_id)
               OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
             )';
  END IF;

  -- Pas d''UPDATE / DELETE — l''audit est append-only par construction.
  -- Les super_admins peuvent purger via service-role + script dédié.
END $$;

-- ── 4. Helper SQL function — app_log_action ──────────────────────────────
-- SECURITY DEFINER : permet de logger même pendant des opérations qui
-- changent de rôle, et garantit que l''insert n''est jamais bloqué par
-- une politique RLS mal calibrée. La fonction valide les inputs.
CREATE OR REPLACE FUNCTION public.app_log_action(
  p_action       TEXT,
  p_target_type  TEXT DEFAULT NULL,
  p_target_id    TEXT DEFAULT NULL,
  p_societe_id   UUID DEFAULT NULL,
  p_details      JSONB DEFAULT '{}'::jsonb,
  p_user_id      UUID DEFAULT NULL,
  p_user_email   TEXT DEFAULT NULL,
  p_ip_address   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_uid UUID;
BEGIN
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'app_log_action: action is required';
  END IF;

  v_uid := COALESCE(p_user_id, auth.uid());

  INSERT INTO public.app_audit_log
    (user_id, user_email, action, target_type, target_id, societe_id, details, ip_address)
  VALUES
    (v_uid, p_user_email, p_action, p_target_type, p_target_id, p_societe_id,
     COALESCE(p_details, '{}'::jsonb), p_ip_address)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.app_log_action IS
  'Helper unifié pour logger une action dans app_audit_log. SECURITY DEFINER — toujours autorisé.';

GRANT EXECUTE ON FUNCTION public.app_log_action(
  TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT
) TO authenticated, service_role;
