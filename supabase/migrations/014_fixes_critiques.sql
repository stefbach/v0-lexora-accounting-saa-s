-- =============================================================================
-- MIGRATION 014 — FIXES CRITIQUES (Sprint 0)
-- LEXORA — Corrections bloquantes identifiées en production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- S0-1a : Ajouter societe_id sur ecritures_comptables (v1) via JOIN sur dossiers
-- -----------------------------------------------------------------------------
ALTER TABLE ecritures_comptables
  ADD COLUMN IF NOT EXISTS societe_id UUID REFERENCES societes(id);

-- Backfill : remplir societe_id depuis le dossier lié
UPDATE ecritures_comptables ec
SET societe_id = d.societe_id
FROM dossiers d
WHERE ec.dossier_id = d.id
  AND ec.societe_id IS NULL;

-- Index pour les requêtes par société
CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_societe_id
  ON ecritures_comptables(societe_id);

CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_dossier_societe
  ON ecritures_comptables(dossier_id, societe_id);

-- -----------------------------------------------------------------------------
-- S0-1b : Compléter ecritures_comptables_v2 (existe déjà via migration 007)
-- Migration 007 utilise : numero_compte, debit_mur, credit_mur, solde_mur, ref_folio, nom_compte, description, exercice
-- On ajoute les colonnes manquantes pour compatibilité avec le code Sprint 1
-- -----------------------------------------------------------------------------
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS dossier_id       UUID REFERENCES public.dossiers(id),
  ADD COLUMN IF NOT EXISTS numero_piece     TEXT,
  ADD COLUMN IF NOT EXISTS libelle          TEXT,
  ADD COLUMN IF NOT EXISTS piece_justificative UUID;

-- Alias pour compatibilité code (colonne virtuelle via vue ou on garde numero_compte)
-- Les index existent déjà (migration 007), on ajoute ceux manquants
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_dossier_id
  ON public.ecritures_comptables_v2(dossier_id);

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_id
  ON public.ecritures_comptables_v2(societe_id);

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_date_ecriture
  ON public.ecritures_comptables_v2(date_ecriture);

