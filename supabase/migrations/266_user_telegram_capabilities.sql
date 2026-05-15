-- =============================================================================
-- Migration 266 — Capabilities Telegram personnalisées par utilisateur
-- =============================================================================
-- Permet à l'admin d'OVERRIDER les capabilities par défaut d'un rôle, par user.
--
-- Sémantique :
--   - NULL → utilise les capabilities par défaut du rôle (cf. computeCapabilities)
--   - JSON array de strings → REMPLACE complètement la liste par défaut
--
-- Exemple :
--   user X = rôle 'manager' (par défaut : view_help, switch_societe, logout,
--   view_my_payslip, view_my_leave_balance, request_leave, view_team_kpis,
--   approve_team_leave, view_team_pending)
--
--   admin lui retire approve_team_leave (sensible) → telegram_capabilities =
--   ['view_help','switch_societe','logout','view_my_payslip','view_my_leave_balance',
--    'request_leave','view_team_kpis','view_team_pending']

ALTER TABLE public.user_societes
  ADD COLUMN IF NOT EXISTS telegram_capabilities JSONB;

COMMENT ON COLUMN public.user_societes.telegram_capabilities IS
  'Override des capabilities Telegram pour cet user dans cette société. NULL = utilise les caps par défaut du rôle. JSON array = remplace.';

-- Index pour query rapide quand on cherche les users custom
CREATE INDEX IF NOT EXISTS idx_user_societes_caps_custom
  ON public.user_societes((telegram_capabilities IS NOT NULL))
  WHERE telegram_capabilities IS NOT NULL;
