-- ============================================================================
-- Migration 251 — Phase C GBC : Substance tracking (CIGA)
-- ============================================================================
-- ITA §73A + FSC Guidelines : pour bénéficier du PER, une GBC doit prouver :
--   • Core Income Generating Activities (CIGA) réalisées à Maurice
--   • Min expenditure à Maurice (varie par activité)
--   • Employés qualifiés à Maurice
--   • Locaux physiques
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gbc_substance_requirements (
  activity_code  TEXT PRIMARY KEY,
  libelle        TEXT NOT NULL,
  min_expenditure_mur NUMERIC(15,2) NOT NULL,
  min_employees  INT NOT NULL DEFAULT 1,
  qualified_employees_required BOOLEAN NOT NULL DEFAULT TRUE,
  description    TEXT
);
INSERT INTO public.gbc_substance_requirements (activity_code, libelle, min_expenditure_mur, min_employees, description) VALUES
  ('investment_holding', 'Investment holding',                                   4800000, 1, 'Holdings d''investissement / SPV'),
  ('headquartering',     'Headquartering',                                       8500000, 3, 'Sociétés de tête'),
  ('fund_management',    'Fund management',                                      10000000, 2, 'Gestion de fonds — Investment Managers'),
  ('shipping',           'Shipping / maritime',                                  5000000, 2, 'Transport maritime international'),
  ('aircraft_leasing',   'Aircraft leasing',                                     5000000, 2, 'Location d''aéronefs'),
  ('ict_ip_holding',     'ICT / IP holding',                                     6000000, 2, 'Détention propriété intellectuelle / ICT'),
  ('financial_services', 'Financial services',                                   5000000, 2, 'Services financiers et bancaires'),
  ('insurance',          'Insurance / reinsurance',                              5000000, 2, 'Assurance / réassurance'),
  ('professional',       'Professional services (consulting, legal, accounting)', 600000, 1, 'Services professionnels'),
  ('trading',            'International trading',                                 600000, 1, 'Négoce international'),
  ('other',              'Autres activités',                                      600000, 1, 'Catégorie générique')
ON CONFLICT (activity_code) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      min_expenditure_mur = EXCLUDED.min_expenditure_mur,
      min_employees = EXCLUDED.min_employees,
      description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.gbc_substance_tracking (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice                 TEXT NOT NULL,
  activity_code            TEXT NOT NULL REFERENCES public.gbc_substance_requirements(activity_code),
  -- Mesures réelles
  actual_expenditure_mur   NUMERIC(15,2) DEFAULT 0,
  actual_employees         INT DEFAULT 0,
  qualified_employees      INT DEFAULT 0,
  premises_address         TEXT,
  premises_verified        BOOLEAN DEFAULT FALSE,
  -- CIGA réalisées à Maurice (JSON : meetings, decisions, etc.)
  ciga_activities          JSONB DEFAULT '[]'::JSONB,
  -- Statut
  compliance_status        TEXT NOT NULL DEFAULT 'pending'
                           CHECK (compliance_status IN ('compliant','at_risk','non_compliant','pending')),
  last_assessed_at         TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, exercice)
);
CREATE INDEX IF NOT EXISTS idx_gbc_substance_societe ON public.gbc_substance_tracking(societe_id);
ALTER TABLE public.gbc_substance_tracking ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gbc_substance_tracking' AND policyname='subst_tenant_select') THEN
    CREATE POLICY subst_tenant_select ON public.gbc_substance_tracking
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY subst_tenant_modify ON public.gbc_substance_tracking
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- RPC : auto-évaluation à partir des données existantes
CREATE OR REPLACE FUNCTION public.gbc_assess_substance(p_societe_id UUID, p_exercice TEXT)
RETURNS TABLE (
  activity_code            TEXT,
  required_expenditure_mur NUMERIC,
  actual_expenditure_mur   NUMERIC,
  expenditure_compliant    BOOLEAN,
  required_employees       INT,
  actual_employees         INT,
  employees_compliant      BOOLEAN,
  overall_status           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
  v_activity   TEXT;
BEGIN
  v_date_debut := (substring(p_exercice from 1 for 4) || '-07-01')::DATE;
  v_date_fin   := (substring(p_exercice from 6 for 4) || '-06-30')::DATE;
  SELECT t.activity_code INTO v_activity FROM public.gbc_substance_tracking t
   WHERE t.societe_id = p_societe_id AND t.exercice = p_exercice;
  IF v_activity IS NULL THEN v_activity := 'other'; END IF;

  RETURN QUERY
  WITH req AS (SELECT * FROM public.gbc_substance_requirements WHERE activity_code = v_activity),
  actual_exp AS (
    SELECT COALESCE(SUM(e.debit_mur - e.credit_mur), 0) AS amt
      FROM public.ecritures_comptables_v2 e
     WHERE e.societe_id = p_societe_id
       AND e.date_ecriture BETWEEN v_date_debut AND v_date_fin
       AND e.numero_compte LIKE '6%'
       AND e.numero_compte NOT LIKE '66%'
       AND e.numero_compte NOT LIKE '68%'
  ),
  emp_count AS (
    SELECT COUNT(*) AS n FROM public.employes WHERE societe_id = p_societe_id AND COALESCE(actif, TRUE)
  )
  SELECT
    v_activity,
    req.min_expenditure_mur,
    actual_exp.amt,
    actual_exp.amt >= req.min_expenditure_mur,
    req.min_employees,
    emp_count.n::INT,
    emp_count.n >= req.min_employees,
    CASE
      WHEN actual_exp.amt >= req.min_expenditure_mur AND emp_count.n >= req.min_employees THEN 'compliant'
      WHEN actual_exp.amt >= req.min_expenditure_mur * 0.8 OR emp_count.n >= req.min_employees * 0.8 THEN 'at_risk'
      ELSE 'non_compliant'
    END
  FROM req, actual_exp, emp_count;
END;
$$;

DO $$ BEGIN RAISE NOTICE '✓ Migration 251 — Phase C GBC : Substance tracking (CIGA)'; END $$;
