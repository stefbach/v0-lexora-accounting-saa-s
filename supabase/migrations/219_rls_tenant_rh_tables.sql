-- ============================================================================
-- Migration 219 — RLS tenant-scoping sur tables RH (employes/bulletins/…)
-- ============================================================================
--
-- Constat audit + introspection prod :
--   • factures, ecritures_comptables_v2, comptes_bancaires, releves_bancaires
--     sont DÉJÀ correctement scopées (policies *_tenant_select / _tenant_modify
--     utilisant `user_has_societe_access(societe_id)`). Cette migration ne
--     les touche pas.
--   • Les tables RH sont vulnérables :
--       - bulletins_paie : `bulletins_comptable_admin` ALL =
--         `get_my_role() IN ('admin','comptable','comptable_dedie')` SANS
--         filtre société → tout comptable d'un cabinet voit/modifie les
--         bulletins de N'IMPORTE quel client.
--       - employes : `employes_comptable_admin` ALL = idem.
--       - contrats_employes : `contrats_auth` ALL = `auth.uid() IS NOT NULL`
--         → **tout user authentifié** voit tous les contrats (P0 critique).
--       - conges_employes : `conges_auth` ALL = `get_my_role() ∈ admin/comptable`
--         → idem cross-tenant pour comptables.
--
-- Stratégie :
--   • Réutilise la fonction existante `user_has_societe_access(uuid)` au lieu
--     d'en créer une nouvelle (la prod a déjà cette fonction, sinon les
--     policies *_tenant_select planteraient).
--   • Drop les policies trop permissives, garde celles qui sont déjà
--     correctement scopées (ex. `bulletins_client_read` qui fait un join
--     societes.client_id, OK).
--   • Ajoute `*_tenant_select` (lecture) et `*_tenant_modify` (ALL) qui
--     dupliquent le pattern existant sur factures.
--
-- IDEMPOTENTE : DROP IF EXISTS sur les anciennes policies + CREATE après
-- vérification que la nouvelle policy n'existe pas.
-- ============================================================================

-- ── Helper : crée la policy tenant pour une table RH ─────────────────────
DO $$
DECLARE
  rec RECORD;
  v_has_societe_id BOOLEAN;
BEGIN
  FOR rec IN
    SELECT t AS tablename FROM (VALUES
      ('employes'),
      ('bulletins_paie'),
      ('contrats_employes'),
      ('conges_employes'),
      ('soldes_conges'),
      ('demandes_conges'),
      ('pointages'),
      ('heures_travaillees'),
      ('virements_salaires'),
      ('historique_salaires'),
      ('payroll_validations'),
      ('grossesses_employees'),
      ('paternites_employees')
    ) v(t)
  LOOP
    -- Skip si la table n'existe pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name = rec.tablename) THEN
      RAISE NOTICE '↷ Table public.% n''existe pas — skip', rec.tablename;
      CONTINUE;
    END IF;

    -- Vérifier la présence d'une colonne societe_id (sinon on ne peut pas scoper)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name = rec.tablename AND column_name = 'societe_id'
    ) INTO v_has_societe_id;

    IF NOT v_has_societe_id THEN
      RAISE NOTICE '↷ Table public.% sans colonne societe_id — skip', rec.tablename;
      CONTINUE;
    END IF;

    -- 1) Drop les policies permissives connues (best-effort, pas d'erreur si absente)
    EXECUTE format('DROP POLICY IF EXISTS "%I_authenticated_all" ON public.%I',
                   rec.tablename, rec.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_authenticated_all" ON public.%I',
                   rec.tablename, rec.tablename);
    -- Patterns spécifiques observés en prod
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can manage %s" ON public.%I',
                   rec.tablename, rec.tablename);

    -- Policies trop larges identifiées par l'audit (si présentes)
    IF rec.tablename = 'bulletins_paie' THEN
      EXECUTE 'DROP POLICY IF EXISTS "bulletins_comptable_admin" ON public.bulletins_paie';
    ELSIF rec.tablename = 'employes' THEN
      EXECUTE 'DROP POLICY IF EXISTS "employes_comptable_admin" ON public.employes';
    ELSIF rec.tablename = 'contrats_employes' THEN
      EXECUTE 'DROP POLICY IF EXISTS "contrats_auth" ON public.contrats_employes';
      EXECUTE 'DROP POLICY IF EXISTS "contrats_admin_rh" ON public.contrats_employes';
    ELSIF rec.tablename = 'conges_employes' THEN
      EXECUTE 'DROP POLICY IF EXISTS "conges_auth" ON public.conges_employes';
    END IF;

    -- 2) Activer RLS (idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);

    -- 3) Créer les policies tenant si absentes
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename = rec.tablename
        AND policyname = rec.tablename || '_tenant_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT USING ((societe_id IS NULL) OR public.user_has_societe_access(societe_id))',
        rec.tablename, rec.tablename
      );
      RAISE NOTICE '✓ %_tenant_select créée', rec.tablename;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename = rec.tablename
        AND policyname = rec.tablename || '_tenant_modify'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_modify ON public.%I FOR ALL USING (public.is_global_admin() OR ((societe_id IS NOT NULL) AND public.user_has_societe_access(societe_id))) WITH CHECK (public.is_global_admin() OR ((societe_id IS NOT NULL) AND public.user_has_societe_access(societe_id)))',
        rec.tablename, rec.tablename
      );
      RAISE NOTICE '✓ %_tenant_modify créée', rec.tablename;
    END IF;

    -- IMPORTANT : conserver `bulletins_client_read` et `employes_client_read`
    -- qui scopent par societes.client_id pour l'accès portail client — déjà
    -- corrects dans la prod actuelle.

  END LOOP;
END $$;

-- ── Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
    AND policyname LIKE '%_tenant_%'
    AND tablename IN (
      'employes','bulletins_paie','contrats_employes','conges_employes',
      'soldes_conges','demandes_conges','pointages','heures_travaillees',
      'virements_salaires','historique_salaires','payroll_validations',
      'grossesses_employees','paternites_employees'
    );
  RAISE NOTICE '✓ Migration 219 — % policies tenant en place sur tables RH', v_count;
END $$;
