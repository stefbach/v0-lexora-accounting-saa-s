-- ============================================================
-- LEXORA — Migration 023: IT Form 3 + Annual Allowance (Sprint 6)
-- Tables MRA : registre immobilisations FAR + déclaration IS
-- ============================================================

-- ============================================================
-- 1. ANNUAL ALLOWANCE (Fixed Asset Register MRA)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.annual_allowance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  exercice          TEXT NOT NULL,                       -- ex: FY2024-2025
  actif_description TEXT NOT NULL,
  categorie         TEXT NOT NULL CHECK (categorie IN (
    'commercial_premises',
    'motor_vehicles',
    'furniture_fittings',
    'computer_equipment',
    'other'
  )),
  fournisseur       TEXT,
  date_acquisition  DATE,
  taux_mra          NUMERIC(5,2) NOT NULL,               -- % MRA selon catégorie
  cout_01_07        NUMERIC(15,2) DEFAULT 0,             -- Coût au 1er juillet
  twdv_01_07        NUMERIC(15,2) DEFAULT 0,             -- TWDV au 1er juillet
  additions         NUMERIC(15,2) DEFAULT 0,             -- Acquisitions en cours d'année
  disposals_cost    NUMERIC(15,2) DEFAULT 0,             -- Cessions (coût)
  disposals_twdv    NUMERIC(15,2) DEFAULT 0,             -- Cessions (TWDV)
  cout_30_06        NUMERIC(15,2) GENERATED ALWAYS AS    -- Coût au 30 juin (calculé)
    (cout_01_07 + additions - disposals_cost) STORED,
  twdv_adjusted     NUMERIC(15,2) DEFAULT 0,             -- TWDV ajustée (après cessions)
  annual_allowance  NUMERIC(15,2) DEFAULT 0,             -- Dotation calculée
  twdv_30_06        NUMERIC(15,2) DEFAULT 0,             -- TWDV résiduelle au 30 juin
  fully_expensed    BOOLEAN DEFAULT false,               -- Actif < 60k MUR → 100%
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aa_societe    ON public.annual_allowance(societe_id);
CREATE INDEX IF NOT EXISTS idx_aa_exercice   ON public.annual_allowance(exercice);
CREATE INDEX IF NOT EXISTS idx_aa_categorie  ON public.annual_allowance(categorie);

ALTER TABLE public.annual_allowance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage annual_allowance" ON public.annual_allowance FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables manage annual_allowance" ON public.annual_allowance FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 2. IT FORM 3 (Déclaration IS Mauritius)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.it_form3 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  exercice              TEXT NOT NULL,                   -- ex: FY2024-2025
  annee_assessment      TEXT,                           -- ex: 2025
  -- REVENUS (Schedule A-D)
  revenu_affaires       NUMERIC(15,2) DEFAULT 0,        -- Schedule A
  revenu_emploi         NUMERIC(15,2) DEFAULT 0,        -- Schedule B
  revenu_locatif        NUMERIC(15,2) DEFAULT 0,        -- Schedule C
  revenu_interets       NUMERIC(15,2) DEFAULT 0,        -- Schedule D
  dividendes            NUMERIC(15,2) DEFAULT 0,
  autres_revenus        NUMERIC(15,2) DEFAULT 0,
  total_revenus         NUMERIC(15,2) DEFAULT 0,
  -- DÉDUCTIONS
  annual_allowance_total NUMERIC(15,2) DEFAULT 0,       -- Import de annual_allowance
  autres_deductions      NUMERIC(15,2) DEFAULT 0,
  total_deductions       NUMERIC(15,2) DEFAULT 0,
  -- IMPÔT
  revenu_imposable       NUMERIC(15,2) DEFAULT 0,
  taux_is                NUMERIC(5,2) DEFAULT 15,       -- 15% standard
  impot_calcule          NUMERIC(15,2) DEFAULT 0,
  -- APS (Advance Payment System) si CA > 10M MUR
  aps_applicable         BOOLEAN DEFAULT false,
  aps_q1                 NUMERIC(15,2) DEFAULT 0,       -- Août
  aps_q2                 NUMERIC(15,2) DEFAULT 0,       -- Novembre
  aps_q3                 NUMERIC(15,2) DEFAULT 0,       -- Février
  total_aps_paye         NUMERIC(15,2) DEFAULT 0,
  impot_solde            NUMERIC(15,2) DEFAULT 0,       -- Impôt - APS payés
  -- CSR (Corporate Social Responsibility) si profit > 10M MUR
  csr_applicable         BOOLEAN DEFAULT false,
  csr_2pct               NUMERIC(15,2) DEFAULT 0,       -- 2% du profit net
  -- STATUT
  statut                 TEXT DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'calcule', 'soumis', 'paye')),
  date_soumission        DATE,
  reference_mra          TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, exercice)
);

CREATE INDEX IF NOT EXISTS idx_itform3_societe   ON public.it_form3(societe_id);
CREATE INDEX IF NOT EXISTS idx_itform3_exercice  ON public.it_form3(exercice);
CREATE INDEX IF NOT EXISTS idx_itform3_statut    ON public.it_form3(statut);

ALTER TABLE public.it_form3 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage it_form3" ON public.it_form3 FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables manage it_form3" ON public.it_form3 FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_it_form3()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_it_form3_updated_at ON public.it_form3;
CREATE TRIGGER trig_it_form3_updated_at
  BEFORE UPDATE ON public.it_form3
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_it_form3();
