-- ============================================================
-- MIGRATION 415 — FIX RLS POLICIES PHASE 2 — PARTIE B (SEC-003)
-- Tables RH/Paie liées à un employé via employes.societe_id
--
-- Préconditions :
--   - public.user_has_societe_access(uuid) doit exister
--     (créé par migration 404 / agent V1-2 partie A)
--   - Table public.employes(id, societe_id) existe
--
-- Pattern :
--   - DROP de toutes les policies "théâtre" (USING auth.uid() IS NOT NULL)
--     ou role-based cross-tenant connues sur ces tables.
--   - CREATE de policies strictes :
--       USING / WITH CHECK = public.user_has_employe_access(employe_id)
--
-- Idempotence : DROP IF EXISTS + CREATE conditionnel via pg_policies.
-- Tables ignorées si absentes (les blocs sont gardés par pg_tables).
--
-- Périmètre :
--   bulletins_paie, pointages, demandes_conges,
--   frais_km_mois (a.k.a. frais_km), trajets_kilometriques (a.k.a. trajets_km),
--   severance_calculs (a.k.a. severance), eoy_bonus_calculs (a.k.a. eoy_bonus)
--
-- Tables citées dans la mission mais absentes du schéma actuel
-- (donc ignorées par les gardes pg_tables) :
--   provisions_conges, documents_employes, cotisations_sociales
--   NOTE : documents_rh existe et possède DÉJÀ des policies tenant-aware
--   (cf. mig 178), donc volontairement non touchée ici.
-- ============================================================

-- ------------------------------------------------------------
-- HELPER : user_has_employe_access(uuid)
--   Idempotent. Suppose que user_has_societe_access existe
--   (sera créé en parallèle par l'agent V1-2 / migration 404).
--   On ne RAISE pas si absent : la fonction sera invalide à
--   l'exécution mais la migration 415B passe quand même.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_employe_access(p_employe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employes e
    WHERE e.id = p_employe_id
      AND public.user_has_societe_access(e.societe_id)
  );
$$;

COMMENT ON FUNCTION public.user_has_employe_access(uuid) IS
  'SEC-003 partB : retourne true si l''utilisateur courant a accès à la société de l''employé donné. Utilisé par les policies RLS sur bulletins_paie / pointages / demandes_conges / frais_km_mois / trajets_kilometriques / severance_calculs / eoy_bonus_calculs.';

