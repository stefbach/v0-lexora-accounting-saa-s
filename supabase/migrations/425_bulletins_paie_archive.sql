-- Migration 425 — Archivage des bulletins de paie (Bug C fix Alicia Désiré)
--
-- Contexte : actuellement un upsert sur bulletins_paie (onConflict
-- employe_id,periode) écrase l'ancien bulletin. Si un bulletin a été
-- généré au salaire complet AVANT la saisie de la sortie d'un employé,
-- on perd la version "mois entier" lors du recalcul en solde tout
-- compte. Le RH veut pouvoir consulter le bulletin historique.
--
-- Solution : versioning des bulletins. is_archived=true marque les
-- versions précédentes, superseded_by pointe vers le bulletin actif.
-- Index unique partiel garantit 1 seul bulletin actif par (employe,
-- periode), les archivés sont libres.

ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Index pour requêtes "actifs uniquement" (cas par défaut historique-paie)
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_active
  ON bulletins_paie(employe_id, periode) WHERE is_archived = false;

-- Index pour remonter la chaîne d'archives
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_archived
  ON bulletins_paie(superseded_by) WHERE is_archived = true;

-- Supprimer les anciennes contraintes UNIQUE (employe_id, periode)
-- — on tolère désormais plusieurs lignes : 1 active + N archivées.
-- Le nom de la contrainte n'est pas stable selon les migrations
-- historiques (037, 044, etc.), on scanne pg_constraint.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'bulletins_paie'
      AND n.nspname = 'public'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%employe_id%periode%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.bulletins_paie DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped unique constraint %', r.conname;
  END LOOP;
END $$;

-- Index unique partiel : 1 seul bulletin actif par (employe, periode).
-- Permet upsert(onConflict='employe_id,periode' WHERE is_archived=false)
-- côté API si besoin, mais notre flow archive d'abord puis insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bulletins_paie_active
  ON bulletins_paie(employe_id, periode) WHERE is_archived = false;

COMMENT ON COLUMN bulletins_paie.is_archived IS
  'Bug C fix (mig 425) : true si bulletin remplacé par une version plus récente. Index uq_bulletins_paie_active garantit 1 seul actif par (employe, periode).';
COMMENT ON COLUMN bulletins_paie.superseded_by IS
  'ID du bulletin qui remplace celui-ci (chaîne d''historique). NULL si actif.';
COMMENT ON COLUMN bulletins_paie.archived_at IS
  'Timestamp de l''archivage automatique lors du recalcul.';
COMMENT ON COLUMN bulletins_paie.archive_reason IS
  'Raison textuelle (ex : "Remplacé suite à recalcul (sortie/correction) le 25/05/2026").';
