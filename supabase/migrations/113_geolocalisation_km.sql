-- ============================================================
-- Migration 113: Géolocalisation collaborateurs + Indemnités kilométriques
-- ============================================================

-- 1. Adresses/positions domicile des employés
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS adresse_complete TEXT;

-- 2. Table des trajets kilométriques (GPS tracking step by step)
CREATE TABLE IF NOT EXISTS public.trajets_kilometriques (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_trajet DATE NOT NULL DEFAULT CURRENT_DATE,
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'termine', 'valide', 'rejete')),

  -- Point de départ
  depart_lat DECIMAL(10,7),
  depart_lng DECIMAL(10,7),
  depart_adresse TEXT,
  depart_heure TIMESTAMPTZ,

  -- Point d'arrivée final
  arrivee_lat DECIMAL(10,7),
  arrivee_lng DECIMAL(10,7),
  arrivee_adresse TEXT,
  arrivee_heure TIMESTAMPTZ,

  -- Calculs
  distance_totale_km DECIMAL(8,2) DEFAULT 0,
  montant_indemnite DECIMAL(10,2) DEFAULT 0,
  taux_km_applique DECIMAL(6,2) DEFAULT 0,

  -- Metadata
  motif TEXT,
  vehicule TEXT DEFAULT 'voiture' CHECK (vehicule IN ('voiture', 'moto', 'velo')),
  notes TEXT,
  approuve_par UUID,
  date_approbation TIMESTAMPTZ,
  integre_paie BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trajets_employe ON public.trajets_kilometriques(employe_id, date_trajet DESC);
CREATE INDEX IF NOT EXISTS idx_trajets_societe ON public.trajets_kilometriques(societe_id, date_trajet DESC);

-- 3. Steps de géolocalisation par trajet (chaque checkpoint GPS)
CREATE TABLE IF NOT EXISTS public.trajet_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trajet_id UUID NOT NULL REFERENCES public.trajets_kilometriques(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  adresse TEXT,
  heure TIMESTAMPTZ DEFAULT NOW(),
  distance_depuis_precedent_km DECIMAL(8,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steps_trajet ON public.trajet_steps(trajet_id, step_order);

-- 4. Paramètres indemnités kilométriques par société
CREATE TABLE IF NOT EXISTS public.parametres_km (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  taux_voiture DECIMAL(6,2) DEFAULT 5.50,     -- MUR par km pour voiture
  taux_moto DECIMAL(6,2) DEFAULT 3.50,         -- MUR par km pour moto
  taux_velo DECIMAL(6,2) DEFAULT 2.00,         -- MUR par km pour vélo
  plafond_mensuel DECIMAL(10,2) DEFAULT 10000,  -- Plafond max par mois
  validation_requise BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id)
);

-- 5. Positions temps réel pour la carte de ramassage
CREATE TABLE IF NOT EXISTS public.employe_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  adresse TEXT,
  type TEXT DEFAULT 'domicile' CHECK (type IN ('domicile', 'travail', 'actuel')),
  derniere_maj TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, type)
);

CREATE INDEX IF NOT EXISTS idx_positions_employe ON public.employe_positions(employe_id);

-- RLS
ALTER TABLE public.trajets_kilometriques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trajet_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametres_km ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employe_positions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "trajets_access" ON public.trajets_kilometriques FOR ALL USING (true);
  CREATE POLICY "steps_access" ON public.trajet_steps FOR ALL USING (true);
  CREATE POLICY "params_km_access" ON public.parametres_km FOR ALL USING (true);
  CREATE POLICY "positions_access" ON public.employe_positions FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
