-- ═══════════════════════════════════════════════════════════════
-- Migration 159: TDS (Tax Deducted at Source) explicit tracking
--
-- Prior model: tds_retenu (NUMERIC) detected via heuristic 2-6%, which misses
-- the 10% / 15% professional-services rates common in Mauritius, and doesn't
-- record WHICH TDS rate was applied — which is required for the monthly
-- MRA return (TDS Return) and the 447 ledger reconciliation.
--
-- This migration introduces:
--   • tds_code       — a textual code such as 'TDS_3', 'TDS_5', 'TDS_10',
--                      'TDS_15', 'TDS_EXEMPT'. Free-form to match the rules
--                      engine (see classification_rules).
--   • tds_compte     — the PCG account used to book the withholding
--                      (default '447' — Retenues à la source).
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='factures') THEN

    ALTER TABLE public.factures
      ADD COLUMN IF NOT EXISTS tds_code   TEXT,
      ADD COLUMN IF NOT EXISTS tds_compte TEXT DEFAULT '447';

    COMMENT ON COLUMN public.factures.tds_code   IS 'TDS withholding code (TDS_3, TDS_5, TDS_10, TDS_15, TDS_EXEMPT). NULL when no TDS applies.';
    COMMENT ON COLUMN public.factures.tds_compte IS 'PCG account used to book the TDS withholding (default 447 — Retenues à la source).';

    CREATE INDEX IF NOT EXISTS idx_factures_tds_code
      ON public.factures(societe_id, tds_code)
      WHERE tds_code IS NOT NULL;
  END IF;
END $$;

-- Seed a tiers-level TDS default table. Lets a comptable configure
-- "this supplier is always withheld at 5%", so that the auto-matcher
-- applies the right rate even when the heuristic would fail.
CREATE TABLE IF NOT EXISTS public.tiers_tds_defaults (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers         TEXT NOT NULL,
  tds_code      TEXT NOT NULL,
  tds_rate_pct  NUMERIC(5,2) NOT NULL,
  tds_compte    TEXT NOT NULL DEFAULT '447',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, tiers)
);

CREATE INDEX IF NOT EXISTS idx_tiers_tds_defaults_societe
  ON public.tiers_tds_defaults(societe_id);

ALTER TABLE public.tiers_tds_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiers_tds_defaults_tenant_select ON public.tiers_tds_defaults;
DROP POLICY IF EXISTS tiers_tds_defaults_tenant_modify ON public.tiers_tds_defaults;

CREATE POLICY tiers_tds_defaults_tenant_select ON public.tiers_tds_defaults
  FOR SELECT
  USING (
    societe_id IS NULL
    OR (
      auth.uid() IS NOT NULL
      AND societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
        UNION
        SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
      )
    )
  );

CREATE POLICY tiers_tds_defaults_tenant_modify ON public.tiers_tds_defaults
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 159: factures.tds_code + tiers_tds_defaults table ready.';
END $$;
