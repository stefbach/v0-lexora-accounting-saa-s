-- ============================================================================
-- Migration 141 — societes.regles_planning (JSONB)
-- ============================================================================
--
-- Sprint 5 BUG C — la page /rh/planning/regles sauvegardait silencieusement
-- en localStorage uniquement parce que la colonne DB n'existait pas. L'API
-- retournait {success: true, fallback: true} en cas d'échec DB, ce qui
-- faussait le feedback UX (utilisateur pensait avoir sauvegardé alors qu'un
-- changement de navigateur perdait tout).
--
-- Schéma d'un élément dans le tableau:
--   {
--     "key": "max_heures_semaine",
--     "label": "Heures hebdomadaires maximum",
--     "value": 45,
--     "unit": "heures/semaine",
--     "enabled": true,
--     "reglementaire": true
--   }
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS regles_planning JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.societes.regles_planning IS
  'Règles planning WRA 2019 par société (JSONB array):
   [{key, label, value, unit, enabled, reglementaire}]
   Lues/écrites via /api/rh/planning/regles. Utilisées par le validateur
   de planning pour détecter les dépassements (OT, repos, etc.).';

-- Index GIN pour query par key (ex. "quelles sociétés ont max_heures_semaine > 45 ?")
CREATE INDEX IF NOT EXISTS idx_societes_regles_planning_gin
  ON public.societes USING gin (regles_planning);
