-- ============================================================================
-- Migration 255 — Phase G GBC : CRS / FATCA reporting
-- ============================================================================
-- OECD CRS + US-Mauritius IGA Model 1A. Annual filing à la MRA (31 juillet).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crs_account_holders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reporting_year       INT NOT NULL,
  holder_type          TEXT NOT NULL CHECK (holder_type IN ('individual','entity','controlling_person')),
  holder_name          TEXT NOT NULL,
  holder_dob           DATE,
  holder_address       TEXT,
  country_of_residence TEXT NOT NULL,          -- ISO 3166-1
  tin                  TEXT,                    -- Tax Identification Number
  tin_issuing_country  TEXT,
  account_number       TEXT NOT NULL,
  account_balance_eoy_usd  NUMERIC(15,2),       -- End of year balance USD
  account_currency     TEXT NOT NULL DEFAULT 'USD',
  interest_paid_usd    NUMERIC(15,2) DEFAULT 0,
  dividends_paid_usd   NUMERIC(15,2) DEFAULT 0,
  gross_proceeds_usd   NUMERIC(15,2) DEFAULT 0,  -- sale proceeds
  other_income_usd     NUMERIC(15,2) DEFAULT 0,
  is_fatca_reportable  BOOLEAN NOT NULL DEFAULT FALSE,  -- US Person
  is_crs_reportable    BOOLEAN NOT NULL DEFAULT TRUE,
  document_status      TEXT NOT NULL DEFAULT 'pending'
                       CHECK (document_status IN ('pending','self_certified','due_diligence_complete','reported','closed')),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crs_societe_year ON public.crs_account_holders(societe_id, reporting_year);
CREATE INDEX IF NOT EXISTS idx_crs_country ON public.crs_account_holders(country_of_residence);
ALTER TABLE public.crs_account_holders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crs_account_holders' AND policyname='crs_tenant_select') THEN
    CREATE POLICY crs_tenant_select ON public.crs_account_holders
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY crs_tenant_modify ON public.crs_account_holders
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Submissions tracking (filings à la MRA)
CREATE TABLE IF NOT EXISTS public.crs_fatca_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reporting_year     INT NOT NULL,
  submission_type    TEXT NOT NULL CHECK (submission_type IN ('crs','fatca','combined')),
  submission_date    DATE,
  nb_holders         INT NOT NULL DEFAULT 0,
  total_balance_usd  NUMERIC(15,2),
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','accepted','rejected','amended')),
  mra_ref            TEXT,                       -- référence MRA après acceptation
  xml_payload        TEXT,                       -- XML CRS schema 2.0 généré
  errors             TEXT,
  submitted_by       UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, reporting_year, submission_type)
);
ALTER TABLE public.crs_fatca_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crs_fatca_submissions' AND policyname='crs_sub_tenant_select') THEN
    CREATE POLICY crs_sub_tenant_select ON public.crs_fatca_submissions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY crs_sub_tenant_modify ON public.crs_fatca_submissions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 255 — Phase G GBC : CRS / FATCA'; END $$;
