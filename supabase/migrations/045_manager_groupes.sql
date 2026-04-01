-- Manager peut gérer un ou plusieurs groupes
CREATE TABLE IF NOT EXISTS public.manager_groupes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  groupe_id UUID NOT NULL REFERENCES public.groupes_employes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(manager_id, groupe_id)
);

ALTER TABLE public.manager_groupes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "manager_groupes_rh" ON public.manager_groupes FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','rh','rh_manager','client_admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "manager_groupes_own" ON public.manager_groupes FOR SELECT USING (manager_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
