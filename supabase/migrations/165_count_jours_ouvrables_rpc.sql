-- ============================================================
-- Migration 165 — Sprint bugs paie/conges F13
--
-- Fonction SQL count_jours_ouvrables : calcule le nombre de jours
-- ouvrables entre date_debut et date_fin inclus (weekends + jours fériés
-- exclus). Cohérence avec lib/rh/calculateWorkingDays.ts côté TS.
--
-- Utilisée par :
--   - migration 166 (recompute rétroactif de demandes_conges.nb_jours)
--   - rapports SQL ad-hoc
--   - UI RH (future intégration pour aperçu modal)
--
-- IDEMPOTENTE : CREATE OR REPLACE FUNCTION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_jours_ouvrables(
  p_date_debut DATE,
  p_date_fin DATE,
  p_demi_journee BOOLEAN DEFAULT FALSE,
  p_societe_id UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_jours INTEGER;
BEGIN
  IF p_date_debut IS NULL OR p_date_fin IS NULL OR p_date_fin < p_date_debut THEN
    RETURN 0;
  END IF;

  -- Compter les jours entre debut et fin inclus :
  --   - exclure samedi (DOW=6) et dimanche (DOW=0)
  --   - exclure les jours fériés de la société (societe_id match) ou
  --     nationaux (societe_id IS NULL), sauf si travail_autorise=true.
  SELECT COUNT(*)::INTEGER INTO v_jours
  FROM generate_series(p_date_debut, p_date_fin, INTERVAL '1 day') d
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM public.jours_feries jf
      WHERE jf.date = d::date
        AND COALESCE(jf.travail_autorise, FALSE) = FALSE
        AND (
          p_societe_id IS NULL
          OR jf.societe_id = p_societe_id
          OR jf.societe_id IS NULL
        )
    );

  IF p_demi_journee THEN
    RETURN GREATEST(0::NUMERIC, v_jours::NUMERIC - 0.5);
  END IF;
  RETURN GREATEST(0::NUMERIC, v_jours::NUMERIC);
END $fn$;

COMMENT ON FUNCTION public.count_jours_ouvrables(DATE, DATE, BOOLEAN, UUID) IS
  'F13 — Compte les jours ouvrables entre date_debut et date_fin inclus (weekends + jours_feries exclus). -0.5 si demi-journée. Cohérent avec lib/rh/calculateWorkingDays.ts côté TS.';
