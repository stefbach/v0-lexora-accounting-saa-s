-- ═══════════════════════════════════════════════════════════════
-- Migration 191 — G13.1 : Déclarations MRA mensuelles + PRGF exits
--
-- - Enrichit employes avec exemption PRGF (motif légal, certif FSC,
--   date début cotisation, past services).
-- - Crée compte 4285 "PRGF à payer à la MRA" (traçabilité future).
-- - Enrichit declarations_paye_mensuelle / declarations_csg_mensuelle
--   avec details_par_employe (JSONB), csv_mra_url, ern_employeur.
-- - Crée prgf_exit_statements + RLS admin/rh.
-- - RPC agreger_declarations_mra(societe, periode).
--
-- Note comptes : on NE CRÉE PAS 4421/4427 (non utilisés par le moteur
-- paie). Le paiement groupé MRA extourne les comptes effectivement
-- utilisés : 431 (CSG/NSF), 432 (Training+PRGF), 444 (PAYE).
-- Le compte 4285 reste créé pour traçabilité / split futur.
--
-- NE TOUCHE PAS : bulletins_paie, moteur calcul paie, écritures
-- existantes.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Éligibilité PRGF sur employes ──────────────────────────────
-- employes.inclus_prgf (BOOLEAN) existe déjà. On ajoute les métadonnées.
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS prgf_motif_exemption TEXT,
  ADD COLUMN IF NOT EXISTS prgf_pension_scheme_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS prgf_date_debut DATE,
  ADD COLUMN IF NOT EXISTS prgf_past_services_montant NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prgf_past_services_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prgf_past_services_date_paiement DATE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employes_prgf_motif_exemption_check') THEN
    ALTER TABLE public.employes
      ADD CONSTRAINT employes_prgf_motif_exemption_check
      CHECK (prgf_motif_exemption IS NULL OR prgf_motif_exemption IN (
        'salaire_au_dessus_200k', 'migrant_non_citoyen', 'sbpf', 'sipf',
        'private_pension_fsc', 'job_contractor', 'apprenti'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.employes.prgf_motif_exemption IS
  'G13 - Motif exemption PRGF (7 motifs légaux). NULL si cotisant.';

-- ─── 2. Compte passif 4285 PRGF à payer MRA ────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau, actif)
VALUES ('4285', 'PRGF à payer à la MRA', 'passif', 'C', '428', 4, TRUE)
ON CONFLICT (compte) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  type_compte = EXCLUDED.type_compte,
  sens_normal = EXCLUDED.sens_normal;

-- ─── 3. Enrichissement declarations_paye_mensuelle ─────────────────
ALTER TABLE public.declarations_paye_mensuelle
  ADD COLUMN IF NOT EXISTS details_par_employe JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS csv_mra_url TEXT,
  ADD COLUMN IF NOT EXISTS ern_employeur TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'declarations_paye_societe_periode_unique'
  ) THEN
    ALTER TABLE public.declarations_paye_mensuelle
      ADD CONSTRAINT declarations_paye_societe_periode_unique
      UNIQUE (societe_id, periode);
  END IF;
END $$;

-- ─── 4. Enrichissement declarations_csg_mensuelle ──────────────────
ALTER TABLE public.declarations_csg_mensuelle
  ADD COLUMN IF NOT EXISTS details_par_employe JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS csv_mra_url TEXT,
  ADD COLUMN IF NOT EXISTS ern_employeur TEXT,
  ADD COLUMN IF NOT EXISTS ecriture_paiement_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'declarations_csg_societe_periode_unique'
  ) THEN
    ALTER TABLE public.declarations_csg_mensuelle
      ADD CONSTRAINT declarations_csg_societe_periode_unique
      UNIQUE (societe_id, periode);
  END IF;
END $$;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION public.set_declarations_mra_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_paye_updated_at ON public.declarations_paye_mensuelle;
CREATE TRIGGER trg_paye_updated_at
  BEFORE UPDATE ON public.declarations_paye_mensuelle
  FOR EACH ROW EXECUTE FUNCTION public.set_declarations_mra_updated_at();

DROP TRIGGER IF EXISTS trg_csg_updated_at ON public.declarations_csg_mensuelle;
CREATE TRIGGER trg_csg_updated_at
  BEFORE UPDATE ON public.declarations_csg_mensuelle
  FOR EACH ROW EXECUTE FUNCTION public.set_declarations_mra_updated_at();

