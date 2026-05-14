-- ============================================================================
-- Migration 253 — Phase E GBC : Beneficial Ownership Register
-- ============================================================================
-- FSC AML Act + FATF. UBO ≥10% obligatoire. Pénalité non-conformité : MUR 1M
-- + suspension licence. Mise à jour < 30 jours d'un changement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beneficial_owners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  date_naissance      DATE,
  nationalite         TEXT,                  -- ISO 3166-1
  pays_residence      TEXT,                  -- ISO 3166-1
  adresse_complete    TEXT,
  id_type             TEXT NOT NULL CHECK (id_type IN ('passport','national_id','driver_license')),
  id_number           TEXT NOT NULL,
  id_expiry           DATE,
  id_country          TEXT,                  -- pays émetteur
  pct_detention       NUMERIC(5,2) NOT NULL CHECK (pct_detention BETWEEN 0 AND 100),
  nature_controle     TEXT NOT NULL CHECK (nature_controle IN ('shares','voting','board','contract','other')),
  is_pep              BOOLEAN NOT NULL DEFAULT FALSE,
  pep_details         TEXT,
  sanctions_screened  BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_clear     BOOLEAN,
  kyc_docs_provided   JSONB DEFAULT '[]'::JSONB,  -- liste des documents fournis
  declared_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at    TIMESTAMPTZ,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,                   -- NULL = actif
  declared_by         UUID REFERENCES auth.users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ubo_societe ON public.beneficial_owners(societe_id);
CREATE INDEX IF NOT EXISTS idx_ubo_active ON public.beneficial_owners(societe_id) WHERE effective_to IS NULL;

ALTER TABLE public.beneficial_owners ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='beneficial_owners' AND policyname='ubo_tenant_select') THEN
    CREATE POLICY ubo_tenant_select ON public.beneficial_owners
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ubo_tenant_modify ON public.beneficial_owners
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Audit trail des changements UBO (immuable, INSERT only)
CREATE TABLE IF NOT EXISTS public.beneficial_owners_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  ubo_id          UUID,
  action          TEXT NOT NULL CHECK (action IN ('declared','updated','revoked','attested')),
  old_value       JSONB,
  new_value       JSONB,
  changed_by      UUID REFERENCES auth.users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ubo_history_societe ON public.beneficial_owners_history(societe_id, changed_at DESC);
ALTER TABLE public.beneficial_owners_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='beneficial_owners_history' AND policyname='ubo_hist_tenant_select') THEN
    CREATE POLICY ubo_hist_tenant_select ON public.beneficial_owners_history
      FOR SELECT USING (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Vue : UBOs actifs avec contrôle ≥10%
CREATE OR REPLACE VIEW public.vw_active_ubos AS
SELECT
  societe_id, id, prenom, nom, nationalite, pct_detention, nature_controle,
  is_pep, sanctions_clear,
  CASE
    WHEN pct_detention >= 25 THEN 'controlling'
    WHEN pct_detention >= 10 THEN 'significant'
    ELSE 'minor'
  END AS control_level
FROM public.beneficial_owners
WHERE effective_to IS NULL AND pct_detention >= 10;

DO $$ BEGIN RAISE NOTICE '✓ Migration 253 — Phase E GBC : Beneficial Owners (UBO)'; END $$;
