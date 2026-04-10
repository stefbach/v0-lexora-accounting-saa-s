-- Migration 124: Taux de change historiques + multi-devises
-- Permet de stocker le taux du JOUR de la transaction (compliance MRA)

-- S'assurer que la table taux_change a les bonnes colonnes
ALTER TABLE taux_change ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE taux_change ADD COLUMN IF NOT EXISTS date_taux DATE;

-- Index pour recherche historique efficace
CREATE INDEX IF NOT EXISTS idx_taux_change_devise_date
  ON taux_change(devise, date_taux DESC);

-- Contrainte unique (devise, date) si pas déjà là
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'taux_change_devise_date_key'
  ) THEN
    ALTER TABLE taux_change ADD CONSTRAINT taux_change_devise_date_key
      UNIQUE (devise, date_taux);
  END IF;
END $$;
