-- ============================================================================
-- Migration 254 — Phase F GBC : Consolidation IFRS 10
-- ============================================================================
-- Pour holdings mauriciennes avec filiales étrangères : états consolidés
-- avec élimination intercompany, goodwill (IFRS 3), NCI, translation IAS 21.
-- ============================================================================

-- Relations parent-enfant entre sociétés
CREATE TABLE IF NOT EXISTS public.societes_relationships (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_societe_id        UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  child_societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  pct_detention            NUMERIC(5,2) NOT NULL CHECK (pct_detention BETWEEN 0 AND 100),
  pct_voting_rights        NUMERIC(5,2),
  relationship_type        TEXT NOT NULL CHECK (relationship_type IN ('subsidiary','associate','joint_venture')),
  acquisition_date         DATE NOT NULL,
  acquisition_cost_mur     NUMERIC(15,2),
  fair_value_net_assets_acquisition_mur NUMERIC(15,2),  -- pour calcul goodwill
  goodwill_mur             NUMERIC(15,2),                -- IFRS 3 : Cost - FV net assets × pct
  effective_from           DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to             DATE,
  consolidation_method     TEXT NOT NULL DEFAULT 'full' CHECK (consolidation_method IN ('full','equity','proportional')),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  CHECK (parent_societe_id <> child_societe_id),
  UNIQUE (parent_societe_id, child_societe_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_soc_rel_parent ON public.societes_relationships(parent_societe_id);
CREATE INDEX IF NOT EXISTS idx_soc_rel_child  ON public.societes_relationships(child_societe_id);
ALTER TABLE public.societes_relationships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='societes_relationships' AND policyname='rel_tenant_select') THEN
    CREATE POLICY rel_tenant_select ON public.societes_relationships
      FOR SELECT USING (public.user_has_societe_access(parent_societe_id) OR public.user_has_societe_access(child_societe_id));
    CREATE POLICY rel_tenant_modify ON public.societes_relationships
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id));
  END IF;
END $$;

-- Éliminations intercompany à appliquer lors de la consolidation
CREATE TABLE IF NOT EXISTS public.consolidation_eliminations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice            TEXT NOT NULL,
  elimination_type    TEXT NOT NULL CHECK (elimination_type IN (
    'intra_revenue', 'intra_cogs', 'intra_loan',
    'intra_dividend', 'intra_ar_ap', 'goodwill_amortization',
    'unrealized_profit_stock', 'fair_value_adjustment'
  )),
  from_societe_id     UUID REFERENCES public.societes(id),
  to_societe_id       UUID REFERENCES public.societes(id),
  amount_mur          NUMERIC(15,2) NOT NULL,
  description         TEXT,
  source_ecriture_ids UUID[],         -- références audit
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cons_elim_parent ON public.consolidation_eliminations(parent_societe_id, exercice);
ALTER TABLE public.consolidation_eliminations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consolidation_eliminations' AND policyname='cons_elim_tenant_select') THEN
    CREATE POLICY cons_elim_tenant_select ON public.consolidation_eliminations
      FOR SELECT USING (public.user_has_societe_access(parent_societe_id));
    CREATE POLICY cons_elim_tenant_modify ON public.consolidation_eliminations
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id));
  END IF;
END $$;

-- RPC : agrégation consolidée brut (avant éliminations)
CREATE OR REPLACE FUNCTION public.consolidate_aggregate(
  p_parent_societe_id UUID,
  p_exercice TEXT
) RETURNS TABLE (
  numero_compte TEXT,
  total_debit_mur NUMERIC,
  total_credit_mur NUMERIC,
  contributing_societes UUID[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
BEGIN
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  WITH scope AS (
    SELECT p_parent_societe_id AS sid
    UNION
    SELECT child_societe_id FROM public.societes_relationships
     WHERE parent_societe_id = p_parent_societe_id
       AND effective_to IS NULL
       AND consolidation_method = 'full'
  )
  SELECT
    e.numero_compte,
    SUM(COALESCE(e.debit_mur, 0))  AS total_debit_mur,
    SUM(COALESCE(e.credit_mur, 0)) AS total_credit_mur,
    ARRAY_AGG(DISTINCT e.societe_id) AS contributing_societes
  FROM public.ecritures_comptables_v2 e
  INNER JOIN scope s ON s.sid = e.societe_id
  WHERE e.date_ecriture BETWEEN v_date_debut AND v_date_fin
  GROUP BY e.numero_compte
  ORDER BY e.numero_compte;
END;
$$;

-- RPC : calcul NCI (Non-Controlling Interest)
CREATE OR REPLACE FUNCTION public.compute_nci(
  p_parent_societe_id UUID,
  p_exercice TEXT
) RETURNS TABLE (
  child_societe_id UUID,
  pct_nci NUMERIC,
  child_equity_mur NUMERIC,
  nci_share_mur NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_fin DATE;
BEGIN
  v_date_fin := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;

  RETURN QUERY
  SELECT
    r.child_societe_id,
    (100 - r.pct_detention) AS pct_nci,
    COALESCE(
      (SELECT SUM(COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0))
         FROM public.ecritures_comptables_v2 e
        WHERE e.societe_id = r.child_societe_id
          AND e.numero_compte LIKE '1%'
          AND e.numero_compte NOT LIKE '17%'
          AND e.numero_compte NOT LIKE '16%'
          AND e.date_ecriture <= v_date_fin
      ), 0) AS child_equity_mur,
    ROUND(
      COALESCE(
        (SELECT SUM(COALESCE(e.credit_mur,0) - COALESCE(e.debit_mur,0))
           FROM public.ecritures_comptables_v2 e
          WHERE e.societe_id = r.child_societe_id
            AND e.numero_compte LIKE '1%'
            AND e.numero_compte NOT LIKE '17%'
            AND e.numero_compte NOT LIKE '16%'
            AND e.date_ecriture <= v_date_fin
        ), 0) * (100 - r.pct_detention) / 100.0,
      2) AS nci_share_mur
  FROM public.societes_relationships r
  WHERE r.parent_societe_id = p_parent_societe_id
    AND r.effective_to IS NULL
    AND r.consolidation_method = 'full'
    AND r.pct_detention < 100;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 254 — Phase F GBC : Consolidation IFRS 10'; END $$;
