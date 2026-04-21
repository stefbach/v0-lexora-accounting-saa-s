-- ============================================================
-- Migration 155 — F6 Sprint "Années par anniversaire" — ÉTAPE A.2
--
-- Refonte du schéma soldes_conges pour indexer par période de 12 mois
-- (basée sur la date anniversaire d'arrivée) au lieu d'une année civile.
--
-- STRATÉGIE :
--   - Backup immuable avant modif : soldes_conges_backup_20260421
--   - Ajout periode_debut + periode_fin (nullable) → backfill via les
--     fonctions SQL de la mig 154 → SET NOT NULL
--   - DÉDUP des rows historiques qui se retrouvent sur la même période
--     (cas : un employé arrivé en cours d'année avait une row par année
--     civile, plusieurs rows peuvent converger vers la même période 12m).
--     On garde la row avec le `annee` le plus élevé (=latest). A.4 refera
--     un recompute complet depuis demandes_conges de toute façon.
--   - Nouvelle contrainte UNIQUE (employe_id, periode_debut)
--   - L'ancienne colonne `annee` est CONSERVÉE (rétrocompat étape B).
--
-- Idempotente : IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
-- Prérequis : migration 154 (fonctions get_conges_period_start/end).
-- ============================================================

-- 1. Backup
CREATE TABLE IF NOT EXISTS public.soldes_conges_backup_20260421 AS
  SELECT * FROM public.soldes_conges;

-- 2. Nouvelles colonnes
ALTER TABLE public.soldes_conges
  ADD COLUMN IF NOT EXISTS periode_debut DATE,
  ADD COLUMN IF NOT EXISTS periode_fin DATE;

-- 3. Backfill
UPDATE public.soldes_conges sc
SET
  periode_debut = public.get_conges_period_start(e.date_arrivee, MAKE_DATE(sc.annee, 7, 1)),
  periode_fin   = public.get_conges_period_end(e.date_arrivee, MAKE_DATE(sc.annee, 7, 1))
FROM public.employes e
WHERE sc.employe_id = e.id
  AND e.date_arrivee IS NOT NULL
  AND sc.periode_debut IS NULL;

-- 4. Dédup : pour chaque (employe_id, periode_debut), conserver la row
--    avec l'annee la plus élevée, puis updated_at la plus récente en cas
--    d'égalité. Les rows supprimées sont archivées dans le backup (étape 1).
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY employe_id, periode_debut
      ORDER BY annee DESC, updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.soldes_conges
  WHERE periode_debut IS NOT NULL
)
DELETE FROM public.soldes_conges
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 5. NOT NULL maintenant que toutes les rows restantes ont periode_debut/fin
ALTER TABLE public.soldes_conges
  ALTER COLUMN periode_debut SET NOT NULL,
  ALTER COLUMN periode_fin SET NOT NULL;

-- 6. Remplacer la contrainte unique
ALTER TABLE public.soldes_conges
  DROP CONSTRAINT IF EXISTS soldes_conges_employe_id_annee_key;

ALTER TABLE public.soldes_conges
  DROP CONSTRAINT IF EXISTS soldes_conges_employe_periode_unique;

ALTER TABLE public.soldes_conges
  ADD CONSTRAINT soldes_conges_employe_periode_unique
  UNIQUE (employe_id, periode_debut);

-- 7. Index de perf
CREATE INDEX IF NOT EXISTS idx_soldes_conges_periode
  ON public.soldes_conges (employe_id, periode_debut, periode_fin);

-- 8. Doc
COMMENT ON COLUMN public.soldes_conges.periode_debut IS
  'Début de la période de 12 mois (basée sur la date anniversaire d''arrivée). Clé unique avec employe_id depuis mig 155.';
COMMENT ON COLUMN public.soldes_conges.periode_fin IS
  'Fin (inclusive) de la période = periode_debut + 12 mois - 1 jour.';
COMMENT ON COLUMN public.soldes_conges.annee IS
  'DEPRECATED — conservé temporairement pour rétrocompat étape B. Source de vérité = periode_debut/fin.';
