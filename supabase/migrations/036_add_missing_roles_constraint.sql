-- Add client_assistant, rh_manager, salarie to role constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'super_admin',
    'client_admin',
    'client_user',
    'client_assistant',
    'comptable',
    'comptable_dedie',
    'rh',
    'rh_manager',
    'juridique',
    'employe',
    'manager',
    'direction',
    'salarie'
  ));

-- Update trigger to accept all roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client_user');

  IF v_role NOT IN ('admin', 'super_admin', 'client_admin', 'client_user',
                     'client_assistant', 'comptable', 'comptable_dedie', 'rh',
                     'rh_manager', 'juridique', 'employe', 'manager',
                     'direction', 'salarie') THEN
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
