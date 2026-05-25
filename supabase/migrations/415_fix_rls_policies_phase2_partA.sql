-- ============================================================
-- MIGRATION 415 — FIX RLS POLICIES PHASE 2 — PART A (SEC-003)
-- Suite de la migration 404 (Phase 1).
-- Cette partie A couvre les tables avec colonne `societe_id` DIRECTE.
-- (Parties B catégorie employe_id, C catalogue global, D inter-société
--  sont traitées dans des migrations 416/417/418 séparées.)
--
-- Référence : docs/audit-partials/wave2-F-secu-critique.md § SEC-003
-- Plan      : docs/superpowers/plans/2026-05-24-roadmap-9sur10.md (Agent 2)
--
-- VULNÉRABILITÉ : policies "théâtre" `USING (auth.uid() IS NOT NULL)`
-- permettent à tout user authentifié de lire/écrire les données de
-- toutes les sociétés. La présente migration les remplace par des
-- policies tenant-scoped via `user_has_societe_access(societe_id)`.
--
-- IDEMPOTENCE : DROP POLICY IF EXISTS + CREATE conditionnel.
-- Sûr à rejouer sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------
-- PRÉCONDITION : le helper user_has_societe_access(uuid) DOIT exister
-- (créé en mig 404). On échoue tôt si absent.
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_societe_access'
  ) THEN
    RAISE EXCEPTION 'SEC-003 partA: user_has_societe_access() manquant — appliquer migration 404 d''abord';
  END IF;
END $$;

-- ============================================================
-- HELPER : user_is_lexora_admin()
-- Renvoie true si l'utilisateur a le rôle admin ou super_admin
-- dans la table profiles. Utilisé par les partes C (catalogue) ;
-- créé ici pour être disponible dans les migrations 416-418.
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_is_lexora_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.user_is_lexora_admin() IS
  'SEC-003: renvoie true si l''utilisateur courant est admin/super_admin Lexora. Utilisé pour les policies d''écriture sur les tables catalogue.';

-- ============================================================
-- CATÉGORIE A — Tables avec societe_id DIRECT
-- Pattern : public.user_has_societe_access(societe_id)
-- Couverture : SELECT, INSERT, UPDATE, DELETE via FOR ALL.
-- ============================================================

