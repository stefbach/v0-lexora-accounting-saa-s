-- ============================================================
-- Migration 016 — Module Paie LEXORA (MRA Compliant)
-- Workers' Rights Act 2019 | Finance Act 2024 | CSG Act 2021
-- ============================================================

-- Nettoyage si tables partielles existent
DROP TABLE IF EXISTS public.factures_interco_paie CASCADE;
DROP TABLE IF EXISTS public.conges_employes CASCADE;
DROP TABLE IF EXISTS public.declarations_paye_mensuelle CASCADE;
DROP TABLE IF EXISTS public.declarations_csg_mensuelle CASCADE;
DROP TABLE IF EXISTS public.bulletins_paie CASCADE;
DROP TABLE IF EXISTS public.employes CASCADE;
DROP TABLE IF EXISTS public.parametres_paie_mra CASCADE;

-- ============================================================
-- TABLE: parametres_paie_mra
-- ============================================================
CREATE TABLE public.parametres_paie_mra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee INTEGER NOT NULL,
  mois_debut INTEGER DEFAULT 1,
  salaire_minimum_national DECIMAL(10,2) DEFAULT 16500.00,
  csg_salarie_taux_plein DECIMAL(5,4) DEFAULT 0.03,
  csg_salarie_taux_reduit DECIMAL(5,4) DEFAULT 0.015,
  csg_patronal DECIMAL(5,4) DEFAULT 0.06,
  csg_seuil_taux_reduit DECIMAL(10,2) DEFAULT 50000.00,
  nsf_salarie DECIMAL(5,4) DEFAULT 0.015,
  nsf_patronal DECIMAL(5,4) DEFAULT 0.025,
  training_levy DECIMAL(5,4) DEFAULT 0.01,
  prgf_patronal_par_jour DECIMAL(8,2) DEFAULT 4.50,
  cit_taux DECIMAL(5,4) DEFAULT 0.15,
  compensation_salariale_taux DECIMAL(5,4) DEFAULT 0.10,
  compensation_salariale_min DECIMAL(10,2) DEFAULT 1500.00,
  compensation_salariale_max DECIMAL(10,2) DEFAULT 2000.00,
  eoy_bonus_min_mois_service INTEGER DEFAULT 8,
  heures_standard_semaine DECIMAL(5,2) DEFAULT 45.00,
  jours_travail_semaine INTEGER DEFAULT 5,
  heures_sup_taux_normal DECIMAL(4,2) DEFAULT 1.50,
  heures_sup_taux_majore DECIMAL(4,2) DEFAULT 2.00,
  conges_annuels_moins_5ans INTEGER DEFAULT 15,
  conges_annuels_plus_5ans INTEGER DEFAULT 20,
  conges_maladie_annuels INTEGER DEFAULT 15,
  conges_maternite_semaines INTEGER DEFAULT 16,
  conges_paternite_semaines INTEGER DEFAULT 4,
  actif BOOLEAN DEFAULT true,
  source_url TEXT DEFAULT 'https://www.mra.mu',
  derniere_verification TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.parametres_paie_mra (annee) VALUES (2025);

-- ============================================================
-- TABLE: employes
-- ============================================================
CREATE TABLE public.employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  poste VARCHAR(255),
  date_arrivee DATE NOT NULL,
  date_depart DATE,
  actif BOOLEAN GENERATED ALWAYS AS (date_depart IS NULL) STORED,
  salaire_base DECIMAL(12,2) NOT NULL,
  devise VARCHAR(3) DEFAULT 'MUR',
  nic_number VARCHAR(20),
  bank_account VARCHAR(50),
  bank_name VARCHAR(100),
  iban VARCHAR(50),
  transport_allowance DECIMAL(10,2) DEFAULT 0,
  petrol_allowance DECIMAL(10,2) DEFAULT 0,
  pct_refacturation DECIMAL(5,4) DEFAULT 1.00,
  societe_refacturation_id UUID REFERENCES public.societes(id),
  csg_categorie VARCHAR(1) DEFAULT 'A',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: bulletins_paie
