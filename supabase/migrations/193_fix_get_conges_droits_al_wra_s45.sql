-- ═══════════════════════════════════════════════════════════════
-- Migration 193 — FIX WRA 2019 S.45 : accumulation AL progressive
--
-- BUG identifié par Mégane :
--   public.get_conges_droits_v2 appliquait un accrual linéaire
--   LEAST(22, months_in_cycle × 22 / 12) dès le 1er mois → non conforme.
--
-- WRA 2019 Section 45 — AL :
--   - 0 à 6 mois  : 0 AL
--   - 7 à 12 mois : 1 AL par mois complété, max 6
--   - > 12 mois   : cycle plein 22j, progression linéaire sur mois_in_cycle
--
-- La même fonction appliquait DÉJÀ cette règle pour SL (non touché).
-- On aligne AL sur la même branche conditionnelle.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_conges_droits_v2(
  p_date_arrivee DATE,
  p_date_reference DATE,
  p_jours_al_par_cycle NUMERIC DEFAULT 22,
  p_jours_sl_par_cycle NUMERIC DEFAULT 15
)
RETURNS TABLE(
  al_acquis NUMERIC,
  al_utilisable NUMERIC,
  sl_droit NUMERIC,
  months_in_cycle INTEGER
)
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  v_cycle_debut DATE;
  v_months_total INT;
  v_months_in_cycle INT;
  v_al_acquis NUMERIC;
  v_sl_droit NUMERIC;
BEGIN
  IF p_date_arrivee IS NULL OR p_date_reference < p_date_arrivee THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0;
    RETURN;
  END IF;

  -- Mois complets depuis date d'arrivée
  v_months_total := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM p_date_arrivee))::int * 12
                  + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM p_date_arrivee))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM p_date_arrivee) THEN
    v_months_total := v_months_total - 1;
  END IF;
  IF v_months_total < 0 THEN v_months_total := 0; END IF;

  -- Cycle courant (anniversaire-based)
  v_cycle_debut := public.get_conges_period_start(p_date_arrivee, p_date_reference);
  v_months_in_cycle := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM v_cycle_debut))::int * 12
                     + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM v_cycle_debut))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM v_cycle_debut) THEN
    v_months_in_cycle := v_months_in_cycle - 1;
  END IF;
  IF v_months_in_cycle < 0 THEN v_months_in_cycle := 0; END IF;

  -- FIX WRA S.45 : AL progressive (aligne sur SL).
  IF v_months_total < 6 THEN
    v_al_acquis := 0;
  ELSIF v_months_total < 12 THEN
    v_al_acquis := LEAST(6, v_months_total - 5);
  ELSE
    v_al_acquis := LEAST(p_jours_al_par_cycle,
      ROUND((v_months_in_cycle::NUMERIC * p_jours_al_par_cycle / 12)::NUMERIC, 2));
  END IF;

  -- SL inchangé (déjà conforme).
  IF v_months_total < 6 THEN
    v_sl_droit := 0;
  ELSIF v_months_total < 12 THEN
    v_sl_droit := LEAST(6, v_months_total - 5);
  ELSE
    v_sl_droit := p_jours_sl_par_cycle;
  END IF;

  RETURN QUERY SELECT
    v_al_acquis,
    -- al_utilisable reflète ce qu'on peut prendre : WRA autorise les
    -- jours acquis même avant 12 mois (1-6) → on retourne al_acquis.
    v_al_acquis,
    v_sl_droit,
    v_months_in_cycle;
END $function$;

COMMENT ON FUNCTION public.get_conges_droits_v2(DATE, DATE, NUMERIC, NUMERIC) IS
  'G-leaves-fix 193 : AL conforme WRA 2019 S.45 (0/6, 7-12 progressif max 6, >12 cycle plein). SL inchangé.';