-- ------------------------------------------------------------
-- A1. calculs_primes  (mig 041/099) — calculs de primes par société
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='calculs_primes') THEN
    DROP POLICY IF EXISTS "cp_auth" ON public.calculs_primes;
    DROP POLICY IF EXISTS "calculs_primes_auth" ON public.calculs_primes;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='calculs_primes'
        AND policyname='calculs_primes_tenant'
    ) THEN
      CREATE POLICY calculs_primes_tenant ON public.calculs_primes
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A2. regles_primes  (mig 041/099) — règles métier primes par société
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='regles_primes') THEN
    DROP POLICY IF EXISTS "rp_auth" ON public.regles_primes;
    DROP POLICY IF EXISTS "regles_primes_auth" ON public.regles_primes;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='regles_primes'
        AND policyname='regles_primes_tenant'
    ) THEN
      CREATE POLICY regles_primes_tenant ON public.regles_primes
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A3. catalogue_primes  (mig 015/017) — catalogue des types de primes
-- Note : societe_id peut être NULL (catalogue par défaut Lexora) ;
-- on autorise les lignes globales en lecture/écriture pour les
-- utilisateurs ayant accès à au moins une société (cohérent avec le
-- pattern proposé SEC-003).
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='catalogue_primes') THEN
    DROP POLICY IF EXISTS "catalogue_primes_auth" ON public.catalogue_primes;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='catalogue_primes'
        AND policyname='catalogue_primes_tenant'
    ) THEN
      CREATE POLICY catalogue_primes_tenant ON public.catalogue_primes
        FOR ALL
        USING (societe_id IS NULL OR public.user_has_societe_access(societe_id))
        WITH CHECK (societe_id IS NULL OR public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A4. documents_juridiques  (mig 015) — KBIS, statuts, PV par société
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='documents_juridiques') THEN
    DROP POLICY IF EXISTS "juridique_auth" ON public.documents_juridiques;
    DROP POLICY IF EXISTS "documents_juridiques_auth" ON public.documents_juridiques;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='documents_juridiques'
        AND policyname='documents_juridiques_tenant'
    ) THEN
      CREATE POLICY documents_juridiques_tenant ON public.documents_juridiques
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A5. factures_contacts  (mig 042/099) — clients/fournisseurs facturation
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='factures_contacts') THEN
    DROP POLICY IF EXISTS "fc_auth" ON public.factures_contacts;
    DROP POLICY IF EXISTS "factures_contacts_auth" ON public.factures_contacts;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='factures_contacts'
        AND policyname='factures_contacts_tenant'
    ) THEN
      CREATE POLICY factures_contacts_tenant ON public.factures_contacts
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A6. factures_catalogue  (mig 042/099) — catalogue produits/services
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='factures_catalogue') THEN
    DROP POLICY IF EXISTS "fcat_auth" ON public.factures_catalogue;
    DROP POLICY IF EXISTS "factures_catalogue_auth" ON public.factures_catalogue;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='factures_catalogue'
        AND policyname='factures_catalogue_tenant'
    ) THEN
      CREATE POLICY factures_catalogue_tenant ON public.factures_catalogue
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A7. comptes_courants_associes  (mig 039/099) — CCA associés
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='comptes_courants_associes') THEN
    DROP POLICY IF EXISTS "cca_auth" ON public.comptes_courants_associes;
    DROP POLICY IF EXISTS "comptes_courants_associes_auth" ON public.comptes_courants_associes;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='comptes_courants_associes'
        AND policyname='cca_tenant'
    ) THEN
      CREATE POLICY cca_tenant ON public.comptes_courants_associes
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A8. mouvements_compte_courant  (mig 039/099) — mouvements CCA
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='mouvements_compte_courant') THEN
    DROP POLICY IF EXISTS "mcc_auth" ON public.mouvements_compte_courant;
    DROP POLICY IF EXISTS "mouvements_compte_courant_auth" ON public.mouvements_compte_courant;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='mouvements_compte_courant'
        AND policyname='mcc_tenant'
    ) THEN
      CREATE POLICY mcc_tenant ON public.mouvements_compte_courant
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A9. tiers_annuaire  (mig 128) — annuaire tiers commerciaux
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tiers_annuaire') THEN
    DROP POLICY IF EXISTS "tiers_annuaire_auth" ON public.tiers_annuaire;
    DROP POLICY IF EXISTS "tiers_select_auth" ON public.tiers_annuaire;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='tiers_annuaire'
        AND policyname='tiers_annuaire_tenant'
    ) THEN
      CREATE POLICY tiers_annuaire_tenant ON public.tiers_annuaire
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- A10. fixed_assets  (mig 013) — immobilisations
-- Boucle dynamique : drop toutes les policies weak (qual = auth.uid() IS NOT NULL)
-- avant de créer la policy tenant.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fixed_assets') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='fixed_assets'
        AND qual = '(auth.uid() IS NOT NULL)'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.fixed_assets', r.policyname);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='fixed_assets'
        AND policyname='fixed_assets_tenant'
    ) THEN
      CREATE POLICY fixed_assets_tenant ON public.fixed_assets
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- AUDIT INTERMÉDIAIRE — n'affiche qu'un WARNING (partie A seulement).
-- L'audit "zéro policy weak" complet sera fait après les parties B/C/D.
-- ============================================================
DO $$
DECLARE
  v_count int;
  v_partA_tables TEXT[] := ARRAY[
    'calculs_primes','regles_primes','catalogue_primes',
    'documents_juridiques','factures_contacts','factures_catalogue',
    'comptes_courants_associes','mouvements_compte_courant',
    'tiers_annuaire','fixed_assets'
  ];
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
    AND qual = '(auth.uid() IS NOT NULL)'
    AND tablename = ANY(v_partA_tables);

  IF v_count > 0 THEN
    RAISE WARNING 'SEC-003 partA: % policies weak résiduelles sur les tables traitées', v_count;
  ELSE
    RAISE NOTICE 'SEC-003 partA: OK, aucune policy weak sur les 10 tables societe_id direct';
  END IF;
END $$;

-- ============================================================
-- LOG COMPLETION
-- ============================================================
DO $$ BEGIN
  RAISE NOTICE 'MIGRATION 415 partA: RLS Phase 2 — 10 tables societe_id direct durcies';
  RAISE NOTICE 'Tables: calculs_primes, regles_primes, catalogue_primes, documents_juridiques,';
  RAISE NOTICE '        factures_contacts, factures_catalogue, comptes_courants_associes,';
  RAISE NOTICE '        mouvements_compte_courant, tiers_annuaire, fixed_assets';
  RAISE NOTICE 'Helpers : user_is_lexora_admin() créé. user_has_societe_access() réutilisé (mig 404).';
  RAISE NOTICE 'Next : migrations 416 (partB employe_id) / 417 (partC catalogue) / 418 (partD interco).';
END $$;