-- ============================================================
CREATE TABLE public.bulletins_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL,
  salaire_base DECIMAL(12,2) NOT NULL,
  increment_salaire DECIMAL(12,2) DEFAULT 0,
  heures_sup_montant DECIMAL(12,2) DEFAULT 0,
  transport_allowance DECIMAL(12,2) DEFAULT 0,
  petrol_allowance DECIMAL(12,2) DEFAULT 0,
  special_allowance_1 DECIMAL(12,2) DEFAULT 0,
  special_allowance_2 DECIMAL(12,2) DEFAULT 0,
  special_allowance_3 DECIMAL(12,2) DEFAULT 0,
  other_refund DECIMAL(12,2) DEFAULT 0,
  eoy_bonus DECIMAL(12,2) DEFAULT 0,
  departure_notice DECIMAL(12,2) DEFAULT 0,
  salaire_brut DECIMAL(12,2) GENERATED ALWAYS AS (
    salaire_base + increment_salaire + heures_sup_montant +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    other_refund + eoy_bonus + departure_notice
  ) STORED,
  csg_salarie DECIMAL(10,2) DEFAULT 0,
  csg_bonus DECIMAL(10,2) DEFAULT 0,
  nsf_salarie DECIMAL(10,2) DEFAULT 0,
  paye DECIMAL(10,2) DEFAULT 0,
  total_deductions DECIMAL(10,2) DEFAULT 0,
  salaire_net DECIMAL(12,2) DEFAULT 0,
  csg_patronal DECIMAL(10,2) DEFAULT 0,
  csg_patronal_bonus DECIMAL(10,2) DEFAULT 0,
  nsf_patronal DECIMAL(10,2) DEFAULT 0,
  training_levy DECIMAL(10,2) DEFAULT 0,
  prgf DECIMAL(10,2) DEFAULT 0,
  total_charges_patronales DECIMAL(10,2) DEFAULT 0,
  jours_absence DECIMAL(5,2) DEFAULT 0,
  montant_absence DECIMAL(10,2) DEFAULT 0,
  pct_refacturation DECIMAL(5,4) DEFAULT 0,
  societe_refacturation_id UUID REFERENCES public.societes(id),
  montant_refacture_mur DECIMAL(12,2) DEFAULT 0,
  airbox_mur DECIMAL(10,2) DEFAULT 924.48,
  ordinateur_mur DECIMAL(10,2) DEFAULT 818.22,
  charges_sociales_pct DECIMAL(5,4) DEFAULT 0.105,
  statut VARCHAR(20) DEFAULT 'brouillon',
  date_paiement DATE,
  reference_virement VARCHAR(50),
  devise_salaire VARCHAR(3) DEFAULT 'MUR',
  taux_change_applique DECIMAL(12,6) DEFAULT 1,
  montant_devise_origine DECIMAL(12,2) DEFAULT 0,
  ecart_forex DECIMAL(12,2) DEFAULT 0,
  ia_valide BOOLEAN DEFAULT false,
  anomalies JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, periode)
);

-- ============================================================
-- TABLE: declarations_csg_mensuelle
-- ============================================================
CREATE TABLE public.declarations_csg_mensuelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL,
  ern VARCHAR(20),
  nb_employes INTEGER DEFAULT 0,
  masse_salariale_brute DECIMAL(15,2) DEFAULT 0,
  total_csg_salarie DECIMAL(12,2) DEFAULT 0,
  total_csg_patronal DECIMAL(12,2) DEFAULT 0,
  total_nsf_salarie DECIMAL(12,2) DEFAULT 0,
  total_nsf_patronal DECIMAL(12,2) DEFAULT 0,
  total_training_levy DECIMAL(12,2) DEFAULT 0,
  total_prgf DECIMAL(12,2) DEFAULT 0,
  total_a_remettre_mra DECIMAL(12,2) DEFAULT 0,
  date_limite DATE,
  date_declaration DATE,
  date_paiement DATE,
  reference_mra VARCHAR(50),
  statut VARCHAR(20) DEFAULT 'a_faire',
  penalites DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: declarations_paye_mensuelle
-- ============================================================
CREATE TABLE public.declarations_paye_mensuelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL,
  total_salaires_bruts DECIMAL(15,2) DEFAULT 0,
  total_paye_retenu DECIMAL(12,2) DEFAULT 0,
  nb_employes INTEGER DEFAULT 0,
  date_limite DATE,
  date_declaration DATE,
  date_paiement DATE,
  reference_mra VARCHAR(50),
  statut VARCHAR(20) DEFAULT 'a_faire',
  penalites DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: conges_employes
-- ============================================================
CREATE TABLE public.conges_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  annee INTEGER NOT NULL,
  type_conge VARCHAR(30) NOT NULL,
  jours_droit INTEGER DEFAULT 0,
  jours_pris INTEGER DEFAULT 0,
  jours_restants INTEGER GENERATED ALWAYS AS (jours_droit - jours_pris) STORED,
  jours_accumules INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: factures_interco_paie
