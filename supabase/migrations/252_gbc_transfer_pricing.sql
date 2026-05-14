-- ============================================================================
-- Migration 252 — Phase D GBC : Transfer Pricing documentation
-- ============================================================================
-- Maurice TP Act 2023 — documentation obligatoire pour transactions
-- intragroupe. Pénalité : 10% + ajustement fiscal si non-conforme.
-- ============================================================================

-- Tag related party sur les tiers (employes / factures.tiers)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factures' AND column_name='related_party') THEN
    ALTER TABLE public.factures
      ADD COLUMN related_party BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN related_party_type TEXT;  -- 'parent' | 'subsidiary' | 'sister' | 'common_control' | 'key_management'
  END IF;
END $$;

-- Local File : enregistrement détaillé par transaction intragroupe > 5M MUR
CREATE TABLE IF NOT EXISTS public.tp_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice              TEXT NOT NULL,
  related_party_name    TEXT NOT NULL,
  related_party_country TEXT,                       -- ISO 3166-1
  relationship_type     TEXT NOT NULL,              -- parent / subsidiary / sister / common_control / key_management
  transaction_type      TEXT NOT NULL,              -- goods / services / royalties / interest / financing / cost_sharing
  amount_mur            NUMERIC(15,2) NOT NULL,
  tp_method             TEXT,                       -- CUP / RPM / CPM / TNMM / PSM
  arm_length_range_low  NUMERIC(15,2),
  arm_length_range_high NUMERIC(15,2),
  benchmarking_source   TEXT,                       -- ex: 'Orbis 2024', 'Manual analysis', 'Comparable agreement'
  is_within_range       BOOLEAN,                    -- TRUE si le prix est dans la fourchette arm's length
  rationale             TEXT,
  document_id           UUID REFERENCES public.documents(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tp_tx_societe ON public.tp_transactions(societe_id, exercice);
ALTER TABLE public.tp_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tp_transactions' AND policyname='tp_tx_tenant_select') THEN
    CREATE POLICY tp_tx_tenant_select ON public.tp_transactions
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tp_tx_tenant_modify ON public.tp_transactions
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Master File : description du groupe (un seul record par groupe / société)
CREATE TABLE IF NOT EXISTS public.tp_master_file (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id             UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice               TEXT NOT NULL,
  group_structure        TEXT,                  -- Description textuelle ou JSONB (organigramme)
  business_overview      TEXT,
  intangibles_description TEXT,
  financing_strategy     TEXT,
  financial_position     TEXT,
  consolidated_revenue_mur NUMERIC(15,2),       -- pour seuil CbCR € 750M
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
ALTER TABLE public.tp_master_file ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tp_master_file' AND policyname='tp_mf_tenant_select') THEN
    CREATE POLICY tp_mf_tenant_select ON public.tp_master_file
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tp_mf_tenant_modify ON public.tp_master_file
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- Vue : transactions intragroupe au-dessus du seuil MUR 5M
CREATE OR REPLACE VIEW public.vw_tp_threshold_transactions AS
SELECT
  societe_id, exercice, related_party_name, transaction_type,
  amount_mur, tp_method, is_within_range,
  CASE WHEN amount_mur >= 5000000 THEN 'documentation_required'
       WHEN amount_mur >= 1000000 THEN 'recommended'
       ELSE 'optional' END AS documentation_tier
FROM public.tp_transactions
WHERE amount_mur > 0
ORDER BY amount_mur DESC;

DO $$ BEGIN RAISE NOTICE '✓ Migration 252 — Phase D GBC : Transfer Pricing documentation'; END $$;
