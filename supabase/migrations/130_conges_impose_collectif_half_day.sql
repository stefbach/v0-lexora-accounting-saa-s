-- ============================================================================
-- Migration 130 — Congés: impose par société, congés collectifs, demi-journée
-- ============================================================================
--
-- Context: these schema changes were already applied manually to the
-- production database (Supabase) ahead of code being written. This file
-- realigns the repo with prod and is fully idempotent — safe to run on any
-- environment (prod no-ops, preview/dev gets the schema bootstrapped).
--
-- Enables the following features in the Lexora RH Congés & Paie audit:
--   - Fix 3: split AL into al_impose_societe vs al_impose_employe
--   - Feature 1: demi-journée (already had the columns on demandes_conges;
--                adds the per-employee/type "allowed" toggle)
--   - Feature 2: congés collectifs imposés (new table + FK on demandes)
--   - Feature 3: paramétrage "imposable par la société" par type de congé
--
-- Nothing here DROPs anything, and every ADD uses IF NOT EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. demandes_conges — flag when the leave is imposed by the company and
--    link to the parent conges_collectifs row that triggered it (nullable).
-- ----------------------------------------------------------------------------
ALTER TABLE public.demandes_conges
  ADD COLUMN IF NOT EXISTS impose_par_societe BOOLEAN DEFAULT false;

ALTER TABLE public.demandes_conges
  ADD COLUMN IF NOT EXISTS conge_collectif_id UUID;

-- ----------------------------------------------------------------------------
-- 2. soldes_conges — split AL consumption between days imposed BY THE COMPANY
--    (e.g. forced year-end shutdown) and days chosen BY THE EMPLOYEE.
--    al_pris continues to hold the total (al_impose_societe + al_impose_employe
--    should equal al_pris).
-- ----------------------------------------------------------------------------
ALTER TABLE public.soldes_conges
  ADD COLUMN IF NOT EXISTS al_impose_societe DECIMAL(5,2) DEFAULT 0;

ALTER TABLE public.soldes_conges
  ADD COLUMN IF NOT EXISTS al_impose_employe DECIMAL(5,2) DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3. conges_employes — per-employee/per-year/per-type config flags:
--    - demi_journee_autorisee: whether this type of leave can be taken as a
--      half day (AM/PM) for this employee (default true for AL, false otherwise)
--    - imposable_par_societe: whether the company is allowed to impose this
--      type of leave on the employee (default true for AL, false otherwise)
-- ----------------------------------------------------------------------------
ALTER TABLE public.conges_employes
  ADD COLUMN IF NOT EXISTS demi_journee_autorisee BOOLEAN DEFAULT true;

ALTER TABLE public.conges_employes
  ADD COLUMN IF NOT EXISTS imposable_par_societe BOOLEAN DEFAULT false;

-- ----------------------------------------------------------------------------
-- 4. conges_collectifs — a company-initiated leave period that is then
--    replicated across a set of employees via demandes_conges rows with
--    impose_par_societe=true and conge_collectif_id=<id>.
--    applique_a: 'all' (entire societe) | 'groupe' (single group) |
--                'liste' (explicit employee list, stored in membres JSONB).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conges_collectifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  titre VARCHAR(200) NOT NULL,
  type_conge VARCHAR(30) NOT NULL DEFAULT 'AL',
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  applique_a VARCHAR(20) NOT NULL DEFAULT 'all',
  groupe_id UUID REFERENCES public.groupes_employes(id) ON DELETE SET NULL,
  membres JSONB,
  motif TEXT,
  nb_employes_concernes INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now that the table exists, add the FK from demandes_conges to it.
-- Using DO block so the FK creation is itself idempotent (ALTER TABLE ADD
-- CONSTRAINT has no IF NOT EXISTS before PG 18).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demandes_conges_conge_collectif_fk'
  ) THEN
    ALTER TABLE public.demandes_conges
      ADD CONSTRAINT demandes_conges_conge_collectif_fk
      FOREIGN KEY (conge_collectif_id)
      REFERENCES public.conges_collectifs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_demandes_conges_collectif
  ON public.demandes_conges(conge_collectif_id)
  WHERE conge_collectif_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demandes_conges_impose
  ON public.demandes_conges(impose_par_societe)
  WHERE impose_par_societe = true;

CREATE INDEX IF NOT EXISTS idx_conges_collectifs_societe_periode
  ON public.conges_collectifs(societe_id, date_debut, date_fin);

-- ----------------------------------------------------------------------------
-- RLS — mirror the existing policy scheme: any authenticated user can access;
-- row-level tenant isolation is enforced at API layer.
-- ----------------------------------------------------------------------------
ALTER TABLE public.conges_collectifs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conges_collectifs'
      AND policyname = 'conges_collectifs_auth'
  ) THEN
    CREATE POLICY conges_collectifs_auth ON public.conges_collectifs
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Documentation comments (help future maintainers + Supabase schema view)
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.demandes_conges.impose_par_societe IS
  'True when the leave was imposed by the company (e.g. collective shutdown). The employee did not choose it.';
COMMENT ON COLUMN public.demandes_conges.conge_collectif_id IS
  'Set when this demande was auto-created from a conges_collectifs row.';
COMMENT ON COLUMN public.soldes_conges.al_impose_societe IS
  'Subset of al_pris consumed by leave imposed by the company.';
COMMENT ON COLUMN public.soldes_conges.al_impose_employe IS
  'Subset of al_pris consumed by leave chosen by the employee. al_impose_societe + al_impose_employe = al_pris.';
COMMENT ON COLUMN public.conges_employes.demi_journee_autorisee IS
  'Whether this leave type allows half-day (½ AM or ½ PM) requests for this employee/year.';
COMMENT ON COLUMN public.conges_employes.imposable_par_societe IS
  'Whether the company is allowed to impose this leave type on the employee via a conges_collectifs row.';
COMMENT ON TABLE public.conges_collectifs IS
  'Company-imposed collective leave periods. One row fans out to N demandes_conges (one per targeted employee).';
