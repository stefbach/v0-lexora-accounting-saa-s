-- ============================================================
-- MIGRATION 415 — FIX RLS POLICIES PHASE 2 — PART D
-- SEC-003 : Tables inter-société (flux interco, consolidation,
-- transfer pricing, GloBE Pillar Two, holdings, UBO registry)
--
-- VULNÉRABILITÉ CORRIGÉE :
--   Les tables inter-société référencent DEUX societes (ex: flux_interco
--   avec societe_emettrice_id + societe_receptrice_id, societes_relationships
--   avec parent_societe_id + child_societe_id). Les policies actuelles
--   sont soit "théâtre" (rôle uniquement), soit scopées sur une seule
--   colonne — ce qui empêche un comptable d'une des deux sociétés
--   liées de voir le flux.
--
-- STRATÉGIE :
--   1. Helper SECURITY DEFINER : user_has_access_to_any_societe_in(uuid, uuid)
--      → TRUE si l'utilisateur a accès à AU MOINS UNE des deux sociétés.
--   2. Drop des policies faibles existantes.
--   3. Création de policies tenant-scopées :
--        - SELECT  : accès si user a accès à l'une OU l'autre societe
--        - MODIFY  : accès si is_global_admin() OU user a accès aux deux
--                    (sauf consolidation_eliminations qui se scope sur
--                    parent_societe_id uniquement — le parent contrôle)
--
-- TABLES VISÉES (8) :
--   • flux_interco                 (societe_emettrice_id, societe_receptrice_id)
--   • societes_relationships       (parent_societe_id, child_societe_id)  -- "holdings"
--   • consolidation_eliminations   (parent_societe_id, from_societe_id, to_societe_id)
--   • tp_transactions              (societe_id) -- transfer pricing
--   • tp_master_file               (societe_id) -- transfer pricing
--   • globe_jurisdictions          (societe_id) -- gbc_pillar_two
--   • globe_gir_submissions        (societe_id) -- gbc_pillar_two
--   • beneficial_owners            (societe_id) -- ubo_registry
--   • beneficial_owners_history    (societe_id) -- ubo_registry
--
-- DÉPENDANCES :
--   • public.user_has_societe_access(uuid)  — défini en migration 404
--   • public.is_global_admin()              — défini en migrations antérieures
-- ============================================================

