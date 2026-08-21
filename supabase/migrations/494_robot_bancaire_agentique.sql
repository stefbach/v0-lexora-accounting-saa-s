-- =============================================================================
-- Migration 494 — Robot bancaire agentique auto-réparant (doc de conception
-- docs/roadmap/robot-bancaire-agentique.md §3).
--
-- Numéros 481-493 réservés au chantier modules stock/POS : ce chantier démarre
-- à 494.
--
-- Trois tables :
--   1. `bank_scrape_recipes`      : recettes versionnées (banque, objectif,
--      version) — un parcours agentique réussi sérialisé en séquence
--      d'actions rejouables sans IA. Les versions antérieures sont conservées
--      (rollback/diagnostic) ; une seule version active par (banque, objectif).
--      Les actions ne contiennent JAMAIS de secret : les champs sensibles sont
--      des références (`credentialRef`) résolues à l'exécution.
--   2. `bank_scrape_action_log`   : journal d'audit IMMUABLE de chaque action
--      (recette ou agentique) : observation résumée, décision brute du modèle,
--      action exécutée, résultat, screenshot. Aucun UPDATE/DELETE possible,
--      même par le service_role (trigger).
--   3. `bank_scrape_sessions`     : état de session / machine OTP
--      (idle → running → (awaiting_otp ⇄ running) → done|aborted|failed),
--      avec `storage_state_enc` (storageState Playwright chiffré AES-256-GCM
--      via lib/crypto/symmetric.ts) et expiration.
--
-- Sécurité (SEC-003) : RLS stricte via `user_has_societe_access(societe_id)`
-- pour la lecture — jamais de sous-requête inline ni de policy
-- `auth.uid() IS NOT NULL`. AUCUNE policy INSERT/UPDATE/DELETE pour
-- authenticated/anon : l'écriture est réservée au service_role (le robot
-- tourne côté serveur), qui bypasse la RLS. Les recettes, transverses aux
-- sociétés (une recette par banque, pas par client), ne sont lisibles par
-- aucun rôle client : service_role uniquement.
--
-- Idempotente, additive, rejouable. Rollback : DROP TABLE (x3) + DROP FUNCTION
-- public.bank_scrape_action_log_immutable().
-- =============================================================================

-- ─── 1. Recettes versionnées ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_scrape_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banque TEXT NOT NULL,
  objectif TEXT NOT NULL,
  version INT NOT NULL CHECK (version >= 1),
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actif BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (banque, objectif, version)
);

-- Une seule version active par (banque, objectif).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_scrape_recipes_active
  ON public.bank_scrape_recipes (banque, objectif)
  WHERE actif;

ALTER TABLE public.bank_scrape_recipes ENABLE ROW LEVEL SECURITY;
-- Pas de policy : lecture/écriture réservées au service_role (bypass RLS).
-- Les recettes décrivent la navigation chez la banque, pas des données client.

COMMENT ON TABLE public.bank_scrape_recipes IS
  'Recettes de navigation bancaire versionnées (robot agentique). Un parcours
   agentique réussi est sérialisé en séquence d''actions rejouables sans IA.
   Nouvelle version = nouvelle ligne ; les anciennes sont conservées pour
   rollback/diagnostic. Aucun secret dans actions (credentialRef résolues à
   l''exécution). Accès service_role uniquement.';

-- ─── 2. Journal d'audit immuable ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_scrape_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE RESTRICT,
  step_index INT NOT NULL CHECK (step_index >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('recipe', 'agentic')),
  observation_resumee TEXT,
  decision_modele JSONB,
  action JSONB,
  resultat TEXT NOT NULL CHECK (
    resultat IN ('executed', 'blocked', 'error', 'done', 'awaiting_otp', 'aborted')
  ),
  detail TEXT,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_scrape_action_log_run
  ON public.bank_scrape_action_log (run_id, step_index);

CREATE INDEX IF NOT EXISTS idx_bank_scrape_action_log_societe
  ON public.bank_scrape_action_log (societe_id, created_at DESC);

