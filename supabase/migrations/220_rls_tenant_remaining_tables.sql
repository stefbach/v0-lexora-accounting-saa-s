-- ============================================================================
-- Migration 220 — Achever le tenant-scoping (tables sensibles restantes)
-- ============================================================================
--
-- Migration 219 a couvert les tables RH avec colonne `societe_id` directe.
-- Restent ~24 tables avec policy `auth.uid() IS NOT NULL` (= tout user
-- authentifié peut tout voir/modifier). Cette migration 220 applique un
-- tenant-scoping en détectant automatiquement la colonne de scoping
-- disponible :
--   1. `societe_id` direct → user_has_societe_access(societe_id)
--   2. sinon `dossier_id` → JOIN sur dossiers.societe_id
--   3. sinon `employe_id` → JOIN sur employes.societe_id
--   4. sinon : table laissée telle quelle avec un NOTICE (à investiguer)
--
-- Tables traitées (18 sensibles, audit P0/P1) :
--   • Compta : rapprochements_bancaires, lignes_rapprochement,
--     transaction_allocations, comptes_courants_associes,
--     mouvements_compte_courant, factures_catalogue, factures_contacts,
--     compliance_alerts, classification_rules, agent_execution_logs,
--     client_learning_patterns, tenant_learning_patterns
--   • Paie : conges_employes, soldes_conges, demandes_conges,
--     calculs_primes, regles_primes
--   • Juridique : documents_juridiques
--
-- Tables NON traitées (référentiels globaux légitimes — lecture publique
-- conservée volontairement) :
--   • jours_feries, parametres_paie_mra, taux_change_historique,
--     banques_mauritius, nsf_baremes, service_plans, tiers_annuaire,
--     catalogue_primes, plan_comptable
--
-- Réutilise les fonctions existantes en prod : user_has_societe_access(uuid)
-- et is_global_admin(). Idempotente.
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_has_societe_id BOOLEAN;
  v_has_dossier_id BOOLEAN;
  v_has_employe_id BOOLEAN;
  v_using_expr TEXT;
  v_check_expr TEXT;
  v_strategy   TEXT;
