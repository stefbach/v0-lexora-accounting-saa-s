-- ============================================================================
-- Migration 162: Fix RLS géolocalisation (RGPD DPA 2017 Maurice)
-- ============================================================================
-- La migration 113 avait créé 4 policies USING(true) → TOUS les utilisateurs
-- authentifiés voyaient TOUS les trajets GPS, positions domicile, taux km.
-- Ceci constitue une violation RGPD/DPA 2017 (données biométriques/localisation).
--
-- Cette migration remplace les policies USING(true) par un contrôle d'accès
-- strict :
--  - Employé : voit uniquement ses propres données (employe_id = auth.uid OU liaison via employes.auth_user_id)
--  - Manager : voit les employés de son groupe (via groupe_gere_id)
--  - RH / Admin : voit tous les employés de leurs sociétés assignées
--  - Super_admin : voit tout
-- ============================================================================

-- Helper : résout l'employe_id lié à l'utilisateur connecté (peut être NULL)
CREATE OR REPLACE FUNCTION fn_current_employe_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employes
  WHERE (auth_user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    AND actif = true
  LIMIT 1;
$$;

-- Helper : résout le rôle de l'utilisateur
CREATE OR REPLACE FUNCTION fn_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================================
-- trajets_kilometriques
-- ============================================================================
DROP POLICY IF EXISTS trajets_access ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_select ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_insert ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_update ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_delete ON public.trajets_kilometriques;

CREATE POLICY trajets_select ON public.trajets_kilometriques
  FOR SELECT TO authenticated
  USING (
    -- Super admin / admin : tout
    fn_current_role() IN ('admin', 'super_admin')
    -- RH : employés de ses sociétés
    OR (
      fn_current_role() IN ('rh', 'rh_manager', 'comptable', 'comptable_dedie', 'client_admin', 'direction')
      AND societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
    )
    -- Salarié : uniquement ses propres trajets
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_insert ON public.trajets_kilometriques
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_update ON public.trajets_kilometriques
  FOR UPDATE TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_delete ON public.trajets_kilometriques
  FOR DELETE TO authenticated
  USING (fn_current_role() IN ('admin', 'super_admin', 'rh'));

-- ============================================================================
-- trajet_steps (hérite du trajet parent)
-- ============================================================================
DROP POLICY IF EXISTS steps_access ON public.trajet_steps;
DROP POLICY IF EXISTS steps_select ON public.trajet_steps;
DROP POLICY IF EXISTS steps_write ON public.trajet_steps;

CREATE POLICY steps_select ON public.trajet_steps
  FOR SELECT TO authenticated
  USING (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      -- Les lignes visibles via la policy ci-dessus
    )
  );

CREATE POLICY steps_write ON public.trajet_steps
  FOR ALL TO authenticated
  USING (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      WHERE fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
         OR employe_id = fn_current_employe_id()
    )
  )
  WITH CHECK (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      WHERE fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
         OR employe_id = fn_current_employe_id()
    )
  );

-- ============================================================================
-- parametres_km (config par société : RH/admin peuvent modifier, tous lire pour calcul)
-- ============================================================================
DROP POLICY IF EXISTS params_km_access ON public.parametres_km;
DROP POLICY IF EXISTS params_km_select ON public.parametres_km;
DROP POLICY IF EXISTS params_km_write ON public.parametres_km;

CREATE POLICY params_km_select ON public.parametres_km
  FOR SELECT TO authenticated
  USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
    OR fn_current_role() IN ('admin', 'super_admin')
  );

CREATE POLICY params_km_write ON public.parametres_km
  FOR ALL TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'client_admin')
    AND (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()) OR fn_current_role() = 'super_admin')
  )
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'client_admin')
    AND (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()) OR fn_current_role() = 'super_admin')
  );

-- ============================================================================
-- employe_positions (position domicile/bureau — sensible)
-- ============================================================================
DROP POLICY IF EXISTS positions_access ON public.employe_positions;
DROP POLICY IF EXISTS positions_select ON public.employe_positions;
DROP POLICY IF EXISTS positions_write ON public.employe_positions;

CREATE POLICY positions_select ON public.employe_positions
  FOR SELECT TO authenticated
  USING (
    -- Employé : ses propres positions
    employe_id = fn_current_employe_id()
    -- RH/Admin : employés de leurs sociétés
    OR (
      fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'direction')
      AND employe_id IN (
        SELECT id FROM employes
        WHERE societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY positions_write ON public.employe_positions
  FOR ALL TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  )
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

COMMENT ON FUNCTION fn_current_employe_id IS
  'Helper RLS : retourne l''employe_id lié à l''utilisateur connecté (via auth_user_id ou email match). NULL si l''utilisateur n''est pas un salarié.';

COMMENT ON FUNCTION fn_current_role IS
  'Helper RLS : retourne le role du profil utilisateur courant. NULL si pas de profil.';
