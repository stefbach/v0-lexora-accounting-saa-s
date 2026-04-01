-- Fix pointages table: add missing columns that may not exist in production
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS statut_jour TEXT DEFAULT 'travaille';
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS absent_justifie BOOLEAN DEFAULT false;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS motif_absence TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS shift_code TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS planning_assignment_id UUID;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS absence_type TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT false;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS duree_minutes INTEGER;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS valide_par UUID;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS type_entree TEXT DEFAULT 'manuel';
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS type_sortie TEXT DEFAULT 'manuel';
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS heure_pause_debut TIME;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS heure_pause_fin TIME;
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS latitude_entree NUMERIC(10,7);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS longitude_entree NUMERIC(10,7);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS latitude_sortie NUMERIC(10,7);
ALTER TABLE public.pointages ADD COLUMN IF NOT EXISTS longitude_sortie NUMERIC(10,7);
