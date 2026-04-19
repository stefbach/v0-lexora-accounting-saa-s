-- ============================================================================
-- Migration 163: Paie MRA 2026 — corrections conformité
-- ============================================================================
-- Corrige les paramètres de paie pour conformité MRA Maurice 2026 :
-- - Barème PAYE 3 tranches (390K / 490K / 590K) au lieu de 2 tranches erronées
-- - NSF plafond mensuel 19500 Rs (cap manquant)
-- - CSG patronal taux réduit 3% configurable
-- - NIT catégories A (25K) et B (30K avec dépendants)
-- - Cumul YTD par employé pour PAYE cumulatif depuis juillet
-- ============================================================================

-- Ajoute les colonnes manquantes à parametres_paie_mra
ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS paye_seuil_taux_3 NUMERIC(18,2) DEFAULT 590000,
  ADD COLUMN IF NOT EXISTS paye_taux_3 NUMERIC(5,4) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS nsf_plafond_mensuel NUMERIC(18,2) DEFAULT 19500,
  ADD COLUMN IF NOT EXISTS csg_patronal_taux_reduit NUMERIC(5,4) DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS nit_seuil_categorie_a NUMERIC(18,2) DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS nit_seuil_categorie_b NUMERIC(18,2) DEFAULT 30000;

-- Met à jour le seuil tranche 2 (bug historique : 650000 au lieu de 490000)
UPDATE public.parametres_paie_mra
SET paye_seuil_taux_2 = 490000
WHERE paye_seuil_taux_2 = 650000;

-- ============================================================================
-- Table cumul YTD (pour PAYE cumulatif depuis juillet, année fiscale Maurice)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.paie_cumul_ytd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  annee_fiscale INT NOT NULL,
  mois_fiscal INT NOT NULL CHECK (mois_fiscal BETWEEN 1 AND 12),
  salaire_brut_cumul NUMERIC(18,2) NOT NULL DEFAULT 0,
  paye_retenu_cumul NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employe_id, annee_fiscale, mois_fiscal)
);

CREATE INDEX IF NOT EXISTS idx_paie_cumul_employe_annee
  ON public.paie_cumul_ytd(employe_id, annee_fiscale DESC);

COMMENT ON TABLE public.paie_cumul_ytd IS
  'Cumul year-to-date du salaire brut et PAYE par employé/mois fiscal (juillet=1). Utilisé pour calcul PAYE cumulatif Maurice.';

-- Nouvelle colonne sur bulletins_paie pour référence au cumul utilisé
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS paye_ytd_cumul NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS salaire_ytd_cumul NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS nb_dependants INT DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.paye_ytd_cumul IS
  'Cumul YTD PAYE utilisé pour calculer le PAYE du mois (depuis juillet).';
COMMENT ON COLUMN public.bulletins_paie.nb_dependants IS
  'Nombre de dépendants pour déterminer la catégorie NIT (A/B).';

-- RLS sur paie_cumul_ytd (admin + RH + accès société)
ALTER TABLE public.paie_cumul_ytd ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='paie_cumul_ytd' AND policyname='paie_cumul_access') THEN
    CREATE POLICY paie_cumul_access ON public.paie_cumul_ytd
      FOR ALL TO authenticated
      USING (
        employe_id IN (
          SELECT id FROM public.employes
          WHERE societe_id IN (SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid())
        )
      );
  END IF;
END $$;
