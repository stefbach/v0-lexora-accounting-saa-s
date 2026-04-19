-- ============================================================================
-- Migration 159 — contrats_clients : sync montant ↔ montant_total + CHECK enums
-- ============================================================================
--
-- Contexte :
--   La migration 155 a ajouté une colonne `montant NUMERIC(18,2)` qui fait
--   doublon avec `montant_total NUMERIC(15,2)` créée en migration 125, sans
--   mécanisme de synchronisation — risque de divergence entre ancienne UI
--   (montant_total) et nouvelle UI (montant).
--
--   Les colonnes `frequence_facturation` et `action_renouvellement` étaient
--   déclarées TEXT sans CHECK constraint — un INSERT arbitraire peut y écrire
--   n'importe quoi.
--
-- Fix :
--   1) Ajoute CHECK constraints (idempotent via DO $$ block).
--   2) Installe un trigger BEFORE INSERT/UPDATE qui synchronise les deux
--      colonnes dans les deux sens. Priorité à `montant` en cas de conflit
--      (valeur saisie par la nouvelle UI).
--   3) Backfill : pour les lignes existantes où un seul des deux champs est
--      rempli, recopie l'autre côté.
--
-- Idempotente : DO $$ blocks + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- Non destructif : on NE supprime PAS la colonne `montant_total` (legacy).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CHECK constraints sur les enums TEXT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contrats_clients_frequence_check'
  ) THEN
    ALTER TABLE public.contrats_clients
      ADD CONSTRAINT contrats_clients_frequence_check
      CHECK (frequence_facturation IN ('ponctuel', 'mensuel', 'trimestriel', 'semestriel', 'annuel'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contrats_clients_action_renouv_check'
  ) THEN
    ALTER TABLE public.contrats_clients
      ADD CONSTRAINT contrats_clients_action_renouv_check
      CHECK (action_renouvellement IN ('aucun', 'tacite', 'manuel'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Trigger de synchronisation montant ↔ montant_total
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_contrats_montant()
RETURNS TRIGGER AS $$
BEGIN
  -- Si seul montant est fourni, copier vers montant_total
  IF NEW.montant IS NOT NULL AND NEW.montant_total IS NULL THEN
    NEW.montant_total = NEW.montant;
  END IF;
  -- Si seul montant_total est fourni, copier vers montant
  IF NEW.montant_total IS NOT NULL AND NEW.montant IS NULL THEN
    NEW.montant = NEW.montant_total;
  END IF;
  -- Si les deux sont fournis mais différents, prendre le dernier modifié
  -- (priorité à montant = nouvelle UI)
  IF NEW.montant IS NOT NULL AND NEW.montant_total IS NOT NULL
     AND NEW.montant <> NEW.montant_total THEN
    NEW.montant_total = NEW.montant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contrats_montant ON public.contrats_clients;
CREATE TRIGGER trg_sync_contrats_montant
BEFORE INSERT OR UPDATE OF montant, montant_total ON public.contrats_clients
FOR EACH ROW
EXECUTE FUNCTION fn_sync_contrats_montant();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Backfill des lignes existantes (un seul côté rempli)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.contrats_clients
  SET montant = montant_total
  WHERE montant IS NULL AND montant_total IS NOT NULL;

UPDATE public.contrats_clients
  SET montant_total = montant
  WHERE montant_total IS NULL AND montant IS NOT NULL;

COMMENT ON TRIGGER trg_sync_contrats_montant ON public.contrats_clients IS
  'Synchronise montant ↔ montant_total (legacy) pour éviter divergence entre ancienne/nouvelle UI.';