-- ─── 5. Table prgf_exit_statements ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prgf_exit_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  date_exit DATE NOT NULL,
  motif_exit TEXT NOT NULL,

  dernier_mois_remuneration NUMERIC NOT NULL DEFAULT 0,
  moyenne_12_mois NUMERIC NOT NULL DEFAULT 0,
  final_remuneration NUMERIC NOT NULL DEFAULT 0,

  gratuity_paid_mur NUMERIC DEFAULT 0,
  gratuity_date_paiement DATE,
  gratuity_return_submitted BOOLEAN DEFAULT FALSE,
  gratuity_return_date DATE,
  gratuity_return_deadline DATE,

  past_services_due_mur NUMERIC DEFAULT 0,
  past_services_settled BOOLEAN DEFAULT FALSE,
  past_services_date_paiement DATE,

  statut TEXT NOT NULL DEFAULT 'brouillon',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prgf_exit_motif_check') THEN
    ALTER TABLE public.prgf_exit_statements
      ADD CONSTRAINT prgf_exit_motif_check
      CHECK (motif_exit IN (
        'retraite', 'deces', 'demission', 'licenciement_justifie',
        'licenciement_non_justifie', 'fin_cdd', 'autre'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prgf_exit_statut_check') THEN
    ALTER TABLE public.prgf_exit_statements
      ADD CONSTRAINT prgf_exit_statut_check
      CHECK (statut IN ('brouillon', 'valide', 'soumis_mra', 'annule'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prgf_exit_employe
  ON public.prgf_exit_statements(employe_id);
CREATE INDEX IF NOT EXISTS idx_prgf_exit_societe_date
  ON public.prgf_exit_statements(societe_id, date_exit DESC);

DROP TRIGGER IF EXISTS trg_prgf_exit_updated_at ON public.prgf_exit_statements;
CREATE TRIGGER trg_prgf_exit_updated_at
  BEFORE UPDATE ON public.prgf_exit_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_declarations_mra_updated_at();

ALTER TABLE public.prgf_exit_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prgf_exits admin rh all" ON public.prgf_exit_statements;
CREATE POLICY "prgf_exits admin rh all"
  ON public.prgf_exit_statements
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'rh'))
  WITH CHECK (public.get_my_role() IN ('admin', 'rh'));

-- ─── 6. RPC agreger_declarations_mra ───────────────────────────────
CREATE OR REPLACE FUNCTION public.agreger_declarations_mra(
  p_societe_id UUID,
  p_periode DATE
) RETURNS TABLE (
  nb_employes INTEGER,
  masse_salariale NUMERIC,
  total_paye NUMERIC,
  total_csg_salarie NUMERIC,
  total_csg_patronal NUMERIC,
  total_nsf_salarie NUMERIC,
  total_nsf_patronal NUMERIC,
  total_training_levy NUMERIC,
  total_prgf NUMERIC,
  total_a_remettre_mra NUMERIC,
  nb_prgf_eligibles INTEGER,
  details JSONB
) LANGUAGE plpgsql STABLE AS $fn$
BEGIN
  RETURN QUERY
  WITH bulletins AS (
    SELECT
      b.employe_id,
      e.prenom, e.nom,
      COALESCE(e.nic_number, e.nic)      AS nic,
      COALESCE(e.tan_number, e.tan)       AS tan,
      COALESCE(e.inclus_prgf, TRUE)       AS prgf_eligible,
      e.prgf_motif_exemption,
      COALESCE(b.salaire_base, 0)         AS basic,
      COALESCE(b.salaire_brut, 0)         AS salaire_brut,
      COALESCE(b.heures_sup_montant, 0)   AS overtime,
      COALESCE(b.paye, 0)                 AS paye,
      COALESCE(b.csg_salarie, 0)          AS csg_salarie,
      COALESCE(b.csg_patronal, 0)         AS csg_patronal,
      COALESCE(b.nsf_salarie, 0)          AS nsf_salarie,
      COALESCE(b.nsf_patronal, 0)         AS nsf_patronal,
      COALESCE(b.training_levy, 0)        AS training_levy,
      COALESCE(b.prgf, 0)                 AS prgf_montant
    FROM public.bulletins_paie b
    JOIN public.employes e ON e.id = b.employe_id
    WHERE b.societe_id = p_societe_id
      AND DATE_TRUNC('month', b.periode)::DATE = DATE_TRUNC('month', p_periode)::DATE
      AND COALESCE(b.statut::TEXT, '') IN ('valide', 'comptabilise', 'paye')
      AND COALESCE(b.source, '') IN ('calcul', 'import_excel')
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(salaire_brut), 0),
    COALESCE(SUM(paye), 0),
    COALESCE(SUM(csg_salarie), 0),
    COALESCE(SUM(csg_patronal), 0),
    COALESCE(SUM(nsf_salarie), 0),
    COALESCE(SUM(nsf_patronal), 0),
    COALESCE(SUM(training_levy), 0),
    COALESCE(SUM(prgf_montant), 0),
    COALESCE(SUM(paye + csg_salarie + csg_patronal + nsf_salarie
                 + nsf_patronal + training_levy + prgf_montant), 0),
    COUNT(*) FILTER (WHERE prgf_eligible AND prgf_montant > 0)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'employe_id', employe_id,
          'nom', TRIM(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')),
          'nic', nic,
          'tan', tan,
          'basic', basic,
          'salaire_brut', salaire_brut,
          'overtime', overtime,
          'paye', paye,
          'csg_salarie', csg_salarie,
          'csg_patronal', csg_patronal,
          'nsf_salarie', nsf_salarie,
          'nsf_patronal', nsf_patronal,
          'training_levy', training_levy,
          'prgf', prgf_montant,
          'prgf_eligible', prgf_eligible,
          'prgf_motif_exemption', prgf_motif_exemption
        )
        ORDER BY nom, prenom
      ),
      '[]'::jsonb
    )
  FROM bulletins;
END $fn$;

COMMENT ON FUNCTION public.agreger_declarations_mra IS
  'G13 - Agrège les charges MRA d''un mois pour une société depuis bulletins_paie validés (source=calcul/import_excel).';
