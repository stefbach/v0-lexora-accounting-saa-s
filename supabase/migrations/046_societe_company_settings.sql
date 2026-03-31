-- Paramètres société enrichis pour le module RH/Paie
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS ern TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS npf_number TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS nature_business TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS date_incorporation DATE;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Contact
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS contact_position TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS adresse2 TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS fax TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS email_dco TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS distance_pointage INTEGER DEFAULT 50;

-- Payroll settings
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS period_closing_day INTEGER DEFAULT 24;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS pay_day INTEGER DEFAULT 28;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS salary_frequency TEXT DEFAULT 'monthly' CHECK (salary_frequency IN ('monthly','fortnightly','weekly'));
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS eoy_bonus_mode TEXT DEFAULT 'separated' CHECK (eoy_bonus_mode IN ('separated','included'));
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS declaration_type TEXT DEFAULT 'MRA_PACO';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS payslip_template TEXT DEFAULT 'basic';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS payslip_language TEXT DEFAULT 'fr' CHECK (payslip_language IN ('fr','en'));
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS devises_actives JSONB DEFAULT '["MUR","EUR","USD"]';
