-- ============================================================
-- Migration 181 — Sprint bugs résiduels H10
--
-- Trigger qui nettoie les anciens soldes_conges d'un employé quand
-- sa date_arrivee est modifiée. Avant ce trigger, modifier la
-- date_arrivee créait un nouveau solde (via la logique applicative
-- qui regénère) mais ne supprimait PAS l'ancien → on se retrouvait
-- avec 2 lignes dans soldes_conges pour le même employé.
--
-- STRATÉGIE
-- OLD.date_arrivee IS DISTINCT FROM NEW.date_arrivee :
--   1. Calculer le nouveau cycle anniversaire via get_conges_period_start.
--   2. Snapshot dans _soldes_conges_legacy_deleted_h10 toutes les rows
--      qui ne correspondent PAS au nouveau cycle.
--   3. Supprimer ces rows obsolètes.
--
-- La (re)création du solde courant reste gérée par la logique
-- applicative (recomputeSoldeCongesAll en amont du changement).
--
-- Note : on ne touche PAS aux rows anciennes cycles dont la
-- periode_fin est dans le passé (ce sont des historiques légitimes
-- pour un employé qui a changé plusieurs fois de cycle). On cible
-- uniquement les rows dont la periode chevauche CURRENT_DATE mais
-- n'est pas le nouveau cycle attendu.
--
-- IDEMPOTENTE.
-- ============================================================

-- 1. Table de backup (idempotente).
CREATE TABLE IF NOT EXISTS public._soldes_conges_legacy_deleted_h10 (
  LIKE public.soldes_conges INCLUDING ALL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_soldes_conges_legacy_deleted_h10'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public._soldes_conges_legacy_deleted_h10
      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_soldes_conges_legacy_deleted_h10'
      AND column_name = 'old_date_arrivee'
  ) THEN
    ALTER TABLE public._soldes_conges_legacy_deleted_h10
      ADD COLUMN old_date_arrivee DATE,
      ADD COLUMN new_date_arrivee DATE;
  END IF;
END $$;

COMMENT ON TABLE public._soldes_conges_legacy_deleted_h10 IS
  'H10 — Snapshot des soldes_conges supprimés automatiquement suite à
   un changement de date_arrivee employé. old/new_date_arrivee pour
   audit.';

-- 2. Fonction trigger.
CREATE OR REPLACE FUNCTION public.trg_employes_date_arrivee_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_nouveau_cycle_debut DATE;
  v_nouveau_cycle_fin DATE;
BEGIN
  IF OLD.date_arrivee IS DISTINCT FROM NEW.date_arrivee AND NEW.date_arrivee IS NOT NULL THEN
    -- Nouveau cycle anniversaire courant (anchor sur la NEW.date_arrivee).
    v_nouveau_cycle_debut := public.get_conges_period_start(NEW.date_arrivee, CURRENT_DATE);
    v_nouveau_cycle_fin := (v_nouveau_cycle_debut + INTERVAL '1 year' - INTERVAL '1 day')::DATE;

    -- Snapshot des soldes qui chevauchent aujourd'hui MAIS ne
    -- correspondent pas au nouveau cycle.
    INSERT INTO public._soldes_conges_legacy_deleted_h10
    SELECT sc.*, NOW()::timestamptz, OLD.date_arrivee, NEW.date_arrivee
    FROM public.soldes_conges sc
    WHERE sc.employe_id = NEW.id
      AND sc.periode_debut <= CURRENT_DATE
      AND sc.periode_fin >= CURRENT_DATE
      AND (sc.periode_debut <> v_nouveau_cycle_debut OR sc.periode_fin <> v_nouveau_cycle_fin);

    -- Suppression.
    DELETE FROM public.soldes_conges
    WHERE employe_id = NEW.id
      AND periode_debut <= CURRENT_DATE
      AND periode_fin >= CURRENT_DATE
      AND (periode_debut <> v_nouveau_cycle_debut OR periode_fin <> v_nouveau_cycle_fin);
  END IF;
  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.trg_employes_date_arrivee_changed() IS
  'H10 — Nettoie les soldes_conges obsolètes quand employes.date_arrivee
   change. Snapshot dans _soldes_conges_legacy_deleted_h10.';

-- 3. Trigger AFTER UPDATE (idempotent).
DROP TRIGGER IF EXISTS trg_employes_date_arrivee_cleanup ON public.employes;
CREATE TRIGGER trg_employes_date_arrivee_cleanup
AFTER UPDATE ON public.employes
FOR EACH ROW EXECUTE FUNCTION public.trg_employes_date_arrivee_changed();
