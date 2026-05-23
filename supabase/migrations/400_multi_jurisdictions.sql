-- ============================================================================
-- Migration 400: Multi-Jurisdiction Support (OHADA + Mauritius)
-- ============================================================================

-- 1. Create jurisdictions table (catalog of supported jurisdictions)
CREATE TABLE IF NOT EXISTS public.jurisdictions (
  code VARCHAR(2) PRIMARY KEY,  -- ISO 3166-1 alpha-2 (MU, SN, CI, etc.)
  name_en VARCHAR(100) NOT NULL,
  name_fr VARCHAR(100) NOT NULL,
  framework VARCHAR(20) NOT NULL,  -- 'PCM', 'SYSCOHADA', 'IFRS'
  currency_code VARCHAR(3) NOT NULL,
  fiscal_year_start CHAR(5) NOT NULL DEFAULT '01-01',  -- MM-DD
  fiscal_year_end CHAR(5) NOT NULL DEFAULT '12-31',
  economic_zone VARCHAR(20),  -- 'UEMOA', 'CEMAC', 'OHADA', etc.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Tax rates, contribution rates, etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed jurisdictions
INSERT INTO public.jurisdictions (code, name_en, name_fr, framework, currency_code, economic_zone, config) VALUES
  -- Existing
  ('MU', 'Mauritius', 'Maurice', 'PCM', 'MUR', NULL, '{}'::jsonb),
  -- OHADA UEMOA
  ('SN', 'Senegal', 'Sénégal', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('CI', 'Ivory Coast', 'Côte d''Ivoire', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('ML', 'Mali', 'Mali', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('BF', 'Burkina Faso', 'Burkina Faso', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('NE', 'Niger', 'Niger', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('BJ', 'Benin', 'Bénin', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('TG', 'Togo', 'Togo', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  ('GW', 'Guinea-Bissau', 'Guinée-Bissau', 'SYSCOHADA', 'XOF', 'UEMOA', '{}'::jsonb),
  -- OHADA CEMAC
  ('CM', 'Cameroon', 'Cameroun', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  ('GA', 'Gabon', 'Gabon', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  ('CG', 'Republic of Congo', 'Congo', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  ('TD', 'Chad', 'Tchad', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  ('CF', 'Central African Republic', 'Centrafrique', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  ('GQ', 'Equatorial Guinea', 'Guinée Équatoriale', 'SYSCOHADA', 'XAF', 'CEMAC', '{}'::jsonb),
  -- OHADA Other
  ('KM', 'Comoros', 'Comores', 'SYSCOHADA', 'KMF', 'OHADA', '{}'::jsonb),
  ('CD', 'DR Congo', 'RDC', 'SYSCOHADA', 'CDF', 'OHADA', '{}'::jsonb),
  ('GN', 'Guinea', 'Guinée', 'SYSCOHADA', 'GNF', 'OHADA', '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 3. Add jurisdiction_code to societes table
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(2) REFERENCES public.jurisdictions(code) DEFAULT 'MU';

CREATE INDEX IF NOT EXISTS idx_societes_jurisdiction ON public.societes(jurisdiction_code);

-- 4. Create chart_of_accounts table (with jurisdiction support)
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code VARCHAR(2) REFERENCES public.jurisdictions(code),  -- NULL = applies to all
  framework VARCHAR(20) NOT NULL,  -- PCM, SYSCOHADA
  account_number VARCHAR(10) NOT NULL,
  label_en VARCHAR(255),
  label_fr VARCHAR(255) NOT NULL,
  class_number SMALLINT NOT NULL,
  category VARCHAR(50) NOT NULL,  -- BALANCE_SHEET_ASSET, etc.
  is_auxiliary BOOLEAN DEFAULT false,
  normal_balance VARCHAR(10) NOT NULL,  -- DEBIT, CREDIT
  is_reconcilable BOOLEAN DEFAULT false,
  parent_account VARCHAR(10),
  tax_code VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(framework, account_number, jurisdiction_code)
);

CREATE INDEX IF NOT EXISTS idx_chart_accounts_framework ON public.chart_of_accounts(framework);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_class ON public.chart_of_accounts(class_number);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_jurisdiction ON public.chart_of_accounts(jurisdiction_code);

-- 5. Add jurisdiction tracking to GL entries
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(2) REFERENCES public.jurisdictions(code) DEFAULT 'MU';

CREATE INDEX IF NOT EXISTS idx_ecritures_jurisdiction ON public.ecritures_comptables_v2(jurisdiction_code);

-- 6. RLS policies for jurisdictions (read-only for authenticated users)
-- Idempotent : DROP IF EXISTS avant CREATE pour permettre les re-runs.
ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jurisdictions_read_all" ON public.jurisdictions;
CREATE POLICY "jurisdictions_read_all" ON public.jurisdictions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chart_accounts_read_all" ON public.chart_of_accounts;
CREATE POLICY "chart_accounts_read_all" ON public.chart_of_accounts
  FOR SELECT TO authenticated USING (true);

-- 7. Helper view: chart of accounts for a specific company
-- NOTE : s.jurisdiction_code et coa.jurisdiction_code sont sémantiquement
-- différents (juridiction de la société vs juridiction du compte, qui peut
-- être NULL pour les comptes globaux). On alias explicitement pour que
-- Postgres accepte la vue (42701 "column specified more than once" sinon).
CREATE OR REPLACE VIEW public.v_societe_chart_of_accounts AS
SELECT
  s.id AS societe_id,
  s.nom AS societe_nom,
  s.jurisdiction_code AS societe_jurisdiction_code,
  coa.id AS coa_id,
  coa.jurisdiction_code AS coa_jurisdiction_code,
  coa.framework,
  coa.account_number,
  coa.label_en,
  coa.label_fr,
  coa.class_number,
  coa.category,
  coa.is_auxiliary,
  coa.normal_balance,
  coa.is_reconcilable,
  coa.parent_account,
  coa.tax_code,
  coa.created_at AS coa_created_at
FROM public.societes s
LEFT JOIN public.chart_of_accounts coa
  ON coa.framework = (SELECT framework FROM public.jurisdictions WHERE code = s.jurisdiction_code)
  AND (coa.jurisdiction_code IS NULL OR coa.jurisdiction_code = s.jurisdiction_code);

GRANT SELECT ON public.v_societe_chart_of_accounts TO authenticated;

COMMENT ON TABLE public.jurisdictions IS 'Multi-jurisdiction catalog supporting PCM (Mauritius) and SYSCOHADA (17 OHADA countries)';
COMMENT ON TABLE public.chart_of_accounts IS 'Unified chart of accounts across all jurisdictions';
COMMENT ON COLUMN public.societes.jurisdiction_code IS 'Determines accounting framework, currency, fiscal year, and tax engine for this company';
