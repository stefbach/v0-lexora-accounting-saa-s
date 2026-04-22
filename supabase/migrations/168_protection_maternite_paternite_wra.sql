-- ============================================================
-- Migration 168 — Sprint WRA Compliance G7
--
-- Protection maternité / paternité WRA 2019 (Sections 52, 53, 64, 5(5)(aa)) :
--   - Tracking des grossesses déclarées et congés maternité
--   - Tracking des paternités et congés paternité (4 semaines)
--   - Allocation naissance 3 000 MUR (forfait social non-imposable)
--   - Protection absolue contre licenciement pendant grossesse/congé
--
-- POLICY LEXORA : Déclaration réservée aux RH/admins (pas par l'employée
-- elle-même). RLS en lecture pour que l'employée voie son propre dossier
-- read-only uniquement.
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS avant
-- CREATE POLICY, CREATE OR REPLACE FUNCTION.
-- ============================================================

-- ─── 1. Table grossesses_employees ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grossesses_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,

  date_declaration DATE NOT NULL DEFAULT CURRENT_DATE,
  date_presume_accouchement DATE NOT NULL,
  date_reelle_accouchement DATE,
  grossesse_multiple BOOLEAN DEFAULT FALSE,
  nb_enfants_attendus INTEGER DEFAULT 1,
  naissance_prematuree BOOLEAN DEFAULT FALSE,
  mortinaissance BOOLEAN DEFAULT FALSE,

  -- Adoption (même durée de congé)
  est_adoption BOOLEAN DEFAULT FALSE,
  date_adoption DATE,

  statut TEXT NOT NULL DEFAULT 'declaree'
    CHECK (statut IN ('declaree', 'conge_en_cours', 'retour_effectue', 'annulee')),

  -- Dates du congé maternité (calculées auto côté appli)
  conge_mat_debut DATE,
  conge_mat_fin DATE,

  -- Allocation naissance 3 000 MUR
  allocation_naissance_montant NUMERIC DEFAULT 3000,
  allocation_naissance_payee BOOLEAN DEFAULT FALSE,
  allocation_naissance_bulletin_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  allocation_naissance_paye_le TIMESTAMPTZ,

  certificat_medical_url TEXT,
  commentaire TEXT,
  motif_annulation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.grossesses_employees IS
  'WRA S.52 + S.64 — Suivi grossesses et congés maternité. Sert à déclencher allocation 3 000 MUR + bloquer licenciement. RH/admin uniquement pour INSERT/UPDATE/DELETE.';

CREATE INDEX IF NOT EXISTS idx_grossesses_employe ON public.grossesses_employees(employe_id);
CREATE INDEX IF NOT EXISTS idx_grossesses_statut ON public.grossesses_employees(statut);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grossesses_unique_en_cours
  ON public.grossesses_employees(employe_id)
  WHERE statut IN ('declaree', 'conge_en_cours');

-- RLS grossesses
ALTER TABLE public.grossesses_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grossesses_select_self ON public.grossesses_employees;
DROP POLICY IF EXISTS grossesses_select_rh ON public.grossesses_employees;
DROP POLICY IF EXISTS grossesses_write_rh ON public.grossesses_employees;

-- L'employée concernée peut LIRE son propre dossier (confidentialité RGPD/WRA)
CREATE POLICY grossesses_select_self ON public.grossesses_employees
  FOR SELECT TO authenticated
  USING (
    employe_id IN (SELECT id FROM public.employes WHERE auth_user_id = auth.uid())
  );

-- Le RH voit toutes les grossesses (multi-tenant géré par accès société dans l'API)
CREATE POLICY grossesses_select_rh ON public.grossesses_employees
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  );

-- Seuls RH/admins peuvent INSERT/UPDATE/DELETE
CREATE POLICY grossesses_write_rh ON public.grossesses_employees
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  );

-- ─── 2. Table paternites_employees ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paternites_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,

  date_declaration DATE NOT NULL DEFAULT CURRENT_DATE,
  date_naissance_enfant DATE NOT NULL,
  conge_pat_debut DATE,
  conge_pat_fin DATE,
  conge_paye BOOLEAN DEFAULT TRUE,

  statut TEXT NOT NULL DEFAULT 'declaree'
    CHECK (statut IN ('declaree', 'conge_en_cours', 'retour_effectue', 'annulee')),

  acte_naissance_url TEXT,
  commentaire TEXT,
  motif_annulation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.paternites_employees IS
  'WRA S.53 — Suivi paternités et congés paternité (4 semaines). Payé si employé a 12 mois de service continu, non payé sinon. RH/admin uniquement pour INSERT/UPDATE/DELETE.';

CREATE INDEX IF NOT EXISTS idx_paternites_employe ON public.paternites_employees(employe_id);

ALTER TABLE public.paternites_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paternites_select_self ON public.paternites_employees;
DROP POLICY IF EXISTS paternites_select_rh ON public.paternites_employees;
DROP POLICY IF EXISTS paternites_write_rh ON public.paternites_employees;

CREATE POLICY paternites_select_self ON public.paternites_employees
  FOR SELECT TO authenticated
  USING (
    employe_id IN (SELECT id FROM public.employes WHERE auth_user_id = auth.uid())
  );

CREATE POLICY paternites_select_rh ON public.paternites_employees
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  );

CREATE POLICY paternites_write_rh ON public.paternites_employees
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('rh','rh_manager','admin','super_admin'))
  );

-- ─── 3. Colonne allocation_naissance sur bulletins_paie ──────────────
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS allocation_naissance NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.allocation_naissance IS
  'WRA S.52 — Allocation de naissance 3 000 MUR. Forfait social payé une fois à la naissance. NON soumis à CSG/NSF/PAYE (allocation sociale non-imposable).';

-- ─── 4. Fonction is_employe_protege_licenciement ─────────────────────
CREATE OR REPLACE FUNCTION public.is_employe_protege_licenciement(
  p_employe_id UUID,
  p_date_reference DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  est_protege BOOLEAN,
  motif TEXT,
  date_fin_protection DATE
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_grossesse RECORD;
BEGIN
  -- Protection active si :
  --   - Grossesse déclarée et date_reference <= date_presume_accouchement
  --   - Congé en cours et date_reference <= conge_mat_fin
  SELECT * INTO v_grossesse
  FROM public.grossesses_employees
  WHERE employe_id = p_employe_id
    AND statut IN ('declaree', 'conge_en_cours')
    AND (
      (statut = 'declaree' AND p_date_reference <= date_presume_accouchement)
      OR
      (statut = 'conge_en_cours' AND conge_mat_fin IS NOT NULL AND p_date_reference <= conge_mat_fin)
    )
  ORDER BY date_declaration DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      TRUE,
      (CASE
        WHEN v_grossesse.statut = 'declaree' THEN 'Grossesse déclarée (WRA S.64 + 5(5)(aa))'
        ELSE 'Congé maternité en cours (WRA S.52 + S.64)'
      END)::TEXT,
      COALESCE(v_grossesse.conge_mat_fin, (v_grossesse.date_presume_accouchement + INTERVAL '16 weeks')::DATE);
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, ''::TEXT, NULL::DATE;
END $fn$;

COMMENT ON FUNCTION public.is_employe_protege_licenciement(UUID, DATE) IS
  'WRA S.52/S.64/S.5(5)(aa) — Vérifie si un employé est protégé contre le licenciement à une date donnée. Utilisé par l''UI pour bloquer date_depart.';
