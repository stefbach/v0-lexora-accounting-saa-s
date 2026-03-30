-- ============================================================
-- Fix pointages + primes tables for full functionality
-- ============================================================

-- 1. POINTAGES — add UNIQUE constraint + missing columns
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS type_entree TEXT DEFAULT 'manuel';
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS latitude_entree DECIMAL(10,8);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS longitude_entree DECIMAL(11,8);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS latitude_sortie DECIMAL(10,8);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS longitude_sortie DECIMAL(11,8);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS absent_justifie BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS motif_absence TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS type_absence TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS heures_normales NUMERIC(6,2);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS heures_ot_1_5x NUMERIC(6,2);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS heures_ot_2x NUMERIC(6,2);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS duree_travail NUMERIC(6,2);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS motif_correction TEXT;

-- Add UNIQUE constraint for upsert to work
DO $$ BEGIN
  ALTER TABLE public.pointages ADD CONSTRAINT pointages_employe_date_unique UNIQUE (employe_id, date_pointage);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. PRIMES — ensure columns match API expectations
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS prime_id UUID;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS saisi_par UUID;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS approuve BOOLEAN DEFAULT FALSE;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS approuve_par UUID;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS approuve_at TIMESTAMPTZ;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS integre_paie BOOLEAN DEFAULT FALSE;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS date_integration TIMESTAMPTZ;

-- UNIQUE constraint for primes upsert
DO $$ BEGIN
  ALTER TABLE public.primes_variables_mois ADD CONSTRAINT primes_employe_prime_periode_unique UNIQUE (employe_id, prime_id, periode);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. CATALOGUE_PRIMES — code column
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS societe_id UUID;

-- 4. BULLETINS_PAIE — UNIQUE constraint for upsert
DO $$ BEGIN
  ALTER TABLE public.bulletins_paie ADD CONSTRAINT bulletins_employe_periode_unique UNIQUE (employe_id, periode);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Ensure RLS is enabled on all RH tables
ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pointages_auth" ON public.pointages;
CREATE POLICY "pointages_auth" ON public.pointages FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE public.primes_variables_mois ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "primes_auth" ON public.primes_variables_mois;
CREATE POLICY "primes_auth" ON public.primes_variables_mois FOR ALL USING (auth.uid() IS NOT NULL);
