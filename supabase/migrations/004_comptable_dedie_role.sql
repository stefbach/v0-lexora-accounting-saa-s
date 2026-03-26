-- ============================================================
-- LEXORA — Migration 004: Add comptable_dedie role
-- ============================================================

-- 1. Update the CHECK constraint on profiles.role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'client_admin', 'client_user', 'comptable', 'comptable_dedie'));

-- 2. Update the handle_new_user trigger
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

-- 3. Update get_my_role function
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Update RLS policies for dossiers — comptable_dedie can only see their assigned dossiers
DROP POLICY IF EXISTS "Comptables can view their dossiers" ON public.dossiers;
CREATE POLICY "Comptables can view their dossiers"
  ON public.dossiers FOR SELECT
  USING (
    comptable_id = auth.uid()
    OR public.get_my_role() = 'comptable'
  );

-- 5. Update RLS policies for societes — comptable_dedie only sees assigned
DROP POLICY IF EXISTS "Comptables can view assigned societes" ON public.societes;
CREATE POLICY "Comptables can view assigned societes"
  ON public.societes FOR SELECT
  USING (
    comptable_id = auth.uid()
    OR public.get_my_role() = 'comptable'
    OR EXISTS (
      SELECT 1 FROM public.dossiers d
      WHERE d.societe_id = public.societes.id AND d.comptable_id = auth.uid()
    )
  );

-- 6. Update RLS for documents — comptable_dedie only sees docs in their dossiers
-- (existing policy already handles this via dossiers join)

-- 7. Update RLS for TVA — comptable and comptable_dedie
DROP POLICY IF EXISTS "Comptables can view client tva" ON public.tva_mensuelle;
CREATE POLICY "Comptables can view client tva"
  ON public.tva_mensuelle FOR SELECT
  USING (
    public.get_my_role() = 'comptable'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.tva_mensuelle.client_id AND p.comptable_id = auth.uid()
    )
  );

-- 8. Update RLS for rapports — comptable and comptable_dedie
DROP POLICY IF EXISTS "Comptables can view client rapports" ON public.rapports_mensuels;
CREATE POLICY "Comptables can view client rapports"
  ON public.rapports_mensuels FOR SELECT
  USING (
    public.get_my_role() = 'comptable'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.rapports_mensuels.client_id AND p.comptable_id = auth.uid()
    )
  );

-- 9. Update RLS for charges sociales — comptable and comptable_dedie
DROP POLICY IF EXISTS "Comptables can view client charges" ON public.charges_sociales;
CREATE POLICY "Comptables can view client charges"
  ON public.charges_sociales FOR SELECT
  USING (
    public.get_my_role() = 'comptable'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.charges_sociales.client_id AND p.comptable_id = auth.uid()
    )
  );

-- 10. Update RLS for profiles — comptable can see all, comptable_dedie only assigned
DROP POLICY IF EXISTS "Comptables can read assigned clients" ON public.profiles;
CREATE POLICY "Comptables can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    public.get_my_role() = 'comptable'
  );

CREATE POLICY "Comptables dedies can read assigned clients"
  ON public.profiles FOR SELECT
  USING (
    comptable_id = auth.uid()
    AND public.get_my_role() = 'comptable_dedie'
  );
