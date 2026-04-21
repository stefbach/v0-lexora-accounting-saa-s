-- ============================================================
-- Migration 156 — F6 Sprint "Années par anniversaire" — ÉTAPE A.4
--
-- Recompute BULK de toute la table soldes_conges sur la base des vraies
-- périodes 12 mois (anniversaire de date_arrivee), en repartant des
-- demandes approuvées comme source de vérité.
--
-- POURQUOI ?
--   La mig 155 a ajouté periode_debut/periode_fin et les a remplies
--   mécaniquement depuis l'ancien champ `annee`. MAIS elle n'a PAS
--   recalculé al_pris / sl_pris. Résultat : les valeurs sont
--   incohérentes avec les nouvelles périodes.
--
-- STRATÉGIE :
--   1. Backup avant DELETE (immuable)
--   2. DELETE FROM soldes_conges (on repart from scratch)
--   3. INSERT via CTE qui UNION :
--        - les périodes où au moins une demande approuvée existe
--        - la période courante de chaque employé actif (même sans demande)
--   4. al_droit / sl_droit selon is_eligible_conges
--   5. al_pris / sl_pris = SUM des demandes approuvées dans la période
--
-- CONTRAINTE GENERATED COLUMNS :
--   al_solde et sl_solde sont GENERATED ALWAYS (= al_droit+al_reporte-al_pris
--   et sl_droit+sl_accumule-sl_pris). On ne les insère PAS explicitement.
--   Si un employé non-éligible a déjà des demandes, al_solde sera négatif
--   (visible volontairement = donnée à nettoyer manuellement).
--
-- PRÉREQUIS : mig 154 (fonctions SQL) + mig 155 (schéma periode_debut/fin).
-- IDEMPOTENT : DELETE + INSERT. Peut être rejoué.
-- ============================================================

-- 1. Backup immuable avant DELETE
CREATE TABLE IF NOT EXISTS public.soldes_conges_backup_before_156 AS
  SELECT * FROM public.soldes_conges;

-- 2. DELETE intégral
DELETE FROM public.soldes_conges;

-- 3. Recompute depuis demandes_conges
WITH demandes_periods AS (
  -- 3a. Périodes où au moins une demande approuvée existe
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

  -- 3b. Période courante de chaque employé actif (même sans demande)
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
    dp.date_arrivee,
    dp.periode_debut,
    dp.periode_fin,
    public.is_eligible_conges(dp.date_arrivee, dp.periode_debut) AS eligible,
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
  EXTRACT(YEAR FROM c.periode_debut)::int AS annee,
  c.periode_debut,
  c.periode_fin,
  CASE WHEN c.eligible THEN 22 ELSE 0 END AS al_droit,
  c.al_sum AS al_pris,
  0 AS al_reporte,
  CASE WHEN c.eligible THEN 15 ELSE 0 END AS sl_droit,
  c.sl_sum AS sl_pris,
  0 AS sl_accumule,
  NOW() AS updated_at
FROM calculs c;

-- 4. Doc
COMMENT ON TABLE public.soldes_conges_backup_before_156 IS
  'Backup de soldes_conges avant le recompute bulk A.4 (mig 156). À supprimer après validation période stable.';
