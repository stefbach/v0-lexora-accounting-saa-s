-- PRGF: rename from "par jour" to percentage-based (4.5% du brut)
-- Add prgf_taux column, migrate existing data, keep backward compat

ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS prgf_taux DECIMAL(6,4) DEFAULT 0.045;

-- Add salary_compensation and jours_feries columns
ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS salary_compensation DECIMAL(10,2) DEFAULT 635,
  ADD COLUMN IF NOT EXISTS jours_feries JSONB DEFAULT '[]'::jsonb;

-- Set prgf_taux for existing rows (keep old column for backward compat)
UPDATE public.parametres_paie_mra SET prgf_taux = 0.045 WHERE prgf_taux IS NULL;