-- RLS pour ecritures_comptables_v2 (déjà activé en migration 007)
-- Ajout policy client_read si manquante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ecritures_comptables_v2' AND policyname = 'ecritures_v2_client_read'
  ) THEN
    CREATE POLICY ecritures_v2_client_read ON public.ecritures_comptables_v2
      FOR SELECT
      USING (
        societe_id IN (
          SELECT s.id FROM public.societes s
          JOIN public.dossiers d ON d.societe_id = s.id
          WHERE d.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- S0-2 : Fix trigger create_dossiers_for_societe — ajouter client_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_dossiers_for_societe()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO dossiers (societe_id, client_id, comptable_id, statut)
  VALUES (
    NEW.id,
    NEW.client_id,
    NEW.comptable_id,
    'actif'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger s'il existe
DROP TRIGGER IF EXISTS trigger_create_dossiers_for_societe ON societes;

CREATE TRIGGER trigger_create_dossiers_for_societe
  AFTER INSERT ON societes
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION create_dossiers_for_societe();

-- -----------------------------------------------------------------------------
-- S0-3a : Fix RLS notifications — remplacer USING(true) par politique correcte
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Drop all existing policies on notifications
  DROP POLICY IF EXISTS "notifications_select" ON notifications;
  DROP POLICY IF EXISTS "notifications_select_all" ON notifications;
  DROP POLICY IF EXISTS "notifications_insert" ON notifications;
  DROP POLICY IF EXISTS "notifications_update" ON notifications;
  DROP POLICY IF EXISTS "notifications_delete" ON notifications;
  DROP POLICY IF EXISTS "notifications_true" ON notifications;
  DROP POLICY IF EXISTS "allow_all" ON notifications;
  DROP POLICY IF EXISTS "Enable read access for all users" ON notifications;
  DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON notifications;
END $$;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_read ON notifications
  FOR SELECT
  USING (
    destinataire_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
  );

CREATE POLICY notifications_insert ON notifications
  FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
    OR destinataire_id = auth.uid()
  );

CREATE POLICY notifications_update ON notifications
  FOR UPDATE
  USING (
    destinataire_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
  );

-- -----------------------------------------------------------------------------
-- S0-3b : Fix RLS simulations — remplacer USING(true) par politique correcte
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "simulations_select" ON simulations;
  DROP POLICY IF EXISTS "simulations_select_all" ON simulations;
  DROP POLICY IF EXISTS "simulations_insert" ON simulations;
  DROP POLICY IF EXISTS "simulations_update" ON simulations;
  DROP POLICY IF EXISTS "simulations_delete" ON simulations;
  DROP POLICY IF EXISTS "simulations_true" ON simulations;
  DROP POLICY IF EXISTS "allow_all" ON simulations;
  DROP POLICY IF EXISTS "Enable read access for all users" ON simulations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY simulations_read ON simulations
    FOR SELECT
    USING (
      cree_par_id = auth.uid()
      OR public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
      OR visible_comptable = true
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY simulations_insert ON simulations
    FOR INSERT
    WITH CHECK (
      cree_par_id = auth.uid()
      OR public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY simulations_update ON simulations
    FOR UPDATE
    USING (
      cree_par_id = auth.uid()
      OR public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- S0-4 : Fix RLS comptes_bancaires — ajouter policy SELECT pour clients
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "comptes_bancaires_client_read" ON comptes_bancaires;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY comptes_bancaires_client_read ON comptes_bancaires
    FOR SELECT
    USING (
      -- Admin et comptables voient tout
      public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
      OR
      -- Client voit ses propres comptes via societes.client_id
      societe_id IN (
        SELECT id FROM societes WHERE client_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- S0-5 : Fix RLS bilans_officiels — clients peuvent voir si publie_client = true
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "bilans_officiels_client_read" ON bilans_officiels;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY bilans_officiels_client_read ON bilans_officiels
    FOR SELECT
    USING (
      public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie')
      OR (
        publie_client = true
        AND societe_id IN (
          SELECT id FROM societes WHERE client_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- S0-6 : Ajouter colonne corrige_manuellement sur documents
-- -----------------------------------------------------------------------------
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS corrige_manuellement BOOLEAN DEFAULT false;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS confiance_type INTEGER DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- S0-7 : Créer table tiers_patterns pour apprentissage OCR bancaire
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiers_patterns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID REFERENCES societes(id) ON DELETE CASCADE,
  pattern          TEXT NOT NULL,
  tiers_identifie  TEXT,
  compte_comptable TEXT,
  nb_utilisations  INTEGER DEFAULT 1,
  cree_par         UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(societe_id, pattern)
);

CREATE INDEX IF NOT EXISTS idx_tiers_patterns_societe_id
  ON tiers_patterns(societe_id);

CREATE INDEX IF NOT EXISTS idx_tiers_patterns_pattern
  ON tiers_patterns(pattern);

ALTER TABLE tiers_patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tiers_patterns' AND policyname = 'tiers_patterns_admin_comptable'
  ) THEN
    CREATE POLICY tiers_patterns_admin_comptable ON tiers_patterns
      FOR ALL
      USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tiers_patterns' AND policyname = 'tiers_patterns_client_read'
  ) THEN
    CREATE POLICY tiers_patterns_client_read ON tiers_patterns
      FOR SELECT
      USING (
        societe_id IN (
          SELECT id FROM societes WHERE client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- S0-8 : Ajouter colonnes transactions_bancaires (devise + change)
-- -----------------------------------------------------------------------------
ALTER TABLE transactions_bancaires
  ADD COLUMN IF NOT EXISTS devise_origine         TEXT,
  ADD COLUMN IF NOT EXISTS montant_origine         NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS taux_change_applique    NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS source_taux             TEXT DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS ecart_change_mur        NUMERIC(15,2) DEFAULT 0;

-- -----------------------------------------------------------------------------
-- S0-9 : Ajouter colonnes societes (exercice fiscal)
-- -----------------------------------------------------------------------------
ALTER TABLE societes
  ADD COLUMN IF NOT EXISTS date_debut_exercice DATE DEFAULT '2024-07-01',
  ADD COLUMN IF NOT EXISTS date_fin_exercice   DATE DEFAULT '2025-06-30',
  ADD COLUMN IF NOT EXISTS mois_cloture        INTEGER DEFAULT 6;

-- Index pour recherche par exercice
CREATE INDEX IF NOT EXISTS idx_societes_exercice
  ON societes(date_debut_exercice, date_fin_exercice);

-- =============================================================================
-- FIN MIGRATION 014
-- =============================================================================