ALTER TABLE public.bank_scrape_action_log ENABLE ROW LEVEL SECURITY;

-- Lecture scopée société (SEC-003, pattern migration 480).
DROP POLICY IF EXISTS bank_scrape_action_log_select_by_societe_access
  ON public.bank_scrape_action_log;
CREATE POLICY bank_scrape_action_log_select_by_societe_access
  ON public.bank_scrape_action_log
  FOR SELECT
  USING (public.user_has_societe_access(societe_id));
-- Pas de policy INSERT/UPDATE/DELETE : écriture service_role uniquement.

-- IMMUABILITÉ : le journal d'audit n'est JAMAIS modifiable ni purgeable par
-- l'application — même le service_role (qui bypasse la RLS) est bloqué par
-- ce trigger. Toute rétention/purge exigera une migration explicite.
CREATE OR REPLACE FUNCTION public.bank_scrape_action_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'bank_scrape_action_log est un journal d''audit immuable (% interdit)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_scrape_action_log_immutable
  ON public.bank_scrape_action_log;
CREATE TRIGGER trg_bank_scrape_action_log_immutable
  BEFORE UPDATE OR DELETE ON public.bank_scrape_action_log
  FOR EACH ROW EXECUTE FUNCTION public.bank_scrape_action_log_immutable();

COMMENT ON TABLE public.bank_scrape_action_log IS
  'Journal d''audit immuable du robot bancaire agentique : une ligne par
   action (rejeu de recette ou décision IA) — horodatage, observation
   résumée, décision brute du modèle, action, résultat, screenshot.
   UPDATE/DELETE bloqués par trigger, y compris pour service_role. Lecture
   via user_has_societe_access ; écriture (INSERT) service_role uniquement.';

-- ─── 3. Sessions / machine à états OTP ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_scrape_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  compte_bancaire_id UUID NOT NULL REFERENCES public.comptes_bancaires(id) ON DELETE CASCADE,
  run_id UUID,
  statut TEXT NOT NULL DEFAULT 'idle' CHECK (
    statut IN ('idle', 'running', 'awaiting_otp', 'done', 'aborted', 'failed')
  ),
  -- storageState Playwright chiffré AES-256-GCM (lib/crypto/symmetric.ts) :
  -- réduit la fréquence des OTP. Révocable : NULL + expire_at passé.
  storage_state_enc TEXT,
  otp_demande_at TIMESTAMPTZ,
  otp_expire_at TIMESTAMPTZ,
  end_reason TEXT,
  expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_scrape_sessions_compte
  ON public.bank_scrape_sessions (compte_bancaire_id, created_at DESC);

-- Reprise rapide des sessions en attente d'OTP (endpoint Telegram SEC-005).
CREATE INDEX IF NOT EXISTS idx_bank_scrape_sessions_awaiting
  ON public.bank_scrape_sessions (otp_expire_at)
  WHERE statut = 'awaiting_otp';

ALTER TABLE public.bank_scrape_sessions ENABLE ROW LEVEL SECURITY;

-- Lecture scopée société (SEC-003). Le storage_state_enc reste chiffré ;
-- la clé n'est jamais côté client.
DROP POLICY IF EXISTS bank_scrape_sessions_select_by_societe_access
  ON public.bank_scrape_sessions;
CREATE POLICY bank_scrape_sessions_select_by_societe_access
  ON public.bank_scrape_sessions
  FOR SELECT
  USING (public.user_has_societe_access(societe_id));
-- Pas de policy INSERT/UPDATE/DELETE : écriture service_role uniquement.

COMMENT ON TABLE public.bank_scrape_sessions IS
  'État des sessions du robot bancaire agentique, machine à états OTP :
   idle → running → (awaiting_otp ⇄ running) → done | aborted | failed.
   storage_state_enc = storageState Playwright chiffré AES-256-GCM. Lecture
   via user_has_societe_access ; écriture service_role uniquement.';
