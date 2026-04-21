-- ═══════════════════════════════════════════════════════════════
-- Migration 158: Strict tenant isolation on accounting tables
--
-- Problem: prior policies grant `FOR ALL` to any user with role
--   admin/comptable/comptable_dedie without filtering by societe_id.
--   A comptable assigned to Société A could therefore read/modify
--   écritures or relevés of Société B if a valid token was obtained.
--
-- Solution: add societe_id-scoped policies that consult
--   public.user_societes (multi-tenant membership table introduced
--   in migrations 030/048). Global roles (`admin`, `super_admin`)
--   retain global access.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Helper: returns true if the current user is a global admin.
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- Helper: returns true if the current user has access to a given societe
-- (member via user_societes, owner via societes.created_by, or client of
-- a dossier attached to the societe).
CREATE OR REPLACE FUNCTION public.user_has_societe_access(p_societe UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_societes us
        WHERE us.user_id = auth.uid() AND us.societe_id = p_societe
      )
      OR EXISTS (
        SELECT 1 FROM public.societes s
        WHERE s.id = p_societe AND s.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.societe_id = p_societe AND d.client_id = auth.uid()
      )
    );
$$;

-- ── ecritures_comptables_v2 ────────────────────────────────────────
-- Replace broad "manage" policies with societe-scoped variants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ecritures_comptables_v2') THEN

    ALTER TABLE public.ecritures_comptables_v2 ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admins can manage ecritures v2"    ON public.ecritures_comptables_v2;
    DROP POLICY IF EXISTS "Comptables can manage ecritures v2" ON public.ecritures_comptables_v2;
    DROP POLICY IF EXISTS ecritures_v2_client_read             ON public.ecritures_comptables_v2;
    DROP POLICY IF EXISTS ecritures_v2_tenant_select           ON public.ecritures_comptables_v2;
    DROP POLICY IF EXISTS ecritures_v2_tenant_modify           ON public.ecritures_comptables_v2;

    CREATE POLICY ecritures_v2_tenant_select ON public.ecritures_comptables_v2
      FOR SELECT
      USING (
        societe_id IS NULL
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY ecritures_v2_tenant_modify ON public.ecritures_comptables_v2
      FOR ALL
      USING (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      )
      WITH CHECK (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      );
  END IF;
END $$;

-- ── releves_bancaires ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='releves_bancaires') THEN

    ALTER TABLE public.releves_bancaires ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "manage_releves"               ON public.releves_bancaires;
    DROP POLICY IF EXISTS "client_read_releves_bancaires" ON public.releves_bancaires;
    DROP POLICY IF EXISTS releves_tenant_select           ON public.releves_bancaires;
    DROP POLICY IF EXISTS releves_tenant_modify           ON public.releves_bancaires;

    CREATE POLICY releves_tenant_select ON public.releves_bancaires
      FOR SELECT
      USING (
        societe_id IS NULL
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY releves_tenant_modify ON public.releves_bancaires
      FOR ALL
      USING (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      )
      WITH CHECK (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      );
  END IF;
END $$;

-- ── factures ───────────────────────────────────────────────────────
-- Existing `factures_auth` policy is too permissive (any authenticated
-- user could read every invoice). Replace with tenant-scoped access.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='factures') THEN

    ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "factures_auth"          ON public.factures;
    DROP POLICY IF EXISTS factures_tenant_select   ON public.factures;
    DROP POLICY IF EXISTS factures_tenant_modify   ON public.factures;

    CREATE POLICY factures_tenant_select ON public.factures
      FOR SELECT
      USING (
        societe_id IS NULL
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY factures_tenant_modify ON public.factures
      FOR ALL
      USING (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      )
      WITH CHECK (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      );
  END IF;
END $$;

-- ── comptes_bancaires ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='comptes_bancaires') THEN

    ALTER TABLE public.comptes_bancaires ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "client_read_comptes_bancaires" ON public.comptes_bancaires;
    DROP POLICY IF EXISTS comptes_bancaires_tenant_select ON public.comptes_bancaires;
    DROP POLICY IF EXISTS comptes_bancaires_tenant_modify ON public.comptes_bancaires;

    CREATE POLICY comptes_bancaires_tenant_select ON public.comptes_bancaires
      FOR SELECT
      USING (
        societe_id IS NULL
        OR public.user_has_societe_access(societe_id)
      );

    CREATE POLICY comptes_bancaires_tenant_modify ON public.comptes_bancaires
      FOR ALL
      USING (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      )
      WITH CHECK (
        public.is_global_admin()
        OR (societe_id IS NOT NULL AND public.user_has_societe_access(societe_id))
      );
  END IF;
END $$;

-- ── composite index to accelerate GL queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_ec_v2_societe_date
  ON public.ecritures_comptables_v2(societe_id, date_ecriture);

CREATE INDEX IF NOT EXISTS idx_ec_v2_societe_compte
  ON public.ecritures_comptables_v2(societe_id, numero_compte);

DO $$
BEGIN
  RAISE NOTICE 'Migration 158: tenant-scoped RLS applied on ecritures_comptables_v2, releves_bancaires, factures, comptes_bancaires.';
END $$;
