-- ============================================================
-- Migration 161 — Sprint WRA Compliance G2
--
-- Vacation Leave (WRA 2019 Section 47, applicable depuis le 24/10/2024) :
-- 30 jours payés par cycle de 5 ans pour les WORKERS (basic ≤ 50 000 MUR)
-- ayant 5 ans+ d'ancienneté continue. Exclut les migrant workers.
--
-- URGENCE : 5 employées DDS déjà éligibles depuis octobre 2024
-- (Richaa NEMDHARRY, Melanie LALANE, Annuella PRINTANIERE, Elodie CHATON,
-- Fabiola PIERRE). Risque contentieux Industrial Court.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE FUNCTION.
-- ============================================================

-- ─── 1. Flag "migrant worker" sur employes ───────────────────────────
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS is_migrant_worker BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.employes.is_migrant_worker IS
  'Flag "migrant worker" au sens WRA S.2 — exclu de certains droits (Vacation Leave S.47).';

-- ─── 2. Nouvelles colonnes Vacation Leave sur soldes_conges ──────────
ALTER TABLE public.soldes_conges
  ADD COLUMN IF NOT EXISTS vl_droit NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vl_pris NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vl_paye_compensation NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vl_cycle_debut DATE,
  ADD COLUMN IF NOT EXISTS vl_cycle_fin DATE;

-- vl_solde = colonne GENERATED (ajout conditionnel : on recréé seulement
-- si elle n'existe pas déjà).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'soldes_conges' AND column_name = 'vl_solde'
  ) THEN
    ALTER TABLE public.soldes_conges
      ADD COLUMN vl_solde NUMERIC GENERATED ALWAYS AS
        (COALESCE(vl_droit, 0) - COALESCE(vl_pris, 0) - COALESCE(vl_paye_compensation, 0)) STORED;
  END IF;
END $$;

COMMENT ON COLUMN public.soldes_conges.vl_droit IS
  'Vacation Leave (WRA S.47) : 30j par cycle de 5 ans pour workers (basic ≤ 50k, non migrant).';
COMMENT ON COLUMN public.soldes_conges.vl_pris IS
  'VL effectivement pris pendant ce cycle de 5 ans.';
COMMENT ON COLUMN public.soldes_conges.vl_paye_compensation IS
  'VL payé en cash-in-lieu (refus employeur ou fin de contrat). G1 = sprint suivant pour auto-trigger.';
COMMENT ON COLUMN public.soldes_conges.vl_cycle_debut IS
  'Début du cycle de 5 ans (date_arrivee + N*5 ans où N = nombre de cycles déjà écoulés).';
COMMENT ON COLUMN public.soldes_conges.vl_cycle_fin IS
  'Fin du cycle de 5 ans (vl_cycle_debut + 5 ans - 1 jour).';

-- ─── 3. Fonction get_vacation_leave_droit ────────────────────────────
-- Retourne (vl_droit, vl_cycle_debut, vl_cycle_fin, eligibility_status,
-- months_service) selon l'ancienneté et le statut worker/migrant.
--
-- eligibility_status possibles :
--   'eligible'              → ≥ 5 ans, basic ≤ 50K, non migrant
--   'en_acquisition'        → < 5 ans (sera éligible à date_arrivee + 5 ans)
--   'hors_wra_basic_sup_50k' → basic > 50 000 MUR (pas un "worker" au sens WRA)
--   'migrant_worker_exclu'   → flag is_migrant_worker = true
CREATE OR REPLACE FUNCTION public.get_vacation_leave_droit(
  p_date_arrivee DATE,
  p_salaire_base NUMERIC,
  p_is_migrant BOOLEAN DEFAULT FALSE,
  p_date_reference DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  vl_droit NUMERIC,
  vl_cycle_debut DATE,
  vl_cycle_fin DATE,
  eligibility_status TEXT,
  months_service INTEGER
) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_months INTEGER;
  v_cycles INTEGER;
  v_debut DATE;
  v_fin DATE;
BEGIN
  IF p_date_arrivee IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'no_date_arrivee'::TEXT, 0;
    RETURN;
  END IF;

  -- Mois calendaires révolus entre date_arrivee et date_reference.
  v_months := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM p_date_arrivee))::int * 12
            + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM p_date_arrivee))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM p_date_arrivee) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  -- Migrant worker : exclu
  IF p_is_migrant THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'migrant_worker_exclu'::TEXT, v_months;
    RETURN;
  END IF;

  -- Hors "worker" au sens WRA (basic > 50 000)
  IF COALESCE(p_salaire_base, 0) > 50000 THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::DATE, NULL::DATE, 'hors_wra_basic_sup_50k'::TEXT, v_months;
    RETURN;
  END IF;

  -- Moins de 5 ans : en acquisition, cycle_fin = date_arrivee + 5 ans
  IF v_months < 60 THEN
    RETURN QUERY SELECT
      0::NUMERIC,
      NULL::DATE,
      (p_date_arrivee + INTERVAL '5 years')::DATE,
      'en_acquisition'::TEXT,
      v_months;
    RETURN;
  END IF;

  -- v_cycles = numéro du cycle de PRISE en cours :
  --   60-119 mois  → cycle 1 (prise années 6-10, droit acquis au bout de 5 ans)
  --   120-179 mois → cycle 2 (prise années 11-15, acquis au bout de 10 ans)
  --   etc.
  -- vl_cycle_debut = date_arrivee + v_cycles * 5 ans  (début de la prise)
  -- vl_cycle_fin   = date_arrivee + (v_cycles+1) * 5 ans - 1 jour
  v_cycles := v_months / 60;
  v_debut := (p_date_arrivee + (v_cycles * INTERVAL '5 years'))::DATE;
  v_fin   := (p_date_arrivee + ((v_cycles + 1) * INTERVAL '5 years') - INTERVAL '1 day')::DATE;

  RETURN QUERY SELECT 30::NUMERIC, v_debut, v_fin, 'eligible'::TEXT, v_months;
END $$;

COMMENT ON FUNCTION public.get_vacation_leave_droit(DATE, NUMERIC, BOOLEAN, DATE) IS
  'WRA 2019 S.47 — retourne le droit VL (30j par cycle de 5 ans) pour un employé. Workers uniquement (basic ≤ 50K), non migrant, 5 ans+ d''ancienneté continue.';

-- ─── 4. Backfill : remplir vl_* sur la période courante ──────────────
UPDATE public.soldes_conges sc
SET
  vl_droit = v.vl_droit,
  vl_cycle_debut = v.vl_cycle_debut,
  vl_cycle_fin = v.vl_cycle_fin
FROM public.employes e
CROSS JOIN LATERAL public.get_vacation_leave_droit(
  e.date_arrivee,
  e.salaire_base::NUMERIC,
  COALESCE(e.is_migrant_worker, FALSE),
  CURRENT_DATE
) v
WHERE sc.employe_id = e.id
  AND e.date_depart IS NULL
  AND v.eligibility_status = 'eligible'
  AND sc.periode_debut <= CURRENT_DATE
  AND sc.periode_fin >= CURRENT_DATE;
