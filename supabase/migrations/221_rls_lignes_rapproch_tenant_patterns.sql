-- ============================================================================
-- Migration 221 — RLS sur 2 tables restantes (lignes_rapprochement + tenant_learning_patterns)
-- ============================================================================
--
-- Après mig 219 + 220, vérification prod :
--   • lignes_rapprochement : pas de societe_id/dossier_id/employe_id,
--     mais a `rapprochement_id` (FK vers rapprochements_bancaires qui est
--     déjà tenant-scoped) → scope par chaîne FK.
--   • tenant_learning_patterns : a `tenant_id` (sémantiquement = societe_id
--     dans ce projet) → scope direct mais sur la colonne tenant_id.
--
-- Cas hors scope (volontairement) :
--   • storage.objects (schéma storage, géré par Supabase)
--   • tiers_tds_defaults : policy déjà tenant-scoped (inline avec
--     `societe_id IN (SELECT us.societe_id ...)`) — n'apparaît dans la
--     liste « auth.uid() NOT NULL » que comme faux positif (la policy
--     contient bien la phrase mais aussi le scoping correct ensuite).
--
-- Idempotente. Réutilise user_has_societe_access(uuid) et is_global_admin().
-- ============================================================================

-- ── 1. lignes_rapprochement → via rapprochements_bancaires.societe_id ────
DO $$
BEGIN
  -- Drop policies permissives connues
  EXECUTE 'DROP POLICY IF EXISTS "lignes_rapproch_auth" ON public.lignes_rapprochement';
  EXECUTE 'DROP POLICY IF EXISTS "lignes_rapprochement_authenticated_all" ON public.lignes_rapprochement';

  ALTER TABLE public.lignes_rapprochement ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lignes_rapprochement'
      AND policyname='lignes_rapprochement_tenant_select'
  ) THEN
    CREATE POLICY lignes_rapprochement_tenant_select ON public.lignes_rapprochement
      FOR SELECT USING (
        rapprochement_id IS NULL OR
        EXISTS (
          SELECT 1 FROM public.rapprochements_bancaires r
          WHERE r.id = lignes_rapprochement.rapprochement_id
            AND public.user_has_societe_access(r.societe_id)
        )
      );
    RAISE NOTICE '✓ lignes_rapprochement_tenant_select créée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lignes_rapprochement'
      AND policyname='lignes_rapprochement_tenant_modify'
  ) THEN
    CREATE POLICY lignes_rapprochement_tenant_modify ON public.lignes_rapprochement
      FOR ALL
      USING (
        public.is_global_admin() OR
        EXISTS (
          SELECT 1 FROM public.rapprochements_bancaires r
          WHERE r.id = lignes_rapprochement.rapprochement_id
            AND public.user_has_societe_access(r.societe_id)
        )
      )
      WITH CHECK (
        public.is_global_admin() OR
        EXISTS (
          SELECT 1 FROM public.rapprochements_bancaires r
          WHERE r.id = lignes_rapprochement.rapprochement_id
            AND public.user_has_societe_access(r.societe_id)
        )
      );
    RAISE NOTICE '✓ lignes_rapprochement_tenant_modify créée';
  END IF;
END $$;

-- ── 2. tenant_learning_patterns → via tenant_id (= societe_id) ──────────
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "tenant_patterns_auth" ON public.tenant_learning_patterns';
  EXECUTE 'DROP POLICY IF EXISTS "tenant_learning_patterns_authenticated_all" ON public.tenant_learning_patterns';

  ALTER TABLE public.tenant_learning_patterns ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tenant_learning_patterns'
      AND policyname='tenant_learning_patterns_tenant_select'
  ) THEN
    CREATE POLICY tenant_learning_patterns_tenant_select ON public.tenant_learning_patterns
      FOR SELECT USING (
        tenant_id IS NULL OR public.user_has_societe_access(tenant_id)
      );
    RAISE NOTICE '✓ tenant_learning_patterns_tenant_select créée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tenant_learning_patterns'
      AND policyname='tenant_learning_patterns_tenant_modify'
  ) THEN
    CREATE POLICY tenant_learning_patterns_tenant_modify ON public.tenant_learning_patterns
      FOR ALL
      USING (
        public.is_global_admin() OR
        ((tenant_id IS NOT NULL) AND public.user_has_societe_access(tenant_id))
      )
      WITH CHECK (
        public.is_global_admin() OR
        ((tenant_id IS NOT NULL) AND public.user_has_societe_access(tenant_id))
      );
    RAISE NOTICE '✓ tenant_learning_patterns_tenant_modify créée';
  END IF;
END $$;

-- ── Rapport final ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT COUNT(DISTINCT tablename) INTO v_remaining
  FROM pg_policies
  WHERE schemaname='public'
    AND qual ILIKE '%auth.uid() IS NOT NULL%'
    AND qual NOT ILIKE '%user_has_societe_access%'
    -- Exclure les référentiels globaux légitimes
    AND tablename NOT IN ('jours_feries','parametres_paie_mra','taux_change_historique',
                          'banques_mauritius','nsf_baremes','service_plans','tiers_annuaire',
                          'catalogue_primes','plan_comptable',
                          -- Faux positifs (policy contient `auth.uid() IS NOT NULL` mais aussi le scoping)
                          'tiers_tds_defaults');

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  IF v_remaining = 0 THEN
    RAISE NOTICE '✅ Migration 221 — TOUTES les tables sensibles sont tenant-scoped.';
  ELSE
    RAISE NOTICE '⚠️  Migration 221 — % table(s) sensible(s) restent permissives. Lancer la requête de vérif pour voir lesquelles.', v_remaining;
  END IF;
END $$;
