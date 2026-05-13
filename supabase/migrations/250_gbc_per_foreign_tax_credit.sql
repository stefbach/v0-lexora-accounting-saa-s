-- ============================================================================
-- Migration 250 — Phase B GBC : Partial Exemption Regime (PER) + Foreign Tax Credit
-- ============================================================================
-- Income Tax Act 1995 §50C — 80% exemption pour revenus qualifiants des GBC.
-- Income Tax Act 1995 §77   — Foreign Tax Credit (crédit d'impôt étranger).
--
-- Effet : IS effectif = 15% × 20% = 3% sur revenu PER-éligible, vs 15% standard.
-- ============================================================================

-- ── 1. Catégories PER-éligibles (référentiel) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbc_per_categories (
  code           TEXT PRIMARY KEY,
  libelle        TEXT NOT NULL,
  description    TEXT,
  exemption_pct  NUMERIC(5,2) NOT NULL DEFAULT 80.0,  -- 80% par défaut
  substance_required BOOLEAN NOT NULL DEFAULT TRUE,
  legal_ref      TEXT
);
INSERT INTO public.gbc_per_categories (code, libelle, exemption_pct, legal_ref) VALUES
  ('foreign_dividends',  'Dividendes étrangers',                                80.0, 'ITA §50C(1)(a)'),
  ('foreign_interest',   'Intérêts de source étrangère',                       80.0, 'ITA §50C(1)(b)'),
  ('foreign_pe_profits', 'Profits attribuables à une PE étrangère',            80.0, 'ITA §50C(1)(c)'),
  ('foreign_royalties',  'Redevances IP holding (source étrangère)',            80.0, 'ITA §50C(1)(d)'),
  ('ship_aircraft',      'Profits sur navires/aéronefs (international)',        80.0, 'ITA §50C(1)(e)'),
  ('cis_reinsurance',    'Collective Investment Schemes / Reinsurance',         80.0, 'ITA §50C(1)(f)'),
  ('not_eligible',       'Non éligible PER — impôt 15% standard',                0.0, 'ITA §44A')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, exemption_pct = EXCLUDED.exemption_pct, legal_ref = EXCLUDED.legal_ref;

-- ── 2. Tag PER sur les lignes de revenu (factures + écritures) ─────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factures' AND column_name='per_category') THEN
    ALTER TABLE public.factures
      ADD COLUMN per_category TEXT REFERENCES public.gbc_per_categories(code) DEFAULT 'not_eligible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecritures_comptables_v2' AND column_name='per_category') THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN per_category TEXT REFERENCES public.gbc_per_categories(code);
  END IF;
END $$;

-- ── 3. Foreign Tax Credit (FTC) tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbc_foreign_tax_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice        TEXT NOT NULL,
  source_country  TEXT NOT NULL,          -- ISO 3166-1 alpha-2 (FR, ZA, IN, etc.)
  income_type     TEXT NOT NULL,          -- 'dividends' | 'interest' | 'royalties' | 'business_profits'
  foreign_income_mur  NUMERIC(15,2) NOT NULL,
  foreign_tax_paid_mur NUMERIC(15,2) NOT NULL,
  treaty_rate_pct NUMERIC(5,2),           -- taux conventionnel max si DTA existe
  ftc_applied_mur NUMERIC(15,2),          -- limité par le min(impôt étranger, impôt Maurice sur ce revenu)
  document_id     UUID REFERENCES public.documents(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gbc_ftc_societe ON public.gbc_foreign_tax_credits(societe_id, exercice);
ALTER TABLE public.gbc_foreign_tax_credits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gbc_foreign_tax_credits' AND policyname='ftc_tenant_select') THEN
    CREATE POLICY ftc_tenant_select ON public.gbc_foreign_tax_credits
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ftc_tenant_modify ON public.gbc_foreign_tax_credits
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 4. Comptes PCM ajoutés ─────────────────────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, niveau) VALUES
  ('695',  'Impôt sur bénéfices PER (3%)',           'charge', 'D', 3),
  ('6951', 'Foreign Tax Credit appliqué',             'charge', 'C', 4)
