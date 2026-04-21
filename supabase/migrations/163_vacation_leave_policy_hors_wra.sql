-- ============================================================
-- Migration 163 — Sprint WRA Compliance G3
--
-- Extension de la fonction get_vacation_leave_droit (mig 161) pour prendre
-- en compte la policy société hors_wra (mig 162 policy_conges_hors_wra) :
--   - 'applique_wra_etendu' (défaut) : un employé hors_wra (basic > 50k)
--     avec 5 ans+ d'ancienneté bénéficie de 30 VL par cycle via policy,
--     status 'eligible_via_policy_societe'
--   - 'contrat_uniquement' : hors_wra exclu du VL (status
--     'hors_wra_basic_sup_50k', comportement de la mig 161)
--
-- Migrant workers restent exclus dans tous les cas.
--
-- IDEMPOTENTE : CREATE OR REPLACE FUNCTION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_vacation_leave_droit(
  p_date_arrivee DATE,
  p_salaire_base NUMERIC,
  p_is_migrant BOOLEAN DEFAULT FALSE,
  p_date_reference DATE DEFAULT CURRENT_DATE,
  p_policy_hors_wra TEXT DEFAULT 'applique_wra_etendu'
) RETURNS TABLE (
  vl_droit NUMERIC,
  vl_cycle_debut DATE,
  vl_cycle_fin DATE,
  eligibility_status TEXT,
  months_service INTEGER
) LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_months INTEGER;
  v_cycles INTEGER;
  v_debut DATE;
  v_fin DATE;
  v_is_hors_wra BOOLEAN;
BEGIN
  IF p_date_arrivee IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'no_date_arrivee'::TEXT, 0;
    RETURN;
  END IF;

  v_months := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM p_date_arrivee))::int * 12
            + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM p_date_arrivee))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM p_date_arrivee) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  -- Migrant worker : exclu absolu (même avec policy étendue)
  IF p_is_migrant THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'migrant_worker_exclu'::TEXT, v_months;
    RETURN;
  END IF;

  v_is_hors_wra := COALESCE(p_salaire_base, 0) > 50000;

  -- Hors WRA et policy 'contrat_uniquement' : pas de droit VL via la loi ni via policy
  IF v_is_hors_wra AND p_policy_hors_wra = 'contrat_uniquement' THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'hors_wra_basic_sup_50k'::TEXT, v_months;
    RETURN;
  END IF;

  -- Moins de 5 ans : en acquisition (workers ET hors_wra bénéficiaires policy)
  IF v_months < 60 THEN
    RETURN QUERY SELECT
      0::NUMERIC,
      NULL::DATE,
      (p_date_arrivee + INTERVAL '5 years')::DATE,
      'en_acquisition'::TEXT,
      v_months;
    RETURN;
  END IF;

  -- Éligible : cycle de PRISE en cours
  --   v_cycles = v_months / 60 (integer division)
  --   60-119 mois -> cycle 1 (prise années 6-10), etc.
  --   vl_cycle_debut = date_arrivee + v_cycles * 5 ans
  --   vl_cycle_fin   = date_arrivee + (v_cycles+1) * 5 ans - 1 jour
  v_cycles := v_months / 60;
  v_debut := (p_date_arrivee + (v_cycles * INTERVAL '5 years'))::DATE;
  v_fin   := (p_date_arrivee + ((v_cycles + 1) * INTERVAL '5 years') - INTERVAL '1 day')::DATE;

  RETURN QUERY SELECT
    30::NUMERIC,
    v_debut,
    v_fin,
    CASE WHEN v_is_hors_wra THEN 'eligible_via_policy_societe' ELSE 'eligible' END::TEXT,
    v_months;
END $fn$;

COMMENT ON FUNCTION public.get_vacation_leave_droit(DATE, NUMERIC, BOOLEAN, DATE, TEXT) IS
  'WRA 2019 S.47 — retourne le droit VL (30j / 5 ans). p_policy_hors_wra (mig 162) détermine si un employé hors_wra (basic > 50k) peut bénéficier du VL via policy société ("applique_wra_etendu") ou non ("contrat_uniquement"). Migrant workers toujours exclus.';
