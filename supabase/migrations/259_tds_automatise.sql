-- ============================================================================
-- Migration 259 — Phase L.1 : TDS (Tax Deducted at Source) automatisé
-- Section 111A Income Tax Act 1995 + ITA Reg. 24
-- ============================================================================
-- Lexora calcule automatiquement la retenue TDS sur paiements fournisseurs
-- selon la catégorie, génère le mensuel CSV MRA + l'annuel statement.
-- ============================================================================

-- Ajout colonnes TDS sur factures (auto-calculées à la création)
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS tds_category    TEXT,                -- ex: 'professional_fees'
  ADD COLUMN IF NOT EXISTS tds_rate_pct    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tds_amount_mur  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_remitted    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tds_period      TEXT;                -- YYYY-MM (mois remise MRA)

CREATE INDEX IF NOT EXISTS idx_factures_tds_period ON public.factures(societe_id, tds_period) WHERE tds_amount_mur > 0;

-- Référentiel catégories TDS Maurice (étend mig 226)
CREATE TABLE IF NOT EXISTS public.tds_categories_mra (
  code           TEXT PRIMARY KEY,
  libelle        TEXT NOT NULL,
  taux_pct       NUMERIC(5,2) NOT NULL,
  threshold_mur  NUMERIC(15,2) DEFAULT 0,  -- montant minimum déclenchant TDS
  ita_ref        TEXT,
  description    TEXT
);
INSERT INTO public.tds_categories_mra (code, libelle, taux_pct, threshold_mur, ita_ref, description) VALUES
  ('rent',                  'Loyers',                                        5.0,  500,  'ITA §111A(a)', 'Loyer immobilier'),
  ('royalties',             'Redevances IP',                                15.0,  0,    'ITA §111A(b)', 'Redevances propriété intellectuelle'),
  ('management_fees',       'Honoraires management',                         5.0,  500,  'ITA §111A(c)', 'Management/consulting fees'),
  ('contract_payments',     'Paiements travaux/contrats',                    0.75, 500,  'ITA §111A(d)', 'Travaux BTP, services techniques'),
  ('professional_fees',     'Honoraires professionnels',                     3.0,  500,  'ITA §111A(e)', 'Avocats, comptables, médecins'),
  ('director_fees',         'Jetons de présence administrateurs',           15.0,  0,    'ITA §111A(f)', 'Fees board directors'),
  ('interest_non_resident', 'Intérêts payés à non-résident',                15.0,  0,    'ITA §111A(g)', 'Intérêts vers étranger'),
  ('payment_to_artist',     'Paiements artistes/sportifs',                  10.0,  0,    'ITA §111A(h)', 'Paiements artistes performance'),
  ('commission',            'Commissions',                                    3.0,  500,  'ITA §111A(i)', 'Commissions agents'),
  ('none',                  'Aucune retenue applicable',                      0.0,  0,    '—',            'Catégorie par défaut')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, taux_pct = EXCLUDED.taux_pct,
      threshold_mur = EXCLUDED.threshold_mur, description = EXCLUDED.description;

-- Déclarations TDS mensuelles MRA
CREATE TABLE IF NOT EXISTS public.tds_declarations_mensuelles_v2 (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode             TEXT NOT NULL,                            -- YYYY-MM
  nb_paiements        INT NOT NULL DEFAULT 0,
  total_paiements_mur NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_tds_mur       NUMERIC(15,2) NOT NULL DEFAULT 0,
  date_limite         DATE,                                     -- 20 du mois suivant
  date_declaration    DATE,
  date_paiement       DATE,
  statut              TEXT NOT NULL DEFAULT 'a_faire'
                      CHECK (statut IN ('a_faire','declare','paye','retard')),
  csv_export_url      TEXT,
  xml_export_url      TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, periode)
);
CREATE INDEX IF NOT EXISTS idx_tds_decl_societe ON public.tds_declarations_mensuelles_v2(societe_id, periode DESC);

ALTER TABLE public.tds_declarations_mensuelles_v2 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tds_declarations_mensuelles_v2' AND policyname='tds_decl_tenant_select') THEN
    CREATE POLICY tds_decl_tenant_select ON public.tds_declarations_mensuelles_v2
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tds_decl_tenant_modify ON public.tds_declarations_mensuelles_v2
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : calcul automatique du TDS mensuel depuis les factures
CREATE OR REPLACE FUNCTION public.tds_compute_monthly(
  p_societe_id UUID,
  p_periode TEXT  -- YYYY-MM
) RETURNS TABLE (
  total_paiements_mur NUMERIC,
  total_tds_mur       NUMERIC,
  nb_paiements        INT,
  date_limite         DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_year INT;
  v_month INT;
  v_period_start DATE;
  v_period_end   DATE;
  v_deadline     DATE;
BEGIN
  v_year  := substring(p_periode FROM 1 FOR 4)::INT;
  v_month := substring(p_periode FROM 6 FOR 2)::INT;
  v_period_start := make_date(v_year, v_month, 1);
  v_period_end   := (v_period_start + INTERVAL '1 month - 1 day')::DATE;
  -- Deadline MRA = 20 du mois suivant
  v_deadline := (v_period_start + INTERVAL '1 month 19 days')::DATE;

  RETURN QUERY
  SELECT
    COALESCE(SUM(f.montant_mur), 0)     AS total_paiements_mur,
    COALESCE(SUM(f.tds_amount_mur), 0)  AS total_tds_mur,
    COUNT(*)::INT                        AS nb_paiements,
    v_deadline                           AS date_limite
  FROM public.factures f
  WHERE f.societe_id = p_societe_id
    AND f.type_facture = 'fournisseur'
    AND f.tds_amount_mur > 0
    AND f.statut IN ('paye', 'partiel')
    AND f.date_facture BETWEEN v_period_start AND v_period_end;
END;
$$;

-- RPC : annual statement (sumaire TDS par catégorie + fournisseur)
CREATE OR REPLACE FUNCTION public.tds_annual_statement(
  p_societe_id UUID,
  p_year INT
) RETURNS TABLE (
  tiers           TEXT,
  tds_category    TEXT,
  category_libelle TEXT,
  total_paiements_mur NUMERIC,
  total_tds_mur   NUMERIC,
  nb_factures     INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.tiers,
    f.tds_category,
    COALESCE(cat.libelle, f.tds_category) AS category_libelle,
    SUM(f.montant_mur)::NUMERIC AS total_paiements_mur,
    SUM(f.tds_amount_mur)::NUMERIC AS total_tds_mur,
    COUNT(*)::INT AS nb_factures
  FROM public.factures f
  LEFT JOIN public.tds_categories_mra cat ON cat.code = f.tds_category
  WHERE f.societe_id = p_societe_id
    AND f.type_facture = 'fournisseur'
    AND f.tds_amount_mur > 0
    AND EXTRACT(YEAR FROM f.date_facture) = p_year
  GROUP BY f.tiers, f.tds_category, cat.libelle
  ORDER BY total_tds_mur DESC;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 259 — Phase L.1 : TDS automatisé'; END $$;
