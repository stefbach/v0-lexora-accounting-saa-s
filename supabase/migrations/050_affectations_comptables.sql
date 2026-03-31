-- Règles d'affectation automatique fournisseur → compte comptable
CREATE TABLE IF NOT EXISTS public.affectations_comptables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  fournisseur TEXT NOT NULL,  -- nom du fournisseur (normalisé en majuscules)
  fournisseur_patterns TEXT[], -- patterns de reconnaissance (ex: 'EMTEL', 'MTML', 'ORANGE')
  compte TEXT NOT NULL,  -- compte comptable (ex: '626', '612', '651')
  libelle_compte TEXT,  -- ex: 'Telecom', 'Loyer', 'SaaS'
  journal TEXT DEFAULT 'ACH',
  auto_lettrage BOOLEAN DEFAULT false,  -- si true, pas besoin de lettrage manuel
  recurrent BOOLEAN DEFAULT false,  -- facture récurrente (loyer, abo)
  tva_deductible BOOLEAN DEFAULT true,
  notes TEXT,
  nb_utilisations INTEGER DEFAULT 0,
  derniere_utilisation TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, fournisseur)
);

CREATE INDEX IF NOT EXISTS idx_aff_societe ON public.affectations_comptables(societe_id);
CREATE INDEX IF NOT EXISTS idx_aff_fournisseur ON public.affectations_comptables(fournisseur);
ALTER TABLE public.affectations_comptables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rh_full_aff" ON public.affectations_comptables FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','client_admin','comptable','comptable_dedie'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
