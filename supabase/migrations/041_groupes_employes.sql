-- Groupes d'employés — pour le planning, pointage, primes, etc.
CREATE TABLE IF NOT EXISTS public.groupes_employes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  code TEXT,
  description TEXT,
  couleur TEXT DEFAULT '#1E2A4A',
  inclus_planning BOOLEAN DEFAULT true,
  inclus_pointage BOOLEAN DEFAULT true,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, nom)
);

-- Appartenance employé ↔ groupe (un employé peut être dans plusieurs groupes)
CREATE TABLE IF NOT EXISTS public.employe_groupes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  groupe_id UUID NOT NULL REFERENCES public.groupes_employes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, groupe_id)
);

-- Ajouter groupe_id sur employes pour groupe principal
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS groupe_id UUID REFERENCES public.groupes_employes(id);

-- Index
CREATE INDEX IF NOT EXISTS idx_eg_employe ON public.employe_groupes(employe_id);
CREATE INDEX IF NOT EXISTS idx_eg_groupe ON public.employe_groupes(groupe_id);
CREATE INDEX IF NOT EXISTS idx_ge_societe ON public.groupes_employes(societe_id);

-- RLS
ALTER TABLE public.groupes_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employe_groupes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rh_full_ge" ON public.groupes_employes FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rh_full_eg" ON public.employe_groupes FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
