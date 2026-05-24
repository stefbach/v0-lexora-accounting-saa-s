-- ============================================================
-- MIGRATION 415 — FIX RLS POLICIES PHASE 2 / PART C (SEC-003C)
-- ============================================================
-- Réf : docs/audit-partials/wave2-F-secu-critique.md  §SEC-003
-- Catégorie C : tables CATALOGUE GLOBAL (référentiels Lexora).
--
-- Pattern :
--   - SELECT  → TO authenticated  (toute personne connectée)
--   - INSERT/UPDATE/DELETE → réservé public.user_is_lexora_admin()
--
-- Tables couvertes (6) :
--   1. plan_comptable_pcm       (plan comptable mauricien public)
--   2. tva_rates                (taux TVA / VAT historiques)
--   3. pays                     (référentiel ISO pays)
--   4. devises                  (référentiel ISO devises)
--   5. jours_feries             (jours fériés MU)
--   6. mra_endpoints_registry   (URLs / endpoints MRA officiels)
--
-- Toutes les opérations sont idempotentes :
--   - guard `IF EXISTS` sur chaque table (certains référentiels
--     peuvent ne pas exister selon l'environnement)
--   - DROP POLICY IF EXISTS sur les noms anciens connus
--   - DROP de toute policy "theatre" résiduelle (qual =
--     '(auth.uid() IS NOT NULL)') par boucle dynamique
--   - CREATE POLICY conditionné par NOT EXISTS
--   - ENABLE ROW LEVEL SECURITY systématique
--
-- Sécurité : aucune écriture par défaut. Seul un utilisateur
-- avec profiles.role ∈ ('admin','super_admin') peut modifier.
-- Lecture autorisée à tous les comptes `authenticated` (les
-- catalogues n'exposent aucune donnée tenant).
-- ============================================================

-- ------------------------------------------------------------
-- HELPER : public.user_is_lexora_admin()
-- (peut déjà être créée par la migration 415 partie A — on
--  garde un CREATE OR REPLACE pour rester idempotent sans
--  dépendance d'ordre entre les sous-migrations 415*)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_lexora_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','super_admin')
  );
$$;

COMMENT ON FUNCTION public.user_is_lexora_admin() IS
  'SEC-003C : true si le caller est admin Lexora (profiles.role ∈ admin/super_admin). Utilisé pour gate l''écriture sur les tables catalogue.';

-- ------------------------------------------------------------
-- Procédure générique inline : applique le pattern read-only
-- public + write admin sur une table catalogue donnée.
-- Implémentée via DO $$ ... $$ par table pour rester strictement
-- idempotent et tolérant aux tables manquantes.
-- ------------------------------------------------------------

-- ============================================================
-- C1. plan_comptable_pcm
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='plan_comptable_pcm') THEN
    EXECUTE 'ALTER TABLE public.plan_comptable_pcm ENABLE ROW LEVEL SECURITY';

    -- Drop des policies "theatre" connues ou résiduelles
    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='plan_comptable_pcm'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('pcm_auth','plan_comptable_pcm_auth','pcm_select_auth','pcm_all_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.plan_comptable_pcm', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_comptable_pcm' AND policyname='plan_comptable_pcm_select_auth') THEN
      CREATE POLICY plan_comptable_pcm_select_auth ON public.plan_comptable_pcm
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_comptable_pcm' AND policyname='plan_comptable_pcm_write_admin') THEN
      CREATE POLICY plan_comptable_pcm_write_admin ON public.plan_comptable_pcm
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- C2. tva_rates
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tva_rates') THEN
    EXECUTE 'ALTER TABLE public.tva_rates ENABLE ROW LEVEL SECURITY';

    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='tva_rates'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('tva_rates_auth','tva_auth','tva_rates_select_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.tva_rates', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tva_rates' AND policyname='tva_rates_select_auth') THEN
      CREATE POLICY tva_rates_select_auth ON public.tva_rates
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tva_rates' AND policyname='tva_rates_write_admin') THEN
      CREATE POLICY tva_rates_write_admin ON public.tva_rates
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- C3. pays
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pays') THEN
    EXECUTE 'ALTER TABLE public.pays ENABLE ROW LEVEL SECURITY';

    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='pays'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('pays_auth','pays_select_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.pays', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pays' AND policyname='pays_select_auth') THEN
      CREATE POLICY pays_select_auth ON public.pays
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pays' AND policyname='pays_write_admin') THEN
      CREATE POLICY pays_write_admin ON public.pays
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- C4. devises
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='devises') THEN
    EXECUTE 'ALTER TABLE public.devises ENABLE ROW LEVEL SECURITY';

    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='devises'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('devises_auth','devises_select_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.devises', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='devises' AND policyname='devises_select_auth') THEN
      CREATE POLICY devises_select_auth ON public.devises
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='devises' AND policyname='devises_write_admin') THEN
      CREATE POLICY devises_write_admin ON public.devises
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- C5. jours_feries
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='jours_feries') THEN
    EXECUTE 'ALTER TABLE public.jours_feries ENABLE ROW LEVEL SECURITY';

    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='jours_feries'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('jours_feries_auth','jf_auth','jours_feries_select_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.jours_feries', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jours_feries' AND policyname='jours_feries_select_auth') THEN
      CREATE POLICY jours_feries_select_auth ON public.jours_feries
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jours_feries' AND policyname='jours_feries_write_admin') THEN
      CREATE POLICY jours_feries_write_admin ON public.jours_feries
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- C6. mra_endpoints_registry
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='mra_endpoints_registry') THEN
    EXECUTE 'ALTER TABLE public.mra_endpoints_registry ENABLE ROW LEVEL SECURITY';

    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='mra_endpoints_registry'
        AND (
          qual = '(auth.uid() IS NOT NULL)'
          OR policyname IN ('mra_endpoints_auth','mra_endpoints_registry_auth','mer_auth')
        )
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.mra_endpoints_registry', r.policyname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mra_endpoints_registry' AND policyname='mra_endpoints_registry_select_auth') THEN
      CREATE POLICY mra_endpoints_registry_select_auth ON public.mra_endpoints_registry
        FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mra_endpoints_registry' AND policyname='mra_endpoints_registry_write_admin') THEN
      CREATE POLICY mra_endpoints_registry_write_admin ON public.mra_endpoints_registry
        FOR ALL TO authenticated
        USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- AUDIT FINAL — log les tables couvertes pour traçabilité
-- ============================================================
DO $$
DECLARE
  v_table TEXT;
  v_count INT;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'plan_comptable_pcm','tva_rates','pays','devises','jours_feries','mra_endpoints_registry'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=v_table) THEN
      SELECT COUNT(*) INTO v_count
      FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table
        AND policyname IN (
          v_table || '_select_auth',
          v_table || '_write_admin'
        );
      RAISE NOTICE 'SEC-003C : table % — % policies appliquées (attendu 2)', v_table, v_count;
    ELSE
      RAISE NOTICE 'SEC-003C : table % absente — skip (idempotent)', v_table;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- FIN MIGRATION 415 PART C (SEC-003C)
-- ============================================================
