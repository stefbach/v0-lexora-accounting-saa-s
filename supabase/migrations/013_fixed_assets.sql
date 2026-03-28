-- ============================================================
-- Migration 013: Fixed Asset Register + Amortissements
-- ============================================================

CREATE TABLE IF NOT EXISTS public.immobilisations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  categorie TEXT NOT NULL CHECK (categorie IN (
    'materiel_informatique', 'mobilier', 'vehicule',
    'immobilier', 'logiciel', 'equipement', 'autre'
  )),
  fournisseur TEXT,
  numero_serie TEXT,
  date_acquisition DATE NOT NULL,
  cout_acquisition NUMERIC(15,2) NOT NULL,
  devise TEXT DEFAULT 'MUR',
  taux_change NUMERIC(10,4) DEFAULT 1,
  cout_mur NUMERIC(15,2),
  taux_amortissement NUMERIC(5,2) NOT NULL,
  methode TEXT DEFAULT 'lineaire' CHECK (methode IN ('lineaire', 'degressif')),
  valeur_residuelle NUMERIC(15,2) DEFAULT 0,
  date_mise_en_service DATE,
  date_cession DATE,
  valeur_cession NUMERIC(15,2),
  document_id UUID REFERENCES public.documents(id),
  notes TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.amortissements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  immobilisation_id UUID REFERENCES public.immobilisations(id) ON DELETE CASCADE,
  exercice TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  base_amortissable NUMERIC(15,2) NOT NULL,
  dotation NUMERIC(15,2) NOT NULL,
  cumul_avant NUMERIC(15,2) DEFAULT 0,
  cumul_apres NUMERIC(15,2) NOT NULL,
  valeur_nette NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grand livre view (vue calculée)
CREATE OR REPLACE VIEW public.vue_grand_livre AS
SELECT
  e.id,
  e.dossier_id,
  d.societe_id,
  e.date_ecriture,
  e.journal,
  e.numero_piece,
  e.compte,
  LEFT(e.compte, 1) AS classe,
  LEFT(e.compte, 2) AS compte2,
  LEFT(e.compte, 3) AS compte3,
  e.libelle,
  e.debit,
  e.credit,
  (e.debit - e.credit) AS solde,
  e.piece_justificative,
  e.lettrage,
  e.created_at
FROM public.ecritures_comptables e
JOIN public.dossiers d ON d.id = e.dossier_id;

-- Balance générale view
CREATE OR REPLACE VIEW public.vue_balance AS
SELECT
  d.societe_id,
  e.compte,
  LEFT(e.compte, 1) AS classe,
  MIN(e.date_ecriture) AS premiere_ecriture,
  MAX(e.date_ecriture) AS derniere_ecriture,
  COUNT(*) AS nb_ecritures,
  SUM(e.debit) AS total_debit,
  SUM(e.credit) AS total_credit,
  SUM(e.debit) - SUM(e.credit) AS solde,
  CASE
    WHEN SUM(e.debit) >= SUM(e.credit) THEN SUM(e.debit) - SUM(e.credit)
    ELSE 0
  END AS solde_debiteur,
  CASE
    WHEN SUM(e.credit) > SUM(e.debit) THEN SUM(e.credit) - SUM(e.debit)
    ELSE 0
  END AS solde_crediteur
FROM public.ecritures_comptables e
JOIN public.dossiers d ON d.id = e.dossier_id
GROUP BY d.societe_id, e.compte;

CREATE INDEX IF NOT EXISTS idx_immobilisations_societe ON public.immobilisations(societe_id);
CREATE INDEX IF NOT EXISTS idx_amortissements_immo ON public.amortissements(immobilisation_id);
CREATE INDEX IF NOT EXISTS idx_amortissements_exercice ON public.amortissements(exercice);

ALTER TABLE public.immobilisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amortissements ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "immobilisations_auth" ON public.immobilisations FOR ALL
  USING (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "amortissements_auth" ON public.amortissements FOR ALL
  USING (auth.uid() IS NOT NULL);
