-- Migration: Add missing columns to employes table
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS devise_salaire VARCHAR(3) DEFAULT 'MUR';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS taux_change_eur DECIMAL(10,4) DEFAULT 46.50;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS shift_template_id UUID;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS cycle_type TEXT DEFAULT 'standard';
