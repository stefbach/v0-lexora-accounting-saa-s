-- Migration 031 : Rôles complets + user_societes

-- Colonne societe_id sur profiles (société principale pour rh/juridique/employe)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS societe_id UUID REFERENCES public.societes(id);

-- Table user_societes : associer un user à une ou plusieurs sociétés
CREATE TABLE IF NOT EXISTS public.user_societes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, societe_id)
);
CREATE INDEX IF NOT EXISTS idx_us_user ON public.user_societes(user_id);
CREATE INDEX IF NOT EXISTS idx_us_societe ON public.user_societes(societe_id);
ALTER TABLE public.user_societes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_comptable_full_us" ON public.user_societes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
);
CREATE POLICY "user_read_own_us" ON public.user_societes FOR SELECT USING (user_id = auth.uid());
