-- ============================================================
-- LEXORA — Migration 002: Split client role into client_admin / client_user
-- ============================================================

-- 1. Update the CHECK constraint on profiles.role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'client_admin', 'client_user', 'comptable'));

-- 2. Migrate existing 'client' users to 'client_admin' (they were full-access)
UPDATE public.profiles SET role = 'client_admin' WHERE role = 'client';

-- 3. Update the handle_new_user trigger to default to 'client_user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client_user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update the get_my_role function (used by RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Update RLS policies for TVA — both client_admin can view
DROP POLICY IF EXISTS "Clients can view their tva" ON public.tva_mensuelle;
CREATE POLICY "Client admins can view their tva"
  ON public.tva_mensuelle FOR SELECT
  USING (
    client_id = auth.uid()
    AND public.get_my_role() IN ('client_admin')
  );

-- 6. Update RLS for rapports — only client_admin
DROP POLICY IF EXISTS "Clients can view their rapports" ON public.rapports_mensuels;
CREATE POLICY "Client admins can view their rapports"
  ON public.rapports_mensuels FOR SELECT
  USING (
    client_id = auth.uid()
    AND public.get_my_role() IN ('client_admin')
  );

-- 7. Update RLS for charges sociales — only client_admin
DROP POLICY IF EXISTS "Clients can view their charges" ON public.charges_sociales;
CREATE POLICY "Client admins can view their charges"
  ON public.charges_sociales FOR SELECT
  USING (
    client_id = auth.uid()
    AND public.get_my_role() IN ('client_admin')
  );

-- 8. Documents — both client_admin and client_user can view/upload
-- (existing policies already handle this via dossiers)

-- 9. Notifications — both can view their own
-- (existing policy already handles this)

-- 10. Dossiers — both client types can view their dossiers
DROP POLICY IF EXISTS "Clients can view their dossiers" ON public.dossiers;
CREATE POLICY "Clients can view their dossiers"
  ON public.dossiers FOR SELECT
  USING (
    client_id = auth.uid()
    AND public.get_my_role() IN ('client_admin', 'client_user')
  );
