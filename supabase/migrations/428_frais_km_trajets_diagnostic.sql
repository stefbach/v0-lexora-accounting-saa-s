-- ============================================================================
-- Migration 428 — Diagnostic + fail-safe pour frais_km_trajets (mig 426)
-- ----------------------------------------------------------------------------
-- Contexte : PR #263 a livré la migration 426 (table frais_km_trajets +
-- endpoints + UI dialog). Mais en prod, l'utilisateur n'arrive toujours
-- pas à ajouter plusieurs trajets. Causes possibles :
--   1) Migration 426 pas appliquée en prod → INSERT échoue "relation does not exist"
--   2) RLS user_has_employe_access(employe_id) bloque silencieusement
--      (en théorie l'API tape avec service-role qui bypass RLS, mais on
--       sécurise au cas où un appel passe par le client browser).
--   3) Trigger sync_frais_km_mois_from_trajets throw une erreur silencieuse.
--   4) Toast d'erreur silencieux côté front (fixé séparément).
--
-- Cette migration :
--   - Vérifie que la table frais_km_trajets existe (warning sinon).
--   - Crée un helper debug_frais_km_access(employe_id) pour diagnostic.
--   - Recrée les policies RLS de façon idempotente avec un fallback rôle
--     (admin/super_admin/rh/rh_manager/direction/client_admin) en plus du
--     helper SEC-003 Phase 2, pour éviter les rejets silencieux quand le
--     helper n'est pas disponible ou retourne false sur un employé légitime.
--
-- Idempotente. N'écrase pas la table ni les data.
-- ============================================================================

-- 1. Vérification que la table 426 existe ---------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'frais_km_trajets'
  ) THEN
    RAISE WARNING '[428] Table frais_km_trajets ABSENTE — migration 426 non appliquée !';
    RETURN;
  END IF;
  RAISE NOTICE '[428] Table frais_km_trajets présente';
END $$;

-- 2. Helper diagnostic ------------------------------------------------------
-- Retourne un JSON décrivant l'accès du user courant à un employé donné.
-- Permet de diagnostiquer un "INSERT bloqué" depuis le navigateur : on
-- voit en un appel si le rôle est OK, si le helper user_has_employe_access
-- existe, et ce qu'il renvoie. SECURITY DEFINER pour lire profiles/employes
-- sans dépendre des RLS du caller.
CREATE OR REPLACE FUNCTION public.debug_frais_km_access(p_employe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_user_role   text;
  v_emp_societe uuid;
  v_has_access  boolean;
  v_helper_ok   boolean;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user;
  SELECT societe_id INTO v_emp_societe FROM public.employes WHERE id = p_employe_id;

  v_helper_ok := EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'user_has_employe_access' AND pronamespace = 'public'::regnamespace
  );

  IF v_helper_ok THEN
    BEGIN
      SELECT public.user_has_employe_access(p_employe_id) INTO v_has_access;
    EXCEPTION WHEN OTHERS THEN
      v_has_access := NULL;
    END;
  ELSE
    v_has_access := NULL;
  END IF;

  RETURN jsonb_build_object(
    'user_id',           v_user,
    'user_role',         v_user_role,
    'employe_id',        p_employe_id,
    'employe_societe',   v_emp_societe,
    'helper_exists',     v_helper_ok,
    'helper_returns',    v_has_access,
    'table_trajets_ok',  EXISTS (
                           SELECT 1 FROM information_schema.tables
                           WHERE table_schema = 'public' AND table_name = 'frais_km_trajets'
                         )
  );
END $$;

REVOKE ALL ON FUNCTION public.debug_frais_km_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.debug_frais_km_access(uuid) TO authenticated;

-- 3. Fallback RLS policies (idempotent) -------------------------------------
-- On élargit l'accès aux rôles RH/admin "métier" en plus du helper
-- user_has_employe_access. Cela évite qu'un rh sans dossier explicite
-- soit silencieusement bloqué par le helper. Idempotent via DROP IF
-- EXISTS / CREATE.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'frais_km_trajets'
  ) THEN
    DROP POLICY IF EXISTS frais_km_trajets_select ON public.frais_km_trajets;
    CREATE POLICY frais_km_trajets_select ON public.frais_km_trajets
      FOR SELECT TO authenticated
      USING (
        public.user_has_employe_access(employe_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('admin','super_admin','rh','rh_manager','direction','client_admin')
        )
      );

    DROP POLICY IF EXISTS frais_km_trajets_insert ON public.frais_km_trajets;
    CREATE POLICY frais_km_trajets_insert ON public.frais_km_trajets
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_has_employe_access(employe_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('admin','super_admin','rh','rh_manager','direction','client_admin')
        )
      );

    DROP POLICY IF EXISTS frais_km_trajets_update ON public.frais_km_trajets;
    CREATE POLICY frais_km_trajets_update ON public.frais_km_trajets
      FOR UPDATE TO authenticated
      USING (
        public.user_has_employe_access(employe_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('admin','super_admin','rh','rh_manager','direction','client_admin')
        )
      )
      WITH CHECK (
        public.user_has_employe_access(employe_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('admin','super_admin','rh','rh_manager','direction','client_admin')
        )
      );

    DROP POLICY IF EXISTS frais_km_trajets_delete ON public.frais_km_trajets;
    CREATE POLICY frais_km_trajets_delete ON public.frais_km_trajets
      FOR DELETE TO authenticated
      USING (
        public.user_has_employe_access(employe_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('admin','super_admin','rh','rh_manager','direction','client_admin')
        )
      );

    RAISE NOTICE '[428] Policies frais_km_trajets recréées avec fallback rôles RH/admin';
  ELSE
    RAISE WARNING '[428] Policies non recréées : table frais_km_trajets absente';
  END IF;
END $$;

COMMENT ON FUNCTION public.debug_frais_km_access(uuid) IS
  'Diagnostic mig 428 — retourne le contexte d''accès du user courant pour un employé : rôle, société, helper SEC-003, présence de la table frais_km_trajets.';
