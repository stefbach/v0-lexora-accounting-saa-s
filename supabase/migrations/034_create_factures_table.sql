-- ============================================================
-- Migration 034: Create factures table if not exists
-- ============================================================
-- Required for bank reconciliation (rapprochement auto)

CREATE TABLE IF NOT EXISTS public.factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES public.dossiers(id),
  numero_facture TEXT,
  type_facture TEXT DEFAULT 'client' CHECK (type_facture IN ('client', 'fournisseur')),
  tiers TEXT,
  description TEXT,
  date_facture DATE,
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

CREATE POLICY IF NOT EXISTS "factures_auth" ON public.factures
  FOR ALL USING (auth.uid() IS NOT NULL);
