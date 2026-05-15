-- =============================================================================
-- Migration 274 — Robot bancaire (scraping login Internet Banking)
-- =============================================================================
-- Pattern : identique au robot MRA (migration 267) — credentials chiffrées
-- AES-256-GCM via lib/crypto/symmetric.ts (env CRYPT_KEY) + scrapes auditées.
--
-- Couvre les banques mauriciennes : MCB, SBM, ABC Banking, MauBank, MyT Money,
-- AfrAsia, Bank One. La logique de scrape est dans lib/banks/scraper.ts
-- avec un adapter par banque.
--
-- Sécurité :
--   - Credentials par compte bancaire (compte_bancaire_id)
--   - Lecture uniquement direction / admin / super_admin
--   - Mots de passe jamais lus en clair côté UI (toggle Eye masqué)
--   - Service role uniquement pour le déchiffrement runtime

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. Credentials de scraping par compte bancaire
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.comptes_bancaires_scraping_creds (
  compte_bancaire_id  UUID PRIMARY KEY REFERENCES public.comptes_bancaires(id) ON DELETE CASCADE,

  -- Identifiants (chiffrés AES-256-GCM)
  username_enc        TEXT,
  password_enc        TEXT,
  secondary_pin_enc   TEXT,         -- certains comptes business ont un 2e code

  -- Notes admin (en clair, ex: "Le PIN expire tous les 90j", "Compte joint avec Jean")
  notes               TEXT,

  -- Activation
  active              BOOLEAN NOT NULL DEFAULT true,

  -- Statut dernier scrape
  last_scrape_at      TIMESTAMPTZ,
  last_scrape_status  TEXT,         -- 'success' | 'failed' | 'manual_needed'
  last_scrape_error   TEXT,
  last_balance_mur    NUMERIC(15,2),

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_scraping_active
  ON public.comptes_bancaires_scraping_creds(compte_bancaire_id) WHERE active = true;

ALTER TABLE public.comptes_bancaires_scraping_creds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_scraping_direction_select ON public.comptes_bancaires_scraping_creds;
CREATE POLICY bank_scraping_direction_select ON public.comptes_bancaires_scraping_creds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.comptes_bancaires cb
      JOIN public.user_societes us ON us.societe_id = cb.societe_id
      WHERE cb.id = comptes_bancaires_scraping_creds.compte_bancaire_id
        AND us.user_id = auth.uid()
        AND us.role IN ('direction', 'client_admin', 'admin', 'super_admin')
    )
  );

-- Modifications uniquement via service_role (endpoints API)

CREATE OR REPLACE FUNCTION public.bank_scraping_creds_touch() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bank_scraping_touch ON public.comptes_bancaires_scraping_creds;
CREATE TRIGGER trg_bank_scraping_touch BEFORE UPDATE ON public.comptes_bancaires_scraping_creds
  FOR EACH ROW EXECUTE FUNCTION public.bank_scraping_creds_touch();

-- =============================================================================
-- 2. Historique des scrapes (audit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bank_scrape_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  compte_bancaire_id  UUID NOT NULL REFERENCES public.comptes_bancaires(id) ON DELETE CASCADE,

  scrape_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT NOT NULL CHECK (status IN ('success', 'failed', 'manual_needed', 'partial')),

  -- Données extraites
  balance_mur         NUMERIC(15,2),
  balance_devise      TEXT,
  nb_transactions     INTEGER,
  transactions        JSONB,         -- array de tx récentes scrapées
  raw_excerpt         TEXT,          -- texte brut pour debug

  -- Diagnostique
  error_msg           TEXT,
  screenshot_url      TEXT,          -- chemin storage Supabase si capture
  duration_ms         INTEGER,
  trigger_source      TEXT NOT NULL DEFAULT 'cron' -- 'cron' | 'manual' | 'telegram'
);

CREATE INDEX IF NOT EXISTS idx_bank_scrape_runs_compte
  ON public.bank_scrape_runs(compte_bancaire_id, scrape_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_scrape_runs_societe
  ON public.bank_scrape_runs(societe_id, scrape_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_scrape_runs_status
  ON public.bank_scrape_runs(status) WHERE status != 'success';

ALTER TABLE public.bank_scrape_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_scrape_runs_societe_select ON public.bank_scrape_runs;
CREATE POLICY bank_scrape_runs_societe_select ON public.bank_scrape_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = auth.uid()
        AND us.societe_id = bank_scrape_runs.societe_id
        AND us.role IN ('direction', 'client_admin', 'admin', 'super_admin', 'comptable', 'comptable_dedie')
    )
  );

-- =============================================================================
-- 3. Anomalies détectées (écarts entre scrape et relevé officiel)
-- =============================================================================
-- Quand un releve_bancaire officiel est importé, le système compare avec
-- les scrapes quotidiens pour détecter :
--   - balance_mismatch : solde scrape ≠ solde relevé pour la même date
--   - missing_in_releve : tx vue dans scrapes mais absente du relevé
--   - missing_in_scrape : tx du relevé qu'on n'a pas vue (peut-être normal)
--   - balance_drop_anormal : variation > seuil société

CREATE TABLE IF NOT EXISTS public.bank_scrape_anomalies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  compte_bancaire_id  UUID NOT NULL REFERENCES public.comptes_bancaires(id) ON DELETE CASCADE,

  type                TEXT NOT NULL CHECK (type IN (
    'balance_mismatch',     -- solde différent
    'missing_in_releve',    -- tx scrapée mais pas dans relevé
    'missing_in_scrape',    -- tx du relevé jamais scrapée (suspect)
    'balance_drop',         -- variation anormale de solde
    'login_failure',        -- impossible de se connecter
    'session_expired'       -- session terminée prématurément
  )),
  severity            TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  details             JSONB NOT NULL,        -- { expected, actual, transaction_ids[], ... }
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Résolution
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES auth.users(id),
  resolution_note     TEXT,

  -- Notifications
  notified_telegram_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_anomalies_open
  ON public.bank_scrape_anomalies(societe_id, status) WHERE status IN ('open', 'investigating');
CREATE INDEX IF NOT EXISTS idx_bank_anomalies_compte
  ON public.bank_scrape_anomalies(compte_bancaire_id, detected_at DESC);

ALTER TABLE public.bank_scrape_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_anomalies_select ON public.bank_scrape_anomalies;
CREATE POLICY bank_anomalies_select ON public.bank_scrape_anomalies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = auth.uid()
        AND us.societe_id = bank_scrape_anomalies.societe_id
        AND us.role IN ('direction', 'client_admin', 'admin', 'super_admin', 'comptable', 'comptable_dedie')
    )
  );

COMMENT ON TABLE public.comptes_bancaires_scraping_creds IS
  'Identifiants Internet Banking chiffrés pour scraping auto par robot Playwright. Lecture direction/admin uniquement.';
COMMENT ON TABLE public.bank_scrape_runs IS
  'Historique des exécutions du robot bancaire — balance, transactions, statut, screenshot accusé.';
COMMENT ON TABLE public.bank_scrape_anomalies IS
  'Écarts détectés entre scrapes auto et relevés officiels — notifiés via Telegram aux comptables/direction.';