-- -----------------------------------------------------------------
-- 1. HELPER : accès à AU MOINS UNE des deux sociétés (relations binaires)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_access_to_any_societe_in(
  p_a uuid,
  p_b uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_societe_access(p_a)
      OR public.user_has_societe_access(p_b);
$$;

COMMENT ON FUNCTION public.user_has_access_to_any_societe_in(uuid, uuid) IS
  'SEC-003 Phase 2 Part D : retourne TRUE si l''utilisateur courant a accès '
  'à au moins l''une des deux sociétés. Utilisé par les policies RLS des '
  'tables inter-société (flux_interco, societes_relationships, etc.).';

-- Helper "BOTH" : accès aux DEUX sociétés (pour écritures sensibles)
CREATE OR REPLACE FUNCTION public.user_has_access_to_both_societes_in(
  p_a uuid,
  p_b uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_societe_access(p_a)
     AND public.user_has_societe_access(p_b);
$$;

COMMENT ON FUNCTION public.user_has_access_to_both_societes_in(uuid, uuid) IS
  'SEC-003 Phase 2 Part D : retourne TRUE si l''utilisateur courant a accès '
  'aux DEUX sociétés liées. Utilisé pour les opérations d''écriture '
  'inter-société (création de flux interco, élimination de consolidation).';

GRANT EXECUTE ON FUNCTION public.user_has_access_to_any_societe_in(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_access_to_both_societes_in(uuid, uuid) TO authenticated;

-- =================================================================
-- 2. FLUX_INTERCO  (intercos)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='flux_interco') THEN
    ALTER TABLE public.flux_interco ENABLE ROW LEVEL SECURITY;

    -- Drop ancienne policy théâtre (rôle uniquement)
    DROP POLICY IF EXISTS "flux_interco_admin_comptable_full" ON public.flux_interco;
    DROP POLICY IF EXISTS flux_interco_tenant_select          ON public.flux_interco;
    DROP POLICY IF EXISTS flux_interco_tenant_insert          ON public.flux_interco;
    DROP POLICY IF EXISTS flux_interco_tenant_update          ON public.flux_interco;
    DROP POLICY IF EXISTS flux_interco_tenant_delete          ON public.flux_interco;

    -- SELECT : visible si user a accès à l'émettrice OU la réceptrice
    CREATE POLICY flux_interco_tenant_select ON public.flux_interco
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_access_to_any_societe_in(
             societe_emettrice_id,
             societe_receptrice_id
           )
      );

    -- INSERT : il faut être habilité sur les deux sociétés (écriture croisée)
    CREATE POLICY flux_interco_tenant_insert ON public.flux_interco
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(
             societe_emettrice_id,
             societe_receptrice_id
           )
      );

    -- UPDATE : idem (écriture des deux côtés)
    CREATE POLICY flux_interco_tenant_update ON public.flux_interco
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(
             societe_emettrice_id,
             societe_receptrice_id
           )
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(
             societe_emettrice_id,
             societe_receptrice_id
           )
      );

    -- DELETE : admin global uniquement (traces comptables)
    CREATE POLICY flux_interco_tenant_delete ON public.flux_interco
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 3. SOCIETES_RELATIONSHIPS  (holdings)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='societes_relationships') THEN
    ALTER TABLE public.societes_relationships ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS soc_rel_tenant_select ON public.societes_relationships;
    DROP POLICY IF EXISTS soc_rel_tenant_modify ON public.societes_relationships;
    DROP POLICY IF EXISTS soc_rel_tenant_insert ON public.societes_relationships;
    DROP POLICY IF EXISTS soc_rel_tenant_update ON public.societes_relationships;
    DROP POLICY IF EXISTS soc_rel_tenant_delete ON public.societes_relationships;

    -- SELECT : accès à la holding (parent) OU à la filiale (child)
    CREATE POLICY soc_rel_tenant_select ON public.societes_relationships
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_access_to_any_societe_in(parent_societe_id, child_societe_id)
      );

    -- INSERT/UPDATE/DELETE : il faut accès aux deux (création d'une relation
    -- holding/filiale = action structurante qui engage les deux entités)
    CREATE POLICY soc_rel_tenant_insert ON public.societes_relationships
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(parent_societe_id, child_societe_id)
      );

    CREATE POLICY soc_rel_tenant_update ON public.societes_relationships
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(parent_societe_id, child_societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_access_to_both_societes_in(parent_societe_id, child_societe_id)
      );

    CREATE POLICY soc_rel_tenant_delete ON public.societes_relationships
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 4. CONSOLIDATION_ELIMINATIONS  (consolidation)
-- Pivot = parent_societe_id (la mère pilote la consolidation),
-- mais visibilité élargie aux filiales source/cible de l'élimination.
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='consolidation_eliminations') THEN
    ALTER TABLE public.consolidation_eliminations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS cons_elim_tenant_select ON public.consolidation_eliminations;
    DROP POLICY IF EXISTS cons_elim_tenant_modify ON public.consolidation_eliminations;
    DROP POLICY IF EXISTS cons_elim_tenant_insert ON public.consolidation_eliminations;
    DROP POLICY IF EXISTS cons_elim_tenant_update ON public.consolidation_eliminations;
    DROP POLICY IF EXISTS cons_elim_tenant_delete ON public.consolidation_eliminations;

    -- SELECT : la mère + filiales impliquées peuvent consulter l'élimination
    CREATE POLICY cons_elim_tenant_select ON public.consolidation_eliminations
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(parent_societe_id)
        OR public.user_has_access_to_any_societe_in(
             COALESCE(from_societe_id, parent_societe_id),
             COALESCE(to_societe_id,   parent_societe_id)
           )
      );

    -- INSERT / UPDATE : la mère (parent_societe_id) pilote — il faut son accès
    CREATE POLICY cons_elim_tenant_insert ON public.consolidation_eliminations
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(parent_societe_id)
      );

    CREATE POLICY cons_elim_tenant_update ON public.consolidation_eliminations
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(parent_societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(parent_societe_id)
      );

    -- DELETE : admin global uniquement
    CREATE POLICY cons_elim_tenant_delete ON public.consolidation_eliminations
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 5. TP_TRANSACTIONS  (transfer_pricing)
-- Mono-societe (societe_id), mais la spec demande de couvrir
-- transfer_pricing. On utilise societe_id classique.
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tp_transactions') THEN
    ALTER TABLE public.tp_transactions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tp_tx_tenant_select ON public.tp_transactions;
    DROP POLICY IF EXISTS tp_tx_tenant_modify ON public.tp_transactions;
    DROP POLICY IF EXISTS tp_tx_tenant_insert ON public.tp_transactions;
    DROP POLICY IF EXISTS tp_tx_tenant_update ON public.tp_transactions;
    DROP POLICY IF EXISTS tp_tx_tenant_delete ON public.tp_transactions;

    CREATE POLICY tp_tx_tenant_select ON public.tp_transactions
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_tx_tenant_insert ON public.tp_transactions
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_tx_tenant_update ON public.tp_transactions
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_tx_tenant_delete ON public.tp_transactions
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 6. TP_MASTER_FILE  (transfer_pricing)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tp_master_file') THEN
    ALTER TABLE public.tp_master_file ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tp_mf_tenant_select ON public.tp_master_file;
    DROP POLICY IF EXISTS tp_mf_tenant_modify ON public.tp_master_file;
    DROP POLICY IF EXISTS tp_mf_tenant_insert ON public.tp_master_file;
    DROP POLICY IF EXISTS tp_mf_tenant_update ON public.tp_master_file;
    DROP POLICY IF EXISTS tp_mf_tenant_delete ON public.tp_master_file;

    CREATE POLICY tp_mf_tenant_select ON public.tp_master_file
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_mf_tenant_insert ON public.tp_master_file
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_mf_tenant_update ON public.tp_master_file
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY tp_mf_tenant_delete ON public.tp_master_file
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 7. GLOBE_JURISDICTIONS  (gbc_pillar_two)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='globe_jurisdictions') THEN
    ALTER TABLE public.globe_jurisdictions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS globe_tenant_select ON public.globe_jurisdictions;
    DROP POLICY IF EXISTS globe_tenant_modify ON public.globe_jurisdictions;
    DROP POLICY IF EXISTS globe_tenant_insert ON public.globe_jurisdictions;
    DROP POLICY IF EXISTS globe_tenant_update ON public.globe_jurisdictions;
    DROP POLICY IF EXISTS globe_tenant_delete ON public.globe_jurisdictions;

    CREATE POLICY globe_tenant_select ON public.globe_jurisdictions
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY globe_tenant_insert ON public.globe_jurisdictions
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY globe_tenant_update ON public.globe_jurisdictions
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY globe_tenant_delete ON public.globe_jurisdictions
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 8. GLOBE_GIR_SUBMISSIONS  (gbc_pillar_two)
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='globe_gir_submissions') THEN
    ALTER TABLE public.globe_gir_submissions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS gir_tenant_select ON public.globe_gir_submissions;
    DROP POLICY IF EXISTS gir_tenant_modify ON public.globe_gir_submissions;
    DROP POLICY IF EXISTS gir_tenant_insert ON public.globe_gir_submissions;
    DROP POLICY IF EXISTS gir_tenant_update ON public.globe_gir_submissions;
    DROP POLICY IF EXISTS gir_tenant_delete ON public.globe_gir_submissions;

    CREATE POLICY gir_tenant_select ON public.globe_gir_submissions
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY gir_tenant_insert ON public.globe_gir_submissions
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY gir_tenant_update ON public.globe_gir_submissions
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY gir_tenant_delete ON public.globe_gir_submissions
      FOR DELETE
      USING (public.is_global_admin());
  END IF;