-- Refacturation salaires entre sociétés (ex: OCC → OCC Malta)
-- ============================================================
CREATE TABLE public.factures_interco_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_facture VARCHAR(30) UNIQUE NOT NULL,
  societe_emettrice_id UUID REFERENCES public.societes(id),
  societe_destinataire_id UUID REFERENCES public.societes(id),
  periode DATE NOT NULL,
  date_emission DATE NOT NULL,
  taux_change DECIMAL(10,4),
  lignes JSONB NOT NULL DEFAULT '[]',
  marge_pct DECIMAL(5,4) DEFAULT 0.25,
  montant_ht_mur DECIMAL(15,2) DEFAULT 0,
  montant_ht_eur DECIMAL(15,2) DEFAULT 0,
  tva_taux DECIMAL(5,4) DEFAULT 0.00,
  montant_ttc_eur DECIMAL(15,2) DEFAULT 0,
  ecriture_debit VARCHAR(10) DEFAULT '451',
  ecriture_credit VARCHAR(10) DEFAULT '706',
  statut VARCHAR(20) DEFAULT 'emise',
  date_paiement DATE,
  iban_paiement VARCHAR(50),
  swift VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FONCTION: calcul_cotisations_paie
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcul_cotisations_paie(
  p_salaire_brut DECIMAL,
  p_annee INTEGER DEFAULT 2025
)
RETURNS JSONB AS $$
DECLARE
  params public.parametres_paie_mra%ROWTYPE;
  csg_taux DECIMAL;
  csg_sal DECIMAL;
  nsf_sal DECIMAL;
BEGIN
  SELECT * INTO params FROM public.parametres_paie_mra
  WHERE annee = p_annee AND actif = true
  ORDER BY mois_debut DESC LIMIT 1;

  IF p_salaire_brut <= params.csg_seuil_taux_reduit THEN
    csg_taux := params.csg_salarie_taux_reduit;
  ELSE
    csg_taux := params.csg_salarie_taux_plein;
  END IF;

  csg_sal := ROUND(p_salaire_brut * csg_taux);
  nsf_sal := ROUND(p_salaire_brut * params.nsf_salarie);

  RETURN jsonb_build_object(
    'csg_taux', csg_taux,
    'csg_salarie', csg_sal,
    'nsf_salarie', nsf_sal,
    'csg_patronal', ROUND(p_salaire_brut * params.csg_patronal),
    'nsf_patronal', ROUND(p_salaire_brut * params.nsf_patronal),
    'training_levy', ROUND(p_salaire_brut * params.training_levy),
    'total_deductions_salarie', csg_sal + nsf_sal,
    'total_charges_patronales', ROUND(p_salaire_brut * (params.csg_patronal + params.nsf_patronal + params.training_levy))
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FONCTION: verif_conformite_salaire
-- ============================================================
CREATE OR REPLACE FUNCTION public.verif_conformite_salaire(
  p_salaire_base DECIMAL,
  p_annee INTEGER DEFAULT 2025
)
RETURNS JSONB AS $$
DECLARE
  params public.parametres_paie_mra%ROWTYPE;
  alertes JSONB DEFAULT '[]';
BEGIN
  SELECT * INTO params FROM public.parametres_paie_mra
  WHERE annee = p_annee AND actif = true LIMIT 1;

  IF p_salaire_base < params.salaire_minimum_national THEN
    alertes := alertes || jsonb_build_object(
      'type', 'salaire_minimum',
      'message', 'Salaire inférieur au minimum légal MRA 2025 (' || params.salaire_minimum_national || ' MUR)',
      'niveau', 'critique'
    );
  END IF;

  RETURN jsonb_build_object(
    'conforme', jsonb_array_length(alertes) = 0,
    'alertes', alertes
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_employes_societe ON public.employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_employes_actifs ON public.employes(societe_id) WHERE date_depart IS NULL;
CREATE INDEX IF NOT EXISTS idx_bulletins_employe ON public.bulletins_paie(employe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_periode ON public.bulletins_paie(periode);
CREATE INDEX IF NOT EXISTS idx_bulletins_societe ON public.bulletins_paie(societe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_statut ON public.bulletins_paie(statut);
CREATE INDEX IF NOT EXISTS idx_conges_employe_annee ON public.conges_employes(employe_id, annee);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametres_paie_mra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conges_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factures_interco_paie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declarations_csg_mensuelle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declarations_paye_mensuelle ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "employes_comptable_admin" ON public.employes
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "employes_client_read" ON public.employes
    FOR SELECT USING (
      societe_id IN (SELECT id FROM public.societes WHERE client_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "bulletins_comptable_admin" ON public.bulletins_paie
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "bulletins_client_read" ON public.bulletins_paie
    FOR SELECT USING (
      societe_id IN (SELECT id FROM public.societes WHERE client_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "params_mra_read" ON public.parametres_paie_mra
    FOR SELECT USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "conges_auth" ON public.conges_employes
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "interco_paie_auth" ON public.factures_interco_paie
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "decl_csg_auth" ON public.declarations_csg_mensuelle
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "decl_paye_auth" ON public.declarations_paye_mensuelle
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- FIN MIGRATION 016
-- ============================================================
