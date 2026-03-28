-- ============================================================
-- Migration 012: Critical fixes — colonnes manquantes, tables,
--                cron_logs, RLS, notifications
-- ============================================================

-- 1. Colonnes manquantes dans societes
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS nombre_employes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assujetti_aps BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS assujetti_tva BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_incorporation DATE;

-- Gestion du statut: peut déjà exister avec contrainte différente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'societes' AND column_name = 'statut'
  ) THEN
    ALTER TABLE public.societes ADD COLUMN statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif'));
  END IF;
END $$;

-- 2. Table declarations_fiscales
CREATE TABLE IF NOT EXISTS public.declarations_fiscales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  type_declaration TEXT NOT NULL CHECK (type_declaration IN ('tva', 'aps', 'csg', 'roc', 'paye', 'is')),
  periode TEXT NOT NULL,
  date_echeance DATE,
  date_soumission DATE,
  montant NUMERIC(15,2) DEFAULT 0,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'soumis', 'paye', 'retard')),
  reference_mra TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declarations_societe ON public.declarations_fiscales(societe_id);
CREATE INDEX IF NOT EXISTS idx_declarations_type ON public.declarations_fiscales(type_declaration);
CREATE INDEX IF NOT EXISTS idx_declarations_periode ON public.declarations_fiscales(periode);

ALTER TABLE public.declarations_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "declarations_comptable_all" ON public.declarations_fiscales FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 3. Table factures (AR + AP)
CREATE TABLE IF NOT EXISTS public.factures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id),
  numero_facture TEXT,
  type_facture TEXT DEFAULT 'client' CHECK (type_facture IN ('client', 'fournisseur')),
  tiers TEXT,
  description TEXT,
  date_facture DATE NOT NULL,
  date_echeance DATE,
  devise TEXT DEFAULT 'MUR',
  taux_change NUMERIC(10,4) DEFAULT 1,
  montant_ht NUMERIC(15,2) DEFAULT 0,
  montant_tva NUMERIC(15,2) DEFAULT 0,
  montant_ttc NUMERIC(15,2) DEFAULT 0,
  taux_tva NUMERIC(5,2) DEFAULT 0,
  montant_mur NUMERIC(15,2) DEFAULT 0,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'partiel', 'paye', 'retard', 'annule')),
  document_id UUID REFERENCES public.documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_societe ON public.factures(societe_id);
CREATE INDEX IF NOT EXISTS idx_factures_date ON public.factures(date_facture);
CREATE INDEX IF NOT EXISTS idx_factures_type ON public.factures(type_facture);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON public.factures(statut);

ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "factures_auth_all" ON public.factures FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 4. Table depenses
CREATE TABLE IF NOT EXISTS public.depenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id),
  categorie TEXT NOT NULL,
  description TEXT,
  fournisseur TEXT,
  date_depense DATE NOT NULL,
  devise TEXT DEFAULT 'MUR',
  taux_change NUMERIC(10,4) DEFAULT 1,
  montant_ht NUMERIC(15,2) DEFAULT 0,
  montant_tva NUMERIC(15,2) DEFAULT 0,
  montant_ttc NUMERIC(15,2) DEFAULT 0,
  montant_mur NUMERIC(15,2) DEFAULT 0,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'paye', 'annule')),
  document_id UUID REFERENCES public.documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depenses_societe ON public.depenses(societe_id);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON public.depenses(date_depense);

ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "depenses_auth_all" ON public.depenses FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 5. Fix cron_logs: ajouter executed_at
ALTER TABLE public.cron_logs
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ DEFAULT NOW();

-- Synchro executed_at = started_at pour les existants
UPDATE public.cron_logs SET executed_at = started_at WHERE executed_at IS NULL AND started_at IS NOT NULL;

-- 6. Fix tva_mensuelle: ajouter client_id nullable
ALTER TABLE public.tva_mensuelle
  ADD COLUMN IF NOT EXISTS client_id UUID;

-- 7. Fix notifications: ajouter colonnes v2 manquantes
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS destinataire_type TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS titre TEXT,
  ADD COLUMN IF NOT EXISTS niveau TEXT DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS envoye_app BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cron_name TEXT;

-- 8. Fix RLS simulations et notifications (trop permissives)
DROP POLICY IF EXISTS "manage_sims" ON public.simulations;
DROP POLICY IF EXISTS "manage_notifs" ON public.notifications;

CREATE POLICY IF NOT EXISTS "simulations_auth" ON public.simulations FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "notifications_auth" ON public.notifications FOR ALL
  USING (auth.uid() = destinataire_id OR auth.uid() IS NOT NULL);

-- 9. Index supplémentaires pour performance
CREATE INDEX IF NOT EXISTS idx_ecritures_compte ON public.ecritures_comptables(compte);
CREATE INDEX IF NOT EXISTS idx_ecritures_journal ON public.ecritures_comptables(journal);
