-- Migration 041: Regles de primes configurables (AI Prime Builder)
CREATE TABLE IF NOT EXISTS public.regles_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('fixe', 'pourcentage', 'par_heure', 'par_jour', 'par_anciennete', 'objectif', 'assiduite')),
  montant NUMERIC(15,2) DEFAULT 0,
  taux NUMERIC(5,2) DEFAULT 0,
  scope TEXT DEFAULT 'tous' CHECK (scope IN ('tous', 'groupe', 'departement', 'individuel')),
  scope_value TEXT,
  conditions JSONB DEFAULT '{}',
  periode TEXT DEFAULT 'mensuel' CHECK (periode IN ('mensuel', 'trimestriel', 'annuel')),
  plafond NUMERIC(15,2),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.regles_primes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rp_auth" ON public.regles_primes FOR ALL USING (auth.uid() IS NOT NULL);

-- Table pour stocker les calculs de primes generes par les regles
CREATE TABLE IF NOT EXISTS public.calculs_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regle_prime_id UUID NOT NULL REFERENCES public.regles_primes(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  montant_calcule NUMERIC(15,2) NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}',
  statut TEXT DEFAULT 'calcule' CHECK (statut IN ('calcule', 'valide', 'integre')),
  valide_par UUID REFERENCES auth.users(id),
  valide_at TIMESTAMPTZ,
  integre_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.calculs_primes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_auth" ON public.calculs_primes FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_regles_primes_societe ON public.regles_primes(societe_id);
CREATE INDEX IF NOT EXISTS idx_calculs_primes_periode ON public.calculs_primes(societe_id, periode);
CREATE INDEX IF NOT EXISTS idx_calculs_primes_employe ON public.calculs_primes(employe_id, periode);
