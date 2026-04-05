-- Migration 112: Annonces / Communications management
-- Permet au RH/Direction de publier des annonces visibles par tous les employés

CREATE TABLE IF NOT EXISTS public.annonces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'urgent', 'rh', 'celebration', 'rappel')),
  priorite INTEGER DEFAULT 0, -- 0=normal, 1=important, 2=urgent
  date_debut DATE DEFAULT CURRENT_DATE,
  date_fin DATE, -- null = pas d'expiration
  publie BOOLEAN DEFAULT true,
  cree_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annonces_societe ON public.annonces(societe_id, publie, date_debut DESC);

ALTER TABLE public.annonces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "annonces_access" ON public.annonces FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
