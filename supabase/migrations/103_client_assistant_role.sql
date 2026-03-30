ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','super_admin','client_admin','client_user','client_assistant','comptable','comptable_dedie','rh','juridique','employe','manager','direction'));
