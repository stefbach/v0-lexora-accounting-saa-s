-- Colonnes manquantes pour import payroll report
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS code_employe TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS departement TEXT;

-- Colonnes manquantes sur bulletins_paie pour source OCR
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'calcul';
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS special_allowance_2 DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS special_allowance_3 DECIMAL(12,2) DEFAULT 0;

-- Index code_employe
CREATE INDEX IF NOT EXISTS idx_emp_code ON public.employes(code_employe) WHERE code_employe IS NOT NULL;
