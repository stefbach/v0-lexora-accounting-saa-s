-- ============================================================
-- Migration 033: Fix profiles role constraint to include all application roles
-- ============================================================
-- Problem: The CHECK constraint on profiles.role only allows
-- ('admin', 'client_admin', 'client_user', 'comptable', 'comptable_dedie')
-- but the application uses additional roles: super_admin, rh, juridique,
-- employe, manager, direction. Creating users with these roles fails silently.

-- 1. Drop the old constraint and add the complete one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'super_admin',
    'client_admin',
    'client_user',
    'comptable',
    'comptable_dedie',
    'rh',
    'juridique',
    'employe',
    'manager',
    'direction'
  ));

-- 2. Update handle_new_user trigger to handle all roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client_user');

  -- Validate the role before inserting
  IF v_role NOT IN ('admin', 'super_admin', 'client_admin', 'client_user',
                     'comptable', 'comptable_dedie', 'rh', 'juridique',
                     'employe', 'manager', 'direction') THEN
    v_role := 'client_user';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update get_my_role to recognize all roles
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'anon'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
