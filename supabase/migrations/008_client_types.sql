-- ============================================================
-- LEXORA — Migration 008: Client types + client_users
-- ============================================================

-- Add client_type to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IN ('admin', 'user')) DEFAULT 'admin';

-- Update existing client profiles
UPDATE public.profiles SET client_type = 'admin' WHERE role = 'client_admin' AND client_type IS NULL;
UPDATE public.profiles SET client_type = 'user' WHERE role = 'client_user' AND client_type IS NULL;

-- Add client_category to distinguish freelance vs société
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_category TEXT CHECK (client_category IN ('individuel', 'mono_societe', 'multi_societe')) DEFAULT 'mono_societe';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS poste TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_client_id UUID REFERENCES public.profiles(id);

-- Client users table — employees under a client admin account
CREATE TABLE IF NOT EXISTS public.client_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  nom_complet TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  poste TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_users_admin ON public.client_users(client_admin_id);

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client_users" ON public.client_users FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Client admins can manage their users" ON public.client_users FOR ALL
  USING (client_admin_id = auth.uid());

CREATE POLICY "Comptables can view client_users" ON public.client_users FOR SELECT
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));