ON CONFLICT (compte) DO UPDATE SET libelle = EXCLUDED.libelle;

-- ── 5. RPC : calcul tax liability avec PER + FTC ───────────────────────────
CREATE OR REPLACE FUNCTION public.gbc_compute_tax_liability(
  p_societe_id UUID,
  p_exercice   TEXT
) RETURNS TABLE (
  total_revenue_mur          NUMERIC,
  per_eligible_revenue_mur   NUMERIC,
  non_eligible_revenue_mur   NUMERIC,
  total_deductible_charges   NUMERIC,
  taxable_profit_eligible    NUMERIC,
  taxable_profit_non_eligible NUMERIC,
  tax_on_eligible_3pct       NUMERIC,
  tax_on_non_eligible_15pct  NUMERIC,
  ftc_applied                NUMERIC,
  net_tax_liability_mur      NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
BEGIN
  -- Parse exercice "YYYY-YYYY" → dates Maurice (juillet→juin)
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  WITH revenue_split AS (
    SELECT
      SUM(CASE WHEN c.compte LIKE '7%' THEN COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0) ELSE 0 END) AS total_rev,
      SUM(CASE WHEN c.compte LIKE '7%' AND e.per_category IS NOT NULL
                AND e.per_category <> 'not_eligible'
               THEN (COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0)) * (cat.exemption_pct / 100.0)
               ELSE 0 END) AS per_exempt_portion,
      SUM(CASE WHEN c.compte LIKE '7%' AND (e.per_category IS NULL OR e.per_category = 'not_eligible')
               THEN COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0)
               ELSE 0 END) AS non_eligible_rev,
      SUM(CASE WHEN c.compte LIKE '6%' AND c.compte NOT LIKE '695%'
               THEN COALESCE(e.debit_mur,0) - COALESCE(e.credit_mur,0)
               ELSE 0 END) AS charges
    FROM public.ecritures_comptables_v2 e
    LEFT JOIN public.plan_comptable c ON c.compte = e.numero_compte
    LEFT JOIN public.gbc_per_categories cat ON cat.code = e.per_category
    WHERE e.societe_id = p_societe_id
      AND e.date_ecriture BETWEEN v_date_debut AND v_date_fin
  ),
  ftc AS (
    SELECT COALESCE(SUM(ftc_applied_mur), 0) AS total_ftc
      FROM public.gbc_foreign_tax_credits
     WHERE societe_id = p_societe_id AND exercice = p_exercice
  )
  SELECT
    rs.total_rev,
    rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion AS per_eligible_taxable,
    rs.non_eligible_rev,
    rs.charges,
    -- Profit imposable PER-éligible (après exemption 80%, donc 20% imposable)
    GREATEST(0, (rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) - 0) AS prof_eligible,
    GREATEST(0, rs.non_eligible_rev - rs.charges) AS prof_non_eligible,
    -- IS sur la portion PER : 15% × 20% = 3% (déjà reflété par le 0.20 dans rs.per_exempt_portion)
    ROUND((rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) * 0.15, 2) AS tax_per,
    ROUND(GREATEST(0, rs.non_eligible_rev - rs.charges) * 0.15, 2) AS tax_non_eligible,
    ftc.total_ftc,
    ROUND(
      GREATEST(0,
        (rs.total_rev - rs.non_eligible_rev - rs.per_exempt_portion) * 0.15
        + GREATEST(0, rs.non_eligible_rev - rs.charges) * 0.15
        - ftc.total_ftc
      ), 2) AS net_tax
  FROM revenue_split rs, ftc;
END;
$$;

COMMENT ON FUNCTION public.gbc_compute_tax_liability IS
  'Calcule l''IS d''une GBC en distinguant revenu PER-éligible (taxé à 3% effectif) '
  'du revenu standard (15%), avec FTC appliqué. Source ITA §50C + §77.';

DO $$ BEGIN
  RAISE NOTICE '✓ Migration 250 — Phase B GBC : PER + Foreign Tax Credit en place';
END $$;
