-- ============================================================
-- Migration 175 — Sprint G5
--
-- Modèle C : accrual AL linéaire mensuel (22 / 12 = 1,833 j/mois).
--
-- MOTIVATION
--   Modèle A actuel (palier) :
--     M0-M5 -> 0 | M6-M11 -> 1j/mois max 6 | M12+ -> 22 d'un coup.
--   Saut brutal à M12 : un employé qui part à M11 n'a eu que 6 j au
--   lieu d'environ 20 j au prorata, injuste pour le paiement
--   compensatoire (WRA 2019 S.45(2)).
--
--   Modèle C (accrual linéaire mensuel) :
--     Dès M1, accrual 22/12 par mois d'emploi dans le cycle.
--     - al_acquis       -> accumulé au prorata (paiement compensatoire
--                          + provisions IAS 19)
--     - al_utilisable   -> 0 avant M12, = al_acquis après M12
--
-- RÉTROCOMPAT
--   get_conges_droits v1 conservée (palier).
--   al_droit inchangé (c'est la valeur utilisable).
--   Nouvelle colonne al_acquis sur soldes_conges pour le Modèle C.
--
-- SL inchangé : garde le modèle palier (pas soumis à compensation).
--
-- IDEMPOTENTE.
-- ============================================================

-- ─── 1. Fonction v2 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_conges_droits_v2(
  p_date_arrivee DATE,
  p_date_reference DATE,
  p_jours_al_par_cycle NUMERIC DEFAULT 22,
  p_jours_sl_par_cycle NUMERIC DEFAULT 15
) RETURNS TABLE(
  al_acquis NUMERIC,
  al_utilisable NUMERIC,
  sl_droit NUMERIC,
  months_in_cycle INTEGER
) LANGUAGE plpgsql IMMUTABLE AS $fn$
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

  -- Mois total d'ancienneté (pour SL palier).
  v_months_total := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM p_date_arrivee))::int * 12
                  + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM p_date_arrivee))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM p_date_arrivee) THEN
    v_months_total := v_months_total - 1;
  END IF;
  IF v_months_total < 0 THEN v_months_total := 0; END IF;

  -- Cycle anniversaire courant.
  v_cycle_debut := public.get_conges_period_start(p_date_arrivee, p_date_reference);

  v_months_in_cycle := (EXTRACT(YEAR FROM p_date_reference) - EXTRACT(YEAR FROM v_cycle_debut))::int * 12
                     + (EXTRACT(MONTH FROM p_date_reference) - EXTRACT(MONTH FROM v_cycle_debut))::int;
  IF EXTRACT(DAY FROM p_date_reference) < EXTRACT(DAY FROM v_cycle_debut) THEN
    v_months_in_cycle := v_months_in_cycle - 1;
  END IF;
  IF v_months_in_cycle < 0 THEN v_months_in_cycle := 0; END IF;

  -- AL acquis linéaire : min(22, months_in_cycle × 22/12).
  v_al_acquis := LEAST(
    p_jours_al_par_cycle,
    ROUND((v_months_in_cycle::NUMERIC * p_jours_al_par_cycle / 12)::NUMERIC, 2)
  );

  -- SL palier (inchangé vs v1).
  IF v_months_total < 6 THEN
    v_sl_droit := 0;
  ELSIF v_months_total < 12 THEN
    v_sl_droit := LEAST(6, v_months_total - 5);
  ELSE
    v_sl_droit := p_jours_sl_par_cycle;
  END IF;

  RETURN QUERY SELECT
    v_al_acquis,
    CASE WHEN v_months_total >= 12 THEN v_al_acquis ELSE 0::NUMERIC END,
    v_sl_droit,
    v_months_in_cycle;
END $fn$;

COMMENT ON FUNCTION public.get_conges_droits_v2(DATE, DATE, NUMERIC, NUMERIC) IS
  'G5 - Modèle C accrual linéaire mensuel. al_acquis = months_in_cycle × 22/12,
   al_utilisable = 0 avant M12 puis = al_acquis. Base pour paiement
   compensatoire (WRA S.45(2)) et provisions IAS 19.';

-- ─── 2. Colonne al_acquis sur soldes_conges ──────────────────────────
ALTER TABLE public.soldes_conges
  ADD COLUMN IF NOT EXISTS al_acquis NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.soldes_conges.al_acquis IS
  'G5 - AL acquis Modèle C (accrual linéaire 22/12 par mois). Base pour
   paiement compensatoire et provisions IAS 19. Distinct de al_droit
   (valeur utilisable, = 0 avant M12).';

-- ─── 3. Backfill soldes actifs ───────────────────────────────────────
UPDATE public.soldes_conges sc
SET al_acquis = v2.al_acquis
FROM public.employes e,
LATERAL public.get_conges_droits_v2(
  e.date_arrivee,
  LEAST(CURRENT_DATE, sc.periode_fin)
) v2
WHERE sc.employe_id = e.id
  AND e.date_depart IS NULL
  AND sc.periode_debut <= CURRENT_DATE
  AND sc.periode_fin >= CURRENT_DATE;

-- ─── 4. Vue enrichie ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_soldes_conges_detail AS
SELECT
  sc.*,
  e.prenom, e.nom, e.date_arrivee, e.salaire_base,
  (sc.al_acquis - sc.al_pris)::NUMERIC AS al_solde_acquis,
  ROUND(
    ((sc.al_acquis - sc.al_pris) * (COALESCE(e.salaire_base, 0)::numeric / 22))::numeric,
    2
  ) AS compensation_estimee_mur
FROM public.soldes_conges sc
JOIN public.employes e ON e.id = sc.employe_id;

COMMENT ON VIEW public.v_soldes_conges_detail IS
  'G5 - Vue enrichie soldes_conges + al_solde_acquis (al_acquis - al_pris)
   + compensation_estimee_mur (solde_acquis × salaire/22) pour dashboard
   provisions IAS 19.';
