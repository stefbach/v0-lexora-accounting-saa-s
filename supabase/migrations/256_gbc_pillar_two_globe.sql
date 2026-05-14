-- ============================================================================
-- Migration 256 — Phase H GBC : BEPS Pillar Two GloBE
-- ============================================================================
-- OECD Pillar Two — Global Minimum Tax 15% pour MNE > €750M de CA mondial.
-- Applicable Maurice depuis 2025. DMTT (Domestic Minimum Top-up Tax) si
-- ETR < 15%.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.globe_jurisdictions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice        TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL,                    -- ISO 3166-1
  globe_income_mur     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- profit financier ajusté GloBE
  covered_taxes_mur    NUMERIC(15,2) NOT NULL DEFAULT 0,
  payroll_mur          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- pour SBIE
  tangible_assets_mur  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- pour SBIE
  etr_pct              NUMERIC(5,3),                       -- Effective Tax Rate
  top_up_tax_mur       NUMERIC(15,2),                      -- (15% - ETR) × Excess Profit
  is_low_taxed         BOOLEAN GENERATED ALWAYS AS (etr_pct < 15) STORED,
  computed_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice, jurisdiction)
);
CREATE INDEX IF NOT EXISTS idx_globe_societe ON public.globe_jurisdictions(societe_id, exercice);
ALTER TABLE public.globe_jurisdictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='globe_jurisdictions' AND policyname='globe_tenant_select') THEN
    CREATE POLICY globe_tenant_select ON public.globe_jurisdictions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY globe_tenant_modify ON public.globe_jurisdictions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- GloBE Information Return (GIR) tracking
CREATE TABLE IF NOT EXISTS public.globe_gir_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice           TEXT NOT NULL,
  consolidated_revenue_eur NUMERIC(15,2) NOT NULL,
  is_in_scope        BOOLEAN GENERATED ALWAYS AS (consolidated_revenue_eur >= 750000000) STORED,
  total_top_up_mur   NUMERIC(15,2),
  total_dmtt_mur     NUMERIC(15,2),                 -- Domestic Minimum Top-up Tax (Maurice)
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','accepted','rejected')),
  submission_date    DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
ALTER TABLE public.globe_gir_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='globe_gir_submissions' AND policyname='gir_tenant_select') THEN
    CREATE POLICY gir_tenant_select ON public.globe_gir_submissions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY gir_tenant_modify ON public.globe_gir_submissions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : calcul ETR + top-up tax pour une juridiction
-- ETR = covered_taxes / globe_income
-- Excess profit = globe_income - SBIE (Substance-Based Income Exclusion)
-- SBIE = 5% × payroll + 5% × tangible_assets (taux 2024+, dégressif)
-- Top-up = (15% - ETR) × Excess Profit
CREATE OR REPLACE FUNCTION public.compute_globe_top_up(
  p_globe_id UUID
) RETURNS TABLE (
  jurisdiction TEXT,
  etr_pct NUMERIC,
  sbie_mur NUMERIC,
  excess_profit_mur NUMERIC,
  top_up_tax_mur NUMERIC,
  is_below_15pct BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_etr NUMERIC;
  v_sbie NUMERIC;
  v_excess NUMERIC;
  v_topup NUMERIC;
BEGIN
  SELECT * INTO r FROM public.globe_jurisdictions WHERE id = p_globe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'globe record % not found', p_globe_id; END IF;
  v_etr := CASE WHEN r.globe_income_mur > 0 THEN (r.covered_taxes_mur / r.globe_income_mur) * 100 ELSE 0 END;
  -- SBIE 2024+ : 5% payroll + 5% tangibles (en 2033 ce sera 5% / 5% — phase-in)
  v_sbie := (r.payroll_mur * 0.05) + (r.tangible_assets_mur * 0.05);
  v_excess := GREATEST(0, r.globe_income_mur - v_sbie);
  v_topup := CASE WHEN v_etr < 15 THEN v_excess * (15 - v_etr) / 100 ELSE 0 END;
  RETURN QUERY SELECT r.jurisdiction, ROUND(v_etr, 3), ROUND(v_sbie, 2), ROUND(v_excess, 2), ROUND(v_topup, 2), v_etr < 15;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 256 — Phase H GBC : BEPS Pillar Two GloBE'; END $$;
