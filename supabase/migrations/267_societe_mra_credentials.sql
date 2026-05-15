-- =============================================================================
-- Migration 267 — Credentials MRA chiffrées par société
-- =============================================================================
-- Pour permettre au bot Telegram de soumettre des déclarations MRA via un
-- robot Playwright (le portail MRA n'a pas d'API publique).
--
-- Les mots de passe sont chiffrés avec pgcrypto + une clé d'application
-- (env CRYPT_KEY) — déchiffrement côté server uniquement, jamais retourné
-- à l'UI en clair.
--
-- Accès restreint à direction / admin / super_admin via RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.societe_mra_credentials (
  societe_id          UUID PRIMARY KEY REFERENCES public.societes(id) ON DELETE CASCADE,
  mra_username        TEXT,
  mra_password_enc    TEXT,                  -- chiffré pgp_sym_encrypt côté app
  mra_tan_enc         TEXT,                  -- Tax Account Number si différent
  mra_otp_seed_enc    TEXT,                  -- TOTP seed si activé (optionnel)
  notes               TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  last_submitted_at   TIMESTAMPTZ,
  last_submit_status  TEXT,                  -- 'success' | 'failed' | 'manual_needed'
  last_submit_error   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_societe_mra_creds_active
  ON public.societe_mra_credentials(societe_id) WHERE active = true;

ALTER TABLE public.societe_mra_credentials ENABLE ROW LEVEL SECURITY;

-- RLS : seuls direction/admin/super_admin de la société voient/modifient
DROP POLICY IF EXISTS mra_creds_direction_select ON public.societe_mra_credentials;
CREATE POLICY mra_creds_direction_select ON public.societe_mra_credentials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = auth.uid()
        AND us.societe_id = societe_mra_credentials.societe_id
        AND us.role IN ('direction', 'client_admin', 'admin', 'super_admin')
    )
  );

-- Modifications uniquement via service_role (endpoints API)
-- Pas de policy INSERT/UPDATE/DELETE côté user

CREATE OR REPLACE FUNCTION public.societe_mra_credentials_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mra_creds_touch ON public.societe_mra_credentials;
CREATE TRIGGER trg_mra_creds_touch BEFORE UPDATE ON public.societe_mra_credentials
  FOR EACH ROW EXECUTE FUNCTION public.societe_mra_credentials_touch();

COMMENT ON TABLE public.societe_mra_credentials IS
  'Credentials MRA chiffrées par société. Utilisées par le bot Telegram pour soumission auto via Playwright (pas d''API MRA publique).';
