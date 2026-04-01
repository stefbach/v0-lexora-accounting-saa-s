-- ============================================================
-- Migration 039: Compte Courant Associe & Payment Mode
-- ============================================================
-- Support for "paye par associe/collaborateur" in Mauritius accounting
-- Account 455 = Compte Courant Associe
-- Account 467 = Autres debiteurs/crediteurs (avances collaborateurs)

-- Add payment mode to factures
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT 'banque'
  CHECK (mode_paiement IN ('banque', 'associe', 'collaborateur', 'especes', 'carte'));
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS paye_par TEXT; -- name of associate or employee

-- Create compte courant associe tracking table
CREATE TABLE IF NOT EXISTS public.comptes_courants_associes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL, -- associate name
  type TEXT DEFAULT 'associe' CHECK (type IN ('associe', 'collaborateur')),
  solde NUMERIC(15,2) DEFAULT 0, -- positive = company owes associate
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cca_societe ON public.comptes_courants_associes(societe_id);

ALTER TABLE public.comptes_courants_associes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cca_auth" ON public.comptes_courants_associes
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Movements table for tracking each advance and reimbursement
CREATE TABLE IF NOT EXISTS public.mouvements_compte_courant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_courant_id UUID NOT NULL REFERENCES public.comptes_courants_associes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id),
  date_mouvement DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('avance', 'remboursement', 'salaire', 'dividende')),
  montant NUMERIC(15,2) NOT NULL, -- positive = associate pays for company, negative = company reimburses
  description TEXT,
  facture_id UUID REFERENCES public.factures(id),
  document_id UUID,
  lettre TEXT, -- for matching advance with reimbursement
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcc_compte ON public.mouvements_compte_courant(compte_courant_id);
CREATE INDEX IF NOT EXISTS idx_mcc_societe ON public.mouvements_compte_courant(societe_id);

ALTER TABLE public.mouvements_compte_courant ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcc_auth" ON public.mouvements_compte_courant
  FOR ALL USING (auth.uid() IS NOT NULL);
