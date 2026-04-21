-- ============================================================
-- Migration 157 — F6 Sprint "Années par anniversaire" — ÉTAPE A.4-bis
--
-- Règle d'accrual WRA 2019 (confirmée VacationTracker / Expat.com / UOM) :
--
--   Ancienneté < 6 mois : 0 AL, 0 SL
--   Ancienneté 6-12 mois : +1 AL/mois + 1 SL/mois, MAX 6 chacun au 11ᵉ mois
--   Ancienneté ≥ 12 mois : 22 AL + 15 SL pleins pour CHAQUE période 12 mois
--
-- Note : les 6 jours accrus en période d'acquisition ne se reportent PAS
-- sur la période suivante (reset à 22/15 à la date anniversaire = pratique
-- standard, la loi est silencieuse sur le report).
--
-- IDEMPOTENT :
--   - CREATE OR REPLACE FUNCTION pour get_conges_droits
--   - DELETE + INSERT pour recompute bulk (rejouable)
-- ============================================================

-- ─── Fonction get_conges_droits ──────────────────────────────────────
-- Retourne (al_droit, sl_droit) selon l'ancienneté de l'employé à
-- date_reference. Immutable → peut être appelée dans les CTE/INSERT.
CREATE OR REPLACE FUNCTION public.get_conges_droits(
  date_arrivee DATE,
  date_reference DATE
) RETURNS TABLE(al_droit NUMERIC, sl_droit NUMERIC) AS $$
DECLARE
  months_elapsed INT;
  accrued INT;
BEGIN
  -- Garde-fou : date_reference avant date_arrivee → 0/0
  IF date_reference < date_arrivee THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Nombre de mois CALENDAIRES révolus entre l'arrivée et la référence
  months_elapsed := (EXTRACT(YEAR FROM date_reference) - EXTRACT(YEAR FROM date_arrivee))::int * 12
                    + (EXTRACT(MONTH FROM date_reference) - EXTRACT(MONTH FROM date_arrivee))::int;
  IF EXTRACT(DAY FROM date_reference) < EXTRACT(DAY FROM date_arrivee) THEN
    months_elapsed := months_elapsed - 1;
  END IF;

  -- Cas 1 : < 6 mois → pas d'acquisition
  IF months_elapsed < 6 THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Cas 2 : 6-11 mois → accrual progressif, max 6
  --   mois 6 : 1 jour   mois 9  : 4 jours
  --   mois 7 : 2 jours  mois 10 : 5 jours
  --   mois 8 : 3 jours  mois 11 : 6 jours
  IF months_elapsed < 12 THEN
    accrued := LEAST(6, months_elapsed - 5);
    RETURN QUERY SELECT accrued::NUMERIC, accrued::NUMERIC;
    RETURN;
  END IF;

  -- Cas 3 : ≥ 12 mois → plein droit pour la période en cours
  RETURN QUERY SELECT 22::NUMERIC, 15::NUMERIC;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_conges_droits(DATE, DATE) IS
  'WRA 2019 — retourne (al_droit, sl_droit) selon l''ancienneté : <6m=0/0, 6-11m=accrual 1/mois max 6, >=12m=22/15.';

-- ─── Recompute bulk avec la nouvelle logique ─────────────────────────
-- Note : al_solde/sl_solde sont GENERATED ALWAYS (al_droit+al_reporte-al_pris),
-- donc PAS insérées explicitement. Idem mig 156.

DELETE FROM public.soldes_conges;

WITH demandes_periods AS (
  SELECT DISTINCT
    dc.employe_id,
    e.date_arrivee,
    public.get_conges_period_start(e.date_arrivee, dc.date_debut) AS periode_debut,
    public.get_conges_period_end(e.date_arrivee, dc.date_debut)   AS periode_fin
  FROM public.demandes_conges dc
  JOIN public.employes e ON e.id = dc.employe_id
  WHERE dc.statut = 'approuve'
    AND e.date_arrivee IS NOT NULL

  UNION

  SELECT
    e.id AS employe_id,
    e.date_arrivee,
    public.get_conges_period_start(e.date_arrivee, CURRENT_DATE) AS periode_debut,
    public.get_conges_period_end(e.date_arrivee, CURRENT_DATE)   AS periode_fin
  FROM public.employes e
  WHERE e.actif = true
    AND e.date_arrivee IS NOT NULL
),
calculs AS (
  SELECT
    dp.employe_id,
    dp.periode_debut,
    dp.periode_fin,
    -- Droits calculés à LEAST(today, periode_fin) :
    --   - période courante → droits accumulés à aujourd'hui
    --   - période passée   → droits maxés à la fin de période
    --   - période future   → ne devrait pas exister (garde-fou)
    (public.get_conges_droits(dp.date_arrivee, LEAST(CURRENT_DATE, dp.periode_fin))).al_droit AS al_droit_calc,
    (public.get_conges_droits(dp.date_arrivee, LEAST(CURRENT_DATE, dp.periode_fin))).sl_droit AS sl_droit_calc,
    COALESCE(SUM(CASE WHEN dc.type_conge = 'AL' THEN dc.nb_jours ELSE 0 END), 0) AS al_sum,
    COALESCE(SUM(CASE WHEN dc.type_conge = 'SL' THEN dc.nb_jours ELSE 0 END), 0) AS sl_sum
  FROM demandes_periods dp
  LEFT JOIN public.demandes_conges dc
    ON dc.employe_id = dp.employe_id
   AND dc.statut = 'approuve'
   AND dc.date_debut BETWEEN dp.periode_debut AND dp.periode_fin
  GROUP BY dp.employe_id, dp.date_arrivee, dp.periode_debut, dp.periode_fin
)
INSERT INTO public.soldes_conges (
  employe_id,
  annee,
  periode_debut,
  periode_fin,
  al_droit,
  al_pris,
  al_reporte,
  sl_droit,
  sl_pris,
  sl_accumule,
  updated_at
)
SELECT
  c.employe_id,
  EXTRACT(YEAR FROM c.periode_debut)::int,
  c.periode_debut,
  c.periode_fin,
  c.al_droit_calc,
  c.al_sum,
  0,
  c.sl_droit_calc,
  c.sl_sum,
  0,
  NOW()
FROM calculs c;
