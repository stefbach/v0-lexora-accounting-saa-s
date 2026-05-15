-- =============================================================================
-- Migration 271 — Comptes OAuth user-level (Google Agenda en premier)
-- =============================================================================
-- Stockage générique des credentials OAuth par utilisateur, scoped par société.
-- Premier provider : Google (scopes Calendar + userinfo.email).
--
-- Conçu pour être extensible (Microsoft 365, Zoom, etc.) : on ajoute un provider
-- au CHECK constraint quand on en branche un nouveau.
--
-- Sécurité :
--   - access_token et refresh_token chiffrés AES-256-GCM (lib/crypto/symmetric.ts,
--     env CRYPT_KEY)
--   - RLS : l'user ne voit/écrit que ses propres comptes (service_role bypass pour
--     les endpoints OAuth + tools Telegram)
--   - UNIQUE(user_id, provider, account_email) pour éviter les doublons
--
-- Sélection du compte "par défaut" :
--   - is_default_for_calendar : utilisé par les tools Telegram quand l'user a
--     plusieurs comptes Google et n'a pas précisé lequel utiliser.

CREATE TABLE IF NOT EXISTS public.user_oauth_accounts (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id                 UUID REFERENCES public.societes(id) ON DELETE SET NULL,

  -- Provider OAuth
  provider                   TEXT NOT NULL CHECK (provider IN ('google')),

  -- Identification du compte distant
  account_email              TEXT NOT NULL,
  label                      TEXT,                                     -- ex: "Perso", "Cabinet"

  -- Scopes accordés (ex: ['https://www.googleapis.com/auth/calendar', 'openid', 'email'])
  scopes                     TEXT[] NOT NULL DEFAULT '{}',

  -- Tokens chiffrés AES-256-GCM
  access_token_enc           TEXT,
  refresh_token_enc          TEXT,
  expires_at                 TIMESTAMPTZ,

  -- Métadonnées
  last_synced_at             TIMESTAMPTZ,
  last_error                 TEXT,
  active                     BOOLEAN NOT NULL DEFAULT true,
  is_default_for_calendar    BOOLEAN NOT NULL DEFAULT false,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un seul compte (user, provider, email)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_oauth_user_provider_email
  ON public.user_oauth_accounts(user_id, provider, account_email);

-- Un seul default calendar par user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_oauth_default_calendar
  ON public.user_oauth_accounts(user_id)
  WHERE is_default_for_calendar = true AND active = true;

CREATE INDEX IF NOT EXISTS idx_user_oauth_active ON public.user_oauth_accounts(user_id, provider) WHERE active = true;

-- RLS
ALTER TABLE public.user_oauth_accounts ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne voit / ne modifie QUE ses propres comptes.
-- Service_role (endpoints API OAuth + tools Telegram) bypass entièrement.
DROP POLICY IF EXISTS user_oauth_self_select ON public.user_oauth_accounts;
CREATE POLICY user_oauth_self_select ON public.user_oauth_accounts
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_oauth_self_insert ON public.user_oauth_accounts;
CREATE POLICY user_oauth_self_insert ON public.user_oauth_accounts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_oauth_self_update ON public.user_oauth_accounts;
CREATE POLICY user_oauth_self_update ON public.user_oauth_accounts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_oauth_self_delete ON public.user_oauth_accounts;
CREATE POLICY user_oauth_self_delete ON public.user_oauth_accounts
  FOR DELETE
  USING (user_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.user_oauth_accounts_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_oauth_accounts_touch ON public.user_oauth_accounts;
CREATE TRIGGER trg_user_oauth_accounts_touch BEFORE UPDATE ON public.user_oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION public.user_oauth_accounts_touch();

COMMENT ON TABLE public.user_oauth_accounts IS
  'Comptes OAuth user-level (Google Agenda en premier). Tokens chiffrés AES-256-GCM. RLS user-scoped.';
