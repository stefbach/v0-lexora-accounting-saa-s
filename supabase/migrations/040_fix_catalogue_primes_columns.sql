-- Fix catalogue_primes: add missing columns that the API expects
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS type_prime VARCHAR(30);
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS montant_par_unite DECIMAL(12,2);
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS unite VARCHAR(50);
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS bonus_objectif_montant DECIMAL(12,2);
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS postes_eligibles TEXT;
ALTER TABLE public.catalogue_primes ADD COLUMN IF NOT EXISTS periode_application VARCHAR(20) DEFAULT 'mensuel';

-- Copy data from old columns to new if they exist
UPDATE public.catalogue_primes SET type_prime = type WHERE type_prime IS NULL AND type IS NOT NULL;
UPDATE public.catalogue_primes SET montant_par_unite = tarif_unitaire WHERE montant_par_unite IS NULL AND tarif_unitaire IS NOT NULL;
UPDATE public.catalogue_primes SET unite = unite_libelle WHERE unite IS NULL AND unite_libelle IS NOT NULL;
UPDATE public.catalogue_primes SET bonus_objectif_montant = bonus_si_atteint WHERE bonus_objectif_montant IS NULL AND bonus_si_atteint IS NOT NULL;

-- Fix primes_variables_mois: add missing columns
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS saisi_par UUID;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS approuve_par UUID;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS approuve_at TIMESTAMPTZ;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS integre_paie BOOLEAN DEFAULT false;
ALTER TABLE public.primes_variables_mois ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure unique constraint for upsert
DO $$ BEGIN
  ALTER TABLE public.primes_variables_mois ADD CONSTRAINT primes_var_unique UNIQUE (employe_id, prime_id, periode);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
