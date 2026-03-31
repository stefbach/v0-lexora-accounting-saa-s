-- Fiche employé enrichie — champs manquants inspirés de Payroll Mauritius

-- Personal
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS common_name TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS maiden_name TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS genre TEXT CHECK (genre IN ('M','F'));
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nationalite TEXT DEFAULT 'Mauritian';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS statut_marital TEXT DEFAULT 'single' CHECK (statut_marital IN ('single','married','divorced','widowed'));
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS badge_number TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS adresse2 TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS code_postal TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS mobile TEXT;

-- Employment
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_poste_actuel DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'default';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contrat_type TEXT DEFAULT 'fulltime' CHECK (contrat_type IN ('fulltime','parttime','contract','casual','intern'));
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS calendrier TEXT DEFAULT 'standard';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS site_bureau TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.employes(id);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_depart_type TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS raison_depart TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_suspension DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS raison_suspension TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS last_month_refund BOOLEAN DEFAULT false;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS notes_emploi TEXT;

-- Salary Settings
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS salary_payment_freq TEXT DEFAULT 'monthly';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nsf_csg_contribution BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS included_soe BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contribution_code TEXT DEFAULT 'S2_STANDARD';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS paye_income_tax BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS edf_submitted BOOLEAN DEFAULT false;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS edf_submitted_on DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS preferred_tax_rate TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS paye_previous_employment BOOLEAN DEFAULT false;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS paid_by_bank_transfer BOOLEAN DEFAULT true;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS payslip_language TEXT DEFAULT 'en';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS payslip_currency TEXT DEFAULT 'MUR';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS payslip_password TEXT;

-- Payroll Sections (composants de salaire permanents) — table séparée
CREATE TABLE IF NOT EXISTS public.employe_payroll_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  date_debut DATE,
  date_fin DATE,
  employer_multiplier DECIMAL(6,2) DEFAULT 0,
  employer_value DECIMAL(12,2) DEFAULT 0,
  employee_multiplier DECIMAL(6,2) DEFAULT 0,
  employee_value DECIMAL(12,2) DEFAULT 0,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, code)
);

-- Dependents (personnes à charge)
CREATE TABLE IF NOT EXISTS public.employe_dependents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  relation TEXT CHECK (relation IN ('spouse','child','parent','other')),
  date_naissance DATE,
  nic TEXT,
  actif BOOLEAN DEFAULT true
);

-- Loans (prêts/avances)
CREATE TABLE IF NOT EXISTS public.employe_loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'advance' CHECK (type IN ('advance','loan','deduction')),
  montant_total DECIMAL(12,2) NOT NULL,
  montant_mensuel DECIMAL(12,2) NOT NULL,
  solde_restant DECIMAL(12,2) NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE,
  description TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.employe_payroll_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employe_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employe_loans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "rh_full_eps" ON public.employe_payroll_sections FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "rh_full_ed" ON public.employe_dependents FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "rh_full_el" ON public.employe_loans FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