END $$;

-- =================================================================
-- 9. BENEFICIAL_OWNERS  (ubo_registry)
-- Données KYC sensibles — DELETE interdit même au global admin
-- (obligation FIAMLA de conservation 7 ans).
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='beneficial_owners') THEN
    ALTER TABLE public.beneficial_owners ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS ubo_tenant_select ON public.beneficial_owners;
    DROP POLICY IF EXISTS ubo_tenant_modify ON public.beneficial_owners;
    DROP POLICY IF EXISTS ubo_tenant_insert ON public.beneficial_owners;
    DROP POLICY IF EXISTS ubo_tenant_update ON public.beneficial_owners;
    DROP POLICY IF EXISTS ubo_tenant_delete ON public.beneficial_owners;

    CREATE POLICY ubo_tenant_select ON public.beneficial_owners
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY ubo_tenant_insert ON public.beneficial_owners
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY ubo_tenant_update ON public.beneficial_owners
      FOR UPDATE
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      )
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    -- Pas de DELETE policy : DELETE bloqué pour tous (FIAMLA 7 ans).
  END IF;
END $$;

-- =================================================================
-- 10. BENEFICIAL_OWNERS_HISTORY  (ubo_registry)
-- Audit trail immuable — INSERT par triggers uniquement, jamais d'UPDATE/DELETE.
-- =================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='beneficial_owners_history') THEN
    ALTER TABLE public.beneficial_owners_history ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS ubo_hist_tenant_select ON public.beneficial_owners_history;
    DROP POLICY IF EXISTS ubo_hist_tenant_modify ON public.beneficial_owners_history;
    DROP POLICY IF EXISTS ubo_hist_tenant_insert ON public.beneficial_owners_history;

    CREATE POLICY ubo_hist_tenant_select ON public.beneficial_owners_history
      FOR SELECT
      USING (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    -- INSERT autorisé pour l'auteur ayant accès (trigger l'utilise via SECURITY DEFINER)
    CREATE POLICY ubo_hist_tenant_insert ON public.beneficial_owners_history
      FOR INSERT
      WITH CHECK (
        public.is_global_admin()
        OR public.user_has_societe_access(societe_id)
      );

    -- UPDATE / DELETE : interdits (immuabilité audit)
  END IF;
END $$;

-- ============================================================
-- VERIFICATION (à exécuter manuellement après apply) :
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN (
--       'flux_interco','societes_relationships','consolidation_eliminations',
--       'tp_transactions','tp_master_file','globe_jurisdictions',
--       'globe_gir_submissions','beneficial_owners','beneficial_owners_history'
--     )
--   ORDER BY tablename, cmd;
--
-- Doit retourner ≥ 4 policies par table (sauf beneficial_owners_history = 2,
-- beneficial_owners = 3 sans DELETE).
-- ============================================================
