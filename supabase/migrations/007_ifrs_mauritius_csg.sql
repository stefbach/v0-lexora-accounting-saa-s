-- ============================================================
-- LEXORA — Migration 007: IFRS Mauritius + CSG/NSF corrections
-- Grand Livre, Immobilisations, Déclarations annuelles
-- CSG replaces NPF (Social Contributions Act 2021)
-- ============================================================

-- ============================================================
-- 1. ECRITURES COMPTABLES (Grand Livre)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ecritures_comptables_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  date_ecriture DATE NOT NULL,
  ref_folio TEXT,
  numero_compte TEXT NOT NULL,
  nom_compte TEXT,
  description TEXT,
  debit_mur NUMERIC(15,2) DEFAULT 0,
  credit_mur NUMERIC(15,2) DEFAULT 0,
  solde_mur NUMERIC(15,2),
  document_id UUID REFERENCES public.documents(id),
  journal TEXT, -- ACH, VTE, BQ, OD, SAL
  exercice TEXT, -- ex: '2025-2026'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe ON public.ecritures_comptables_v2(societe_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_compte ON public.ecritures_comptables_v2(numero_compte);
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_date ON public.ecritures_comptables_v2(date_ecriture);
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_journal ON public.ecritures_comptables_v2(journal);

ALTER TABLE public.ecritures_comptables_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ecritures v2" ON public.ecritures_comptables_v2 FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can manage ecritures v2" ON public.ecritures_comptables_v2 FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 2. IMMOBILISATIONS (Fixed Asset Register)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.immobilisations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  categorie TEXT CHECK (categorie IN (
    'it_technology', 'furniture_fittings', 'equipment',
    'vehicles', 'leasehold_improvements', 'other'
  )),
  date_acquisition DATE,
  ref_facture TEXT,
  cout_mur NUMERIC(15,2),
  duree_vie_ans INTEGER,
  taux_amortissement NUMERIC(5,2),
  amort_cumule_ouverture NUMERIC(15,2) DEFAULT 0,
  dotation_annee NUMERIC(15,2),
  amort_cumule_cloture NUMERIC(15,2),
  valeur_nette NUMERIC(15,2),
  date_cession DATE,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_immobilisations_societe ON public.immobilisations(societe_id);
CREATE INDEX IF NOT EXISTS idx_immobilisations_categorie ON public.immobilisations(categorie);

ALTER TABLE public.immobilisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage immobilisations" ON public.immobilisations FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can manage immobilisations" ON public.immobilisations FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 3. DECLARATIONS ANNUELLES (ROC, APS, IS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.declarations_annuelles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  type_declaration TEXT NOT NULL CHECK (type_declaration IN (
    'roc_annual_return', 'aps_q1', 'aps_q2', 'aps_q3',
    'is_annual_ct03', 'audit_report', 'treizieme_mois'
  )),
  exercice TEXT,
  date_echeance DATE,
  date_soumission DATE,
  montant_mur NUMERIC(15,2),
  reference TEXT,
  statut TEXT DEFAULT 'a_faire' CHECK (statut IN (
    'a_faire', 'soumis', 'paye', 'en_retard'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declarations_societe ON public.declarations_annuelles(societe_id);
CREATE INDEX IF NOT EXISTS idx_declarations_type ON public.declarations_annuelles(type_declaration);
CREATE INDEX IF NOT EXISTS idx_declarations_statut ON public.declarations_annuelles(statut);

ALTER TABLE public.declarations_annuelles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage declarations" ON public.declarations_annuelles FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables can manage declarations" ON public.declarations_annuelles FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 4. UPDATE DOSSIERS TRIGGER — Add new standard folders
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_dossiers_for_societe()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.dossiers (societe_id, nom, type_dossier, description, cree_par_systeme) VALUES
    (NEW.id, 'Factures Fournisseurs', 'factures_fournisseurs', 'Factures reçues fournisseurs', true),
    (NEW.id, 'Factures Clients', 'factures_clients', 'Factures émises clients', true),
    (NEW.id, 'Relevés Bancaires', 'releves_bancaires', 'Relevés bancaires mensuels', true),
    (NEW.id, 'Fiches de Paie', 'fiches_paie', 'Bulletins de salaire', true),
    (NEW.id, 'Déclaration CSG/NSF Mensuelle', 'csg_mensuel', 'CSG 3%+6%, NSF 1.5%+2.5%, Training Levy 1%', true),
    (NEW.id, 'Déclarations TVA MRA', 'declarations_tva', 'Déclarations TVA mensuelles', true),
    (NEW.id, 'Rapprochement Bancaire', 'rapprochement_bancaire', 'Rapprochements mensuels', true),
    (NEW.id, 'Grand Livre', 'grand_livre', 'Toutes les écritures comptables classées par compte', true),
    (NEW.id, 'Balance des Comptes', 'balance_comptes', 'Trial Balance — totaux débit/crédit par compte', true),
    (NEW.id, 'États Financiers IFRS', 'etats_financiers', 'Balance Sheet, P&L, Cash Flow, Changes in Equity', true),
    (NEW.id, 'Registre Immobilisations', 'immobilisations', 'Fixed Asset Register — méthode linéaire', true),
    (NEW.id, 'Contrats', 'contrats', 'Contrats fournisseurs/clients/travail', true),
    (NEW.id, 'Rapports P&L', 'rapports_pnl', 'Rapports mensuels', true),
    (NEW.id, 'ROC Annual Return', 'roc_annual_return', 'Retour annuel registre sociétés — deadline 31 déc.', true),
    (NEW.id, 'APS Trimestriel', 'aps_trimestriel', 'Acompte IS si CA > 10M MUR — Q1 août, Q2 nov, Q3 fév', true),
    (NEW.id, '13ème Mois', 'treizieme_mois', '75% avant 25/12 + 25% avant 31/12', true),
    (NEW.id, 'Liasse Fiscale Annuelle', 'liasse_fiscale', 'Bilan et IS annuel MRA', true),
    (NEW.id, 'Divers', 'divers', 'Documents non classifiés', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
