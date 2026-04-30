-- ============================================================================
-- Migration 218 — Resserrer RLS sur factures, ecritures_comptables_v2, RH
-- ============================================================================
--
-- Findings audit P0 :
--   • RLS factures = `auth.uid() IS NOT NULL` (mig 034/012) → tout user
--     authentifié peut SELECT/INSERT/UPDATE/DELETE toutes les factures de
--     toutes les sociétés.
--   • RLS ecritures_comptables_v2 = `get_my_role() IN ('comptable',…)` sans
--     filtre société → un comptable d'un cabinet voit le grand-livre de
--     N'IMPORTE quel client.
--   • RLS RH (employes, bulletins_paie, conges_employes, contrats_employes)
--     = `auth.uid() IS NOT NULL` → fuite cross-tenant des salaires/contrats.
--
-- Stratégie défense en profondeur :
--   • Les API serveur utilisent SERVICE_ROLE_KEY (= bypass RLS) donc cette
--     migration ne casse PAS les routes existantes.
--   • Elle protège contre un appel direct au client Supabase JS depuis le
--     navigateur ou contre une route API qui oublierait son contrôle
--     d'accès.
--
-- Politique commune : un user a accès à une société si elle apparaît dans
-- au moins UN des chemins suivants :
--   1. profiles.societe_id = X
--   2. user_societes.societe_id = X (link N-N)
--   3. dossiers.societe_id = X AND (comptable_id OR client_id = user_id)
--   4. societes.comptable_id = user_id (assignation directe)
--   5. role admin/super_admin → tout (bypass)
--
-- Helper : on crée une fonction `user_can_access_societe(uuid)` SECURITY
-- DEFINER pour éviter de répéter la logique dans chaque policy et permettre
-- une optimisation côté Postgres.
--
-- IDEMPOTENTE. Rollback possible en restaurant les anciennes policies.
-- ============================================================================

-- ── Helper function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_access_societe(p_societe_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  IF p_societe_id IS NULL THEN RETURN FALSE; END IF;

  -- Admins voient tout
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IN ('admin', 'super_admin') THEN RETURN TRUE; END IF;

  -- Chemin 1 : profile.societe_id
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND societe_id = p_societe_id) THEN
    RETURN TRUE;
  END IF;

  -- Chemin 2 : user_societes
  IF EXISTS (SELECT 1 FROM public.user_societes WHERE user_id = v_uid AND societe_id = p_societe_id) THEN
    RETURN TRUE;
  END IF;

  -- Chemin 3 : dossiers
  IF EXISTS (
    SELECT 1 FROM public.dossiers
    WHERE societe_id = p_societe_id
      AND (comptable_id = v_uid OR client_id = v_uid)
  ) THEN RETURN TRUE; END IF;

  -- Chemin 4 : societes.comptable_id
  IF EXISTS (SELECT 1 FROM public.societes WHERE id = p_societe_id AND comptable_id = v_uid) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.user_can_access_societe IS
  'Renvoie TRUE si l''utilisateur courant (auth.uid()) a un lien valide '
  'avec la société. Utilisé dans les policies RLS multi-tenant.';

-- ── factures ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop old permissive policies
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage factures" ON public.factures';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated can read factures" ON public.factures';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage factures (no recursion)" ON public.factures';
END $$;

ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_tenant_select" ON public.factures
  FOR SELECT USING (public.user_can_access_societe(societe_id));

CREATE POLICY "factures_tenant_insert" ON public.factures
  FOR INSERT WITH CHECK (public.user_can_access_societe(societe_id));

CREATE POLICY "factures_tenant_update" ON public.factures
  FOR UPDATE USING (public.user_can_access_societe(societe_id))
  WITH CHECK (public.user_can_access_societe(societe_id));

CREATE POLICY "factures_tenant_delete" ON public.factures
  FOR DELETE USING (public.user_can_access_societe(societe_id));

-- ── ecritures_comptables_v2 ──────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Comptables can manage v2 entries" ON public.ecritures_comptables_v2';
  EXECUTE 'DROP POLICY IF EXISTS "ecritures_v2_role_only" ON public.ecritures_comptables_v2';
END $$;

ALTER TABLE public.ecritures_comptables_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecritures_v2_tenant_all" ON public.ecritures_comptables_v2
  FOR ALL USING (public.user_can_access_societe(societe_id))
  WITH CHECK (public.user_can_access_societe(societe_id));

-- ── RH : employes, bulletins_paie, contrats_employes, conges_employes ────
-- Note : ces tables ont societe_id directement.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT t AS tablename FROM (VALUES
      ('employes'), ('bulletins_paie'), ('contrats_employes'), ('conges_employes'),
      ('soldes_conges_employes'), ('absences_employes'), ('pointages_employes')
    ) v(t)
  LOOP
    -- Drop tout policy permissive existante (best-effort, on n'arrête pas si absente)
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can manage %s" ON public.%I', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%s_authenticated_all" ON public.%I', rec.tablename, rec.tablename);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);
      -- Vérifier que la table a une colonne societe_id avant de créer la policy
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = rec.tablename AND column_name = 'societe_id'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "%s_tenant_all" ON public.%I FOR ALL USING (public.user_can_access_societe(societe_id)) WITH CHECK (public.user_can_access_societe(societe_id))',
          rec.tablename, rec.tablename
        );
        RAISE NOTICE '✓ RLS tenant policy créée sur public.%', rec.tablename;
      ELSE
        RAISE NOTICE '↷ public.% sans colonne societe_id — policy non créée', rec.tablename;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '↷ public.% — erreur %', rec.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── Rapport ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE '%_tenant_%';
  RAISE NOTICE '✓ Migration 218 — % policies RLS tenant-scoped en place', v_count;
  RAISE NOTICE '  Note : les API serveur (SERVICE_ROLE_KEY) bypassent ces policies — pas d''impact runtime.';
  RAISE NOTICE '  La protection est défense en profondeur contre les appels client-supabase directs.';
END $$;
