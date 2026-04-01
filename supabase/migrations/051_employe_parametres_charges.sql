-- Paramètres de paie par employé — charges et résidence
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_mra BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_csg BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_nsf BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_paye BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_training_levy BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_prgf BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS inclus_yeb BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT 'bulk';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS hors_charges_motif TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS pays_residence TEXT DEFAULT 'MU';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS travaille_etranger BOOLEAN DEFAULT false;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS regime_fiscal TEXT DEFAULT 'standard';
-- regime_fiscal: standard | expatrie | consultant | special
-- standard = charges MRA normales (CSG, NSF, PAYE, Training, PRGF)
-- expatrie = travaille depuis l'étranger, hors charges MRA
-- consultant = prestataire externe, hors tout
-- special = paramétrage custom (utilise les flags inclus_xxx)
