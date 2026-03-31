-- Mode de paiement par employé : bulk (MCB), individuel, espèces
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT 'bulk' CHECK (mode_paiement IN ('bulk', 'individuel', 'especes'));
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_mra BOOLEAN DEFAULT true;