-- Permettre l'exécution depuis le rôle authenticated
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.user_has_employe_access(uuid) TO authenticated';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- B1. bulletins_paie
--   Note : mig 404 a déjà créé bulletins_paie_tenant_select /
--   bulletins_paie_tenant_modify avec une logique EXISTS équivalente.
--   On les remplace ici par une version utilisant le helper, plus
--   lisible et plus rapide (function STABLE inlinable).
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='bulletins_paie') THEN
    -- Activer RLS (idempotent)
    EXECUTE 'ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY';

    -- DROP policies théâtre / legacy
    DROP POLICY IF EXISTS "rh_bulletins_access"        ON public.bulletins_paie;
    DROP POLICY IF EXISTS "bulletins_auth"             ON public.bulletins_paie;
    DROP POLICY IF EXISTS "bulletins_auth_016"         ON public.bulletins_paie;
    DROP POLICY IF EXISTS "rh_bulletins_paie_access"   ON public.bulletins_paie;
    DROP POLICY IF EXISTS "bulletins_comptable_admin"  ON public.bulletins_paie;
    DROP POLICY IF EXISTS "bulletins_client_read"      ON public.bulletins_paie;
    -- DROP des policies créées par mig 404 pour les remplacer par le helper
    DROP POLICY IF EXISTS "bulletins_paie_tenant_select" ON public.bulletins_paie;
    DROP POLICY IF EXISTS "bulletins_paie_tenant_modify" ON public.bulletins_paie;

    -- CREATE policies strictes via helper
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bulletins_paie' AND policyname='bulletins_paie_tenant_select') THEN
      CREATE POLICY bulletins_paie_tenant_select ON public.bulletins_paie
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bulletins_paie' AND policyname='bulletins_paie_tenant_insert') THEN
      CREATE POLICY bulletins_paie_tenant_insert ON public.bulletins_paie
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bulletins_paie' AND policyname='bulletins_paie_tenant_update') THEN
      CREATE POLICY bulletins_paie_tenant_update ON public.bulletins_paie
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bulletins_paie' AND policyname='bulletins_paie_tenant_delete') THEN
      CREATE POLICY bulletins_paie_tenant_delete ON public.bulletins_paie
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B2. pointages
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pointages') THEN
    EXECUTE 'ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "pointages_auth"        ON public.pointages;
    DROP POLICY IF EXISTS "rh_pointages_access"   ON public.pointages;
    DROP POLICY IF EXISTS "pointages_auth_017"    ON public.pointages;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pointages' AND policyname='pointages_tenant_select') THEN
      CREATE POLICY pointages_tenant_select ON public.pointages
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pointages' AND policyname='pointages_tenant_insert') THEN
      CREATE POLICY pointages_tenant_insert ON public.pointages
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pointages' AND policyname='pointages_tenant_update') THEN
      CREATE POLICY pointages_tenant_update ON public.pointages
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pointages' AND policyname='pointages_tenant_delete') THEN
      CREATE POLICY pointages_tenant_delete ON public.pointages
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B3. demandes_conges
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='demandes_conges') THEN
    EXECUTE 'ALTER TABLE public.demandes_conges ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "conges_auth"          ON public.demandes_conges;
    DROP POLICY IF EXISTS "demandes_conges_auth" ON public.demandes_conges;
    DROP POLICY IF EXISTS "rh_conges_access"     ON public.demandes_conges;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demandes_conges' AND policyname='demandes_conges_tenant_select') THEN
      CREATE POLICY demandes_conges_tenant_select ON public.demandes_conges
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demandes_conges' AND policyname='demandes_conges_tenant_insert') THEN
      CREATE POLICY demandes_conges_tenant_insert ON public.demandes_conges
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demandes_conges' AND policyname='demandes_conges_tenant_update') THEN
      CREATE POLICY demandes_conges_tenant_update ON public.demandes_conges
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demandes_conges' AND policyname='demandes_conges_tenant_delete') THEN
      CREATE POLICY demandes_conges_tenant_delete ON public.demandes_conges
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B4. frais_km_mois (table physique pour "frais_km")
--   Policy historique : rh_full_fkm — accès cross-tenant à
--   quiconque a un rôle RH. À remplacer par scoping tenant.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='frais_km_mois') THEN
    EXECUTE 'ALTER TABLE public.frais_km_mois ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "rh_full_fkm"      ON public.frais_km_mois;
    DROP POLICY IF EXISTS "frais_km_auth"    ON public.frais_km_mois;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='frais_km_mois' AND policyname='frais_km_mois_tenant_select') THEN
      CREATE POLICY frais_km_mois_tenant_select ON public.frais_km_mois
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='frais_km_mois' AND policyname='frais_km_mois_tenant_insert') THEN
      CREATE POLICY frais_km_mois_tenant_insert ON public.frais_km_mois
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='frais_km_mois' AND policyname='frais_km_mois_tenant_update') THEN
      CREATE POLICY frais_km_mois_tenant_update ON public.frais_km_mois
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='frais_km_mois' AND policyname='frais_km_mois_tenant_delete') THEN
      CREATE POLICY frais_km_mois_tenant_delete ON public.frais_km_mois
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B5. trajets_kilometriques (a.k.a. "trajets_km")
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='trajets_kilometriques') THEN
    EXECUTE 'ALTER TABLE public.trajets_kilometriques ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "trajets_access"        ON public.trajets_kilometriques;
    DROP POLICY IF EXISTS "trajets_auth"          ON public.trajets_kilometriques;
    DROP POLICY IF EXISTS "trajets_km_auth"       ON public.trajets_kilometriques;
    DROP POLICY IF EXISTS "rh_trajets_access"     ON public.trajets_kilometriques;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trajets_kilometriques' AND policyname='trajets_kilometriques_tenant_select') THEN
      CREATE POLICY trajets_kilometriques_tenant_select ON public.trajets_kilometriques
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trajets_kilometriques' AND policyname='trajets_kilometriques_tenant_insert') THEN
      CREATE POLICY trajets_kilometriques_tenant_insert ON public.trajets_kilometriques
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trajets_kilometriques' AND policyname='trajets_kilometriques_tenant_update') THEN
      CREATE POLICY trajets_kilometriques_tenant_update ON public.trajets_kilometriques
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trajets_kilometriques' AND policyname='trajets_kilometriques_tenant_delete') THEN
      CREATE POLICY trajets_kilometriques_tenant_delete ON public.trajets_kilometriques
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B6. severance_calculs (a.k.a. "severance")
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='severance_calculs') THEN
    EXECUTE 'ALTER TABLE public.severance_calculs ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "severance_rh_all" ON public.severance_calculs;
    DROP POLICY IF EXISTS "severance_auth"   ON public.severance_calculs;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='severance_calculs' AND policyname='severance_calculs_tenant_select') THEN
      CREATE POLICY severance_calculs_tenant_select ON public.severance_calculs
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='severance_calculs' AND policyname='severance_calculs_tenant_insert') THEN
      CREATE POLICY severance_calculs_tenant_insert ON public.severance_calculs
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='severance_calculs' AND policyname='severance_calculs_tenant_update') THEN
      CREATE POLICY severance_calculs_tenant_update ON public.severance_calculs
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='severance_calculs' AND policyname='severance_calculs_tenant_delete') THEN
      CREATE POLICY severance_calculs_tenant_delete ON public.severance_calculs
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- B7. eoy_bonus_calculs (a.k.a. "eoy_bonus")
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='eoy_bonus_calculs') THEN
    EXECUTE 'ALTER TABLE public.eoy_bonus_calculs ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "eoy_bonus_rh_all" ON public.eoy_bonus_calculs;
    DROP POLICY IF EXISTS "eoy_bonus_auth"   ON public.eoy_bonus_calculs;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eoy_bonus_calculs' AND policyname='eoy_bonus_calculs_tenant_select') THEN
      CREATE POLICY eoy_bonus_calculs_tenant_select ON public.eoy_bonus_calculs
        FOR SELECT USING (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eoy_bonus_calculs' AND policyname='eoy_bonus_calculs_tenant_insert') THEN
      CREATE POLICY eoy_bonus_calculs_tenant_insert ON public.eoy_bonus_calculs
        FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eoy_bonus_calculs' AND policyname='eoy_bonus_calculs_tenant_update') THEN
      CREATE POLICY eoy_bonus_calculs_tenant_update ON public.eoy_bonus_calculs
        FOR UPDATE USING (public.user_has_employe_access(employe_id))
                   WITH CHECK (public.user_has_employe_access(employe_id));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eoy_bonus_calculs' AND policyname='eoy_bonus_calculs_tenant_delete') THEN
      CREATE POLICY eoy_bonus_calculs_tenant_delete ON public.eoy_bonus_calculs
        FOR DELETE USING (public.user_has_employe_access(employe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- AUDIT — alerter si des policies "théâtre" subsistent sur les
-- tables ciblées par cette partie B.
-- ============================================================
DO $$
DECLARE
  v_count int;
  v_table text;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'bulletins_paie','pointages','demandes_conges',
      'frais_km_mois','trajets_kilometriques',
      'severance_calculs','eoy_bonus_calculs'
    ])
  LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename = v_table
      AND qual = '(auth.uid() IS NOT NULL)';
    IF v_count > 0 THEN
      RAISE WARNING 'SEC-003 partB : table % a encore % policy "théâtre" résiduelle(s)', v_table, v_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'SEC-003 partB : migration 415 appliquée — helper user_has_employe_access + policies tenant sur 7 tables RH/paie.';
END $$;