BEGIN
  FOR rec IN
    SELECT t AS tablename FROM (VALUES
      -- Compta (P0)
      ('rapprochements_bancaires'),
      ('lignes_rapprochement'),
      ('transaction_allocations'),
      ('comptes_courants_associes'),
      ('mouvements_compte_courant'),
      ('factures_catalogue'),
      ('factures_contacts'),
      ('compliance_alerts'),
      ('classification_rules'),
      ('agent_execution_logs'),
      ('client_learning_patterns'),
      ('tenant_learning_patterns'),
      -- Paie (P1)
      ('conges_employes'),
      ('soldes_conges'),
      ('demandes_conges'),
      ('calculs_primes'),
      ('regles_primes'),
      -- Juridique (P0 — confidentiel)
      ('documents_juridiques')
    ) v(t)
  LOOP
    -- Skip si la table n'existe pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name = rec.tablename) THEN
      RAISE NOTICE '↷ Table public.% n''existe pas — skip', rec.tablename;
      CONTINUE;
    END IF;

    -- Détecter la stratégie de scoping
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name = rec.tablename AND column_name = 'societe_id')
      INTO v_has_societe_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name = rec.tablename AND column_name = 'dossier_id')
      INTO v_has_dossier_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name = rec.tablename AND column_name = 'employe_id')
      INTO v_has_employe_id;

    IF v_has_societe_id THEN
      v_strategy := 'societe_id direct';
      v_using_expr := '((societe_id IS NULL) OR public.user_has_societe_access(societe_id))';
      v_check_expr := '(public.is_global_admin() OR ((societe_id IS NOT NULL) AND public.user_has_societe_access(societe_id)))';
    ELSIF v_has_dossier_id THEN
      v_strategy := 'via dossiers.societe_id';
      v_using_expr := '((dossier_id IS NULL) OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = ' || quote_ident(rec.tablename) || '.dossier_id AND public.user_has_societe_access(d.societe_id)))';
      v_check_expr := '(public.is_global_admin() OR EXISTS (SELECT 1 FROM public.dossiers d WHERE d.id = ' || quote_ident(rec.tablename) || '.dossier_id AND public.user_has_societe_access(d.societe_id)))';
    ELSIF v_has_employe_id THEN
      v_strategy := 'via employes.societe_id';
      v_using_expr := '((employe_id IS NULL) OR EXISTS (SELECT 1 FROM public.employes e WHERE e.id = ' || quote_ident(rec.tablename) || '.employe_id AND public.user_has_societe_access(e.societe_id)))';
      v_check_expr := '(public.is_global_admin() OR EXISTS (SELECT 1 FROM public.employes e WHERE e.id = ' || quote_ident(rec.tablename) || '.employe_id AND public.user_has_societe_access(e.societe_id)))';
    ELSE
      RAISE NOTICE '⚠️  Table public.% sans societe_id/dossier_id/employe_id — pas de stratégie de scoping, skip', rec.tablename;
      CONTINUE;
    END IF;

    RAISE NOTICE '→ public.% : stratégie = %', rec.tablename, v_strategy;

    -- Drop les policies permissives connues
    EXECUTE format('DROP POLICY IF EXISTS "%I_authenticated_all" ON public.%I', rec.tablename, rec.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can manage %s" ON public.%I', rec.tablename, rec.tablename);

    -- Drop les policies _auth génériques en prod (suffixe `_auth`)
    EXECUTE format('DROP POLICY IF EXISTS "%I_auth" ON public.%I', rec.tablename, rec.tablename);
    -- Patterns spécifiques (raccourcis observés)
    DECLARE
      shortname TEXT := CASE rec.tablename
        WHEN 'rapprochements_bancaires'   THEN 'rapprochement'
        WHEN 'lignes_rapprochement'        THEN 'lignes_rapproch'
        WHEN 'transaction_allocations'     THEN 'allocations'
        WHEN 'comptes_courants_associes'   THEN 'cca'
        WHEN 'mouvements_compte_courant'   THEN 'mcc'
        WHEN 'factures_catalogue'          THEN 'fcat'
        WHEN 'factures_contacts'           THEN 'fc'
        WHEN 'compliance_alerts'           THEN 'compliance_alerts_all'
        WHEN 'classification_rules'        THEN 'classification_rules_all'
        WHEN 'agent_execution_logs'        THEN 'agent_logs'
        WHEN 'client_learning_patterns'    THEN 'client_patterns'
        WHEN 'tenant_learning_patterns'    THEN 'tenant_patterns'
        WHEN 'documents_juridiques'        THEN 'juridique'
        WHEN 'calculs_primes'              THEN 'cp'
        WHEN 'regles_primes'               THEN 'rp'
        ELSE NULL
      END;
    BEGIN
      IF shortname IS NOT NULL THEN
        EXECUTE format('DROP POLICY IF EXISTS "%s_auth" ON public.%I', shortname, rec.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', shortname, rec.tablename);
      END IF;
    END;

    -- Activer RLS et créer les policies tenant
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename = rec.tablename
        AND policyname = rec.tablename || '_tenant_select'
    ) THEN
      EXECUTE format('CREATE POLICY %I_tenant_select ON public.%I FOR SELECT USING (%s)',
                     rec.tablename, rec.tablename, v_using_expr);
      RAISE NOTICE '  ✓ %_tenant_select créée', rec.tablename;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename = rec.tablename
        AND policyname = rec.tablename || '_tenant_modify'
    ) THEN
      EXECUTE format('CREATE POLICY %I_tenant_modify ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
                     rec.tablename, rec.tablename, v_check_expr, v_check_expr);
      RAISE NOTICE '  ✓ %_tenant_modify créée', rec.tablename;
    END IF;
  END LOOP;
END $$;

-- ── Rapport ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
  v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public' AND policyname LIKE '%_tenant_%';

  SELECT COUNT(DISTINCT tablename) INTO v_remaining
  FROM pg_policies
  WHERE schemaname='public'
    AND qual ILIKE '%auth.uid() IS NOT NULL%'
    AND qual NOT ILIKE '%user_has_societe_access%';

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 220 — % policies tenant en place au total', v_count;
  RAISE NOTICE '↷ Tables encore avec policy permissive `auth.uid() IS NOT NULL` : % (référentiels globaux légitimes pour la plupart — jours_feries, parametres_paie_mra, taux_change, plan_comptable, etc.)', v_remaining;
END $$;
