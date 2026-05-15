-- =============================================================================
-- Migration 268 — Comptes email multi-tenant
-- =============================================================================
-- Chaque société peut configurer N comptes email pour les envois sortants
-- (relances clients, rapports, notifications). 3 providers supportés :
--   - smtp        : nodemailer + identifiants SMTP (Gmail App Password, OVH, etc.)
--   - resend      : Resend avec domaine vérifié
--   - gmail_oauth : Gmail API via OAuth user-level (TODO Phase ultérieure)
--
-- Granularité :
--   - user_id NULL   → compte "société" partagé par tous les membres
--   - user_id NOT NULL → compte personnel (visible uniquement par cet user)
--
-- Secrets stockés chiffrés AES-256-GCM (cf. lib/crypto/symmetric.ts, env CRYPT_KEY).
--
-- Sélection d'un compte par défaut :
--   - is_default_for_user  : ce compte est le défaut de l'user (si applicable)
--   - is_default_for_societe : ce compte est le défaut société-wide (fallback)

CREATE TABLE IF NOT EXISTS public.email_accounts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Affichage / sélection
  label                    TEXT NOT NULL,           -- ex: "Cabinet ACME", "Gmail perso Marie"
  from_email               TEXT NOT NULL,           -- ex: contact@acme.io
  from_name                TEXT,                    -- ex: "ACME Comptabilité"
  reply_to                 TEXT,

  -- Provider
  provider                 TEXT NOT NULL CHECK (provider IN ('smtp', 'resend', 'gmail_oauth')),

  -- SMTP config (si provider='smtp')
  smtp_host                TEXT,
  smtp_port                INTEGER,
  smtp_secure              BOOLEAN DEFAULT true,
  smtp_user                TEXT,
  smtp_password_enc        TEXT,                    -- AES-256-GCM

  -- Resend config (si provider='resend')
  resend_api_key_enc       TEXT,                    -- AES-256-GCM (clé par compte)
  resend_domain            TEXT,                    -- domaine vérifié sur Resend

  -- Gmail OAuth (si provider='gmail_oauth') — Phase ultérieure
  oauth_refresh_token_enc  TEXT,
  oauth_access_token_enc   TEXT,
  oauth_expires_at         TIMESTAMPTZ,

  -- Sélection
  is_default_for_user      BOOLEAN NOT NULL DEFAULT false,
  is_default_for_societe   BOOLEAN NOT NULL DEFAULT false,
  active                   BOOLEAN NOT NULL DEFAULT true,

  -- Métadonnées
  last_used_at             TIMESTAMPTZ,
  last_test_at             TIMESTAMPTZ,
  last_test_status         TEXT,                    -- 'success' | 'failed'
  last_test_error          TEXT,
  use_count                INTEGER NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id),

  CHECK (provider != 'smtp' OR (smtp_host IS NOT NULL AND smtp_port IS NOT NULL AND smtp_user IS NOT NULL)),
  CHECK (provider != 'resend' OR resend_domain IS NOT NULL)
);

-- Un seul default société-wide, un seul default par user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_account_default_societe
  ON public.email_accounts(societe_id)
  WHERE is_default_for_societe = true AND user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_account_default_user
  ON public.email_accounts(societe_id, user_id)
  WHERE is_default_for_user = true AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_accounts_societe ON public.email_accounts(societe_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON public.email_accounts(societe_id, user_id) WHERE active = true AND user_id IS NOT NULL;

-- RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

-- SELECT : membres de la société voient les comptes société + leurs comptes perso
DROP POLICY IF EXISTS email_accounts_member_select ON public.email_accounts;
CREATE POLICY email_accounts_member_select ON public.email_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = auth.uid()
        AND us.societe_id = email_accounts.societe_id
        AND (
          email_accounts.user_id IS NULL  -- comptes société visibles à tous
          OR email_accounts.user_id = auth.uid()  -- comptes perso uniquement à soi
        )
    )
  );

-- INSERT/UPDATE/DELETE : direction/admin pour comptes société, user lui-même pour ses comptes perso
-- Service_role (endpoints API) bypass RLS entièrement

CREATE OR REPLACE FUNCTION public.email_accounts_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_accounts_touch ON public.email_accounts;
CREATE TRIGGER trg_email_accounts_touch BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.email_accounts_touch();

COMMENT ON TABLE public.email_accounts IS
  'Comptes email multi-tenants par société. Plusieurs providers (SMTP, Resend domaine, Gmail OAuth). Secrets chiffrés AES-256-GCM.';
