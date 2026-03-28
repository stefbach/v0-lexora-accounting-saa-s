-- ============================================================
-- Migration 016: Tables Paie TIBOK-COMPTA (version complète)
-- Remplace les tables simplifiées de la migration 015
-- Source: tibok-compta/supabase/migrations/001_initial.sql (Partie 2)
-- ============================================================

-- Supprimer les tables simplifiées créées en 015 si elles existent
DROP TABLE IF EXISTS public.primes_variables_mois CASCADE;
DROP TABLE IF EXISTS public.declarations_csg_mensuelle CASCADE;
DROP TABLE IF EXISTS public.contrats_employes CASCADE;
DROP TABLE IF EXISTS public.bulletins_paie CASCADE;
DROP TABLE IF EXISTS public.heures_travaillees CASCADE;
DROP TABLE IF EXISTS public.demandes_conges CASCADE;
DROP TABLE IF EXISTS public.soldes_conges CASCADE;
DROP TABLE IF EXISTS public.pointages CASCADE;
DROP TABLE IF EXISTS public.parametres_paie_mra CASCADE;
DROP TABLE IF EXISTS public.employes CASCADE;
DROP TABLE IF EXISTS public.catalogue_primes CASCADE;

-- PARTIE 2 : PAIE (supabase-paie.sql)
-- ============================================================

-- ============================================================
-- TIBOK COMPTA IA — Module Paie Mauritius
-- Workers' Rights Act 2019 | Finance Act 2024 | CSG Act 2021
-- Données réelles OCC Jul-Nov 2025 intégrées
-- ============================================================

-- ============================================================
-- TABLE: employes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL, -- 000001, 000002...
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  poste VARCHAR(255),
  date_arrivee DATE NOT NULL,
  date_depart DATE, -- NULL = actif
  actif BOOLEAN GENERATED ALWAYS AS (date_depart IS NULL) STORED,

  -- Rémunération de base
  salaire_base DECIMAL(12,2) NOT NULL,
  devise VARCHAR(3) DEFAULT 'MUR',

  -- Infos légales MRA
  nic_number VARCHAR(20), -- National Identity Card
  npf_number VARCHAR(20), -- anciennement, maintenant CSG
  bank_account VARCHAR(50),
  bank_name VARCHAR(100),
  iban VARCHAR(50),

  -- Paramètres paie
  transport_allowance DECIMAL(10,2) DEFAULT 0,
  petrol_allowance DECIMAL(10,2) DEFAULT 0,
  pct_refacturation DECIMAL(5,4) DEFAULT 1.00, -- 1.00 = 100%, 0.30 = 30%
  societe_refacturation_id UUID REFERENCES public.societes(id), -- OCC Malta pour certains

  -- Catégorie CSG
  csg_categorie VARCHAR(1) DEFAULT 'A', -- A = taux plein, B = taux réduit

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Données réelles OCC (extrait des payrolls Jul-Nov 2025)
-- À compléter avec les vrais NIC/bank accounts
INSERT INTO employes (societe_id, code, nom, prenom, poste, date_arrivee, salaire_base, transport_allowance, petrol_allowance, pct_refacturation)
SELECT
  s.id,
  e.code, e.nom, e.prenom, e.poste,
  e.date_arrivee::DATE,
  e.salaire_base, e.transport_allowance, e.petrol_allowance, e.pct_refacturation
FROM societes s, (VALUES
  ('000001', 'FRONTCZAK', 'Johanna', 'Directrice Ressources Humaines', '2025-01-01', 56535, 12000, 0, 0.30),
  ('000002', 'JAUNKY', 'Jeyel', 'Technicien informatique', '2025-01-01', 30000, 0, 5500, 0.30),
  ('000003', 'CHAVETIAN', 'Stephano', 'Producteur de Contenu Numérique', '2025-01-01', 40535, 0, 0, 0.00),
  ('000004', 'DESIRE', 'Marie Alicia Whitney', 'Secrétaire médicale Polyvalente', '2025-01-01', 30610, 0, 0, 0.00),
  ('000008', 'GROODOYAL', 'Aditya', 'Dessinateur Concepteur', '2025-01-01', 55000, 0, 0, 0.00),
  ('000009', 'QUENETTE', 'Mégane', 'Productrice de contenu polyvalente', '2025-01-01', 41000, 0, 0, 1.00),
  ('000015', 'BEERACHEE', 'Shubham', 'Assistant médical / Coach diététique', '2025-04-02', 30000, 0, 0, 1.00),
  ('000021', 'ARJOON', 'Bheshouma', 'Medical Secretary / Diet Coach', '2025-03-24', 30000, 0, 0, 1.00),
  ('000023', 'PURSOTY', 'Dhanika', 'Conseillère Service Client et Back Office', '2025-04-28', 35000, 0, 0, 1.00),
  ('000024', 'PAUL', 'Cecilia', 'Responsable Production', '2025-05-02', 40000, 0, 0, 1.00),
  ('000025', 'SEKELY', 'Sheetal', 'Closer', '2025-05-12', 47000, 0, 0, 1.00)
) AS e(code, nom, prenom, poste, date_arrivee, salaire_base, transport_allowance, petrol_allowance, pct_refacturation)
WHERE s.code = 'OCC' ON CONFLICT (code) DO NOTHING;

-- Départ Cecilia Paul
UPDATE employes SET date_depart = '2025-08-21' WHERE code = '000024';

-- ============================================================
-- TABLE: parametres_paie_mra
-- Taux officiels MRA — mis à jour automatiquement via N8N
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parametres_paie_mra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee INTEGER NOT NULL,
  mois_debut INTEGER DEFAULT 1, -- mois d'entrée en vigueur

  -- Salaire minimum national
  salaire_minimum_national DECIMAL(10,2) DEFAULT 16500.00,

  -- CSG (remplace NPF depuis sept. 2020)
  csg_salarie_taux_plein DECIMAL(5,4) DEFAULT 0.03,    -- salaire > 50 000 MUR
  csg_salarie_taux_reduit DECIMAL(5,4) DEFAULT 0.015,  -- salaire ≤ 50 000 MUR
  csg_patronal DECIMAL(5,4) DEFAULT 0.06,
  csg_seuil_taux_reduit DECIMAL(10,2) DEFAULT 50000.00,

  -- NSF (National Savings Fund)
  nsf_salarie DECIMAL(5,4) DEFAULT 0.015,   -- 1.5%
  nsf_patronal DECIMAL(5,4) DEFAULT 0.025,  -- 2.5%

  -- Training Levy (anciennement HRDC)
  training_levy DECIMAL(5,4) DEFAULT 0.01,  -- 1%
  training_levy_seuil_ca DECIMAL(15,2) DEFAULT 1500000.00,

  -- PRGF (Portable Retirement Gratuity Fund)
  prgf_patronal_par_jour DECIMAL(8,2) DEFAULT 4.50, -- MUR par jour travaillé

  -- CIT (Corporate Income Tax)
  cit_taux DECIMAL(5,4) DEFAULT 0.15,

  -- Compensation salariale annuelle
  compensation_salariale_taux DECIMAL(5,4) DEFAULT 0.10,  -- 10%
  compensation_salariale_min DECIMAL(10,2) DEFAULT 1500.00,
  compensation_salariale_max DECIMAL(10,2) DEFAULT 2000.00,

  -- 13ème mois (End of Year Bonus)
  eoy_bonus_min_mois_service INTEGER DEFAULT 8, -- éligible après 8 mois

  -- Heures travail
  heures_standard_semaine DECIMAL(5,2) DEFAULT 45.00,
  jours_travail_semaine INTEGER DEFAULT 5,
  heures_sup_taux_normal DECIMAL(4,2) DEFAULT 1.50,  -- 1.5x
  heures_sup_taux_majore DECIMAL(4,2) DEFAULT 2.00,  -- 2x au-delà 2h ou jours fériés

  -- Congés légaux
  conges_annuels_moins_5ans INTEGER DEFAULT 15,
  conges_annuels_plus_5ans INTEGER DEFAULT 20,
  conges_maladie_annuels INTEGER DEFAULT 15,
  conges_maternite_semaines INTEGER DEFAULT 16, -- Finance Act 2024
  conges_paternite_semaines INTEGER DEFAULT 4,  -- Finance Act 2024

  actif BOOLEAN DEFAULT true,
  source_url TEXT DEFAULT 'https://www.mra.mu',
  derniere_verification TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paramètres 2025
INSERT INTO parametres_paie_mra (annee) VALUES (2025);

-- ============================================================
-- TABLE: bulletins_paie
-- Un enregistrement par employé par mois
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bulletins_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL, -- Premier jour du mois (2025-07-01)

  -- Éléments de rémunération brute
  salaire_base DECIMAL(12,2) NOT NULL,
  increment_salaire DECIMAL(12,2) DEFAULT 0,      -- Company Salary Increment
  heures_sup_montant DECIMAL(12,2) DEFAULT 0,
  transport_allowance DECIMAL(12,2) DEFAULT 0,
  petrol_allowance DECIMAL(12,2) DEFAULT 0,
  special_allowance_1 DECIMAL(12,2) DEFAULT 0,
  special_allowance_2 DECIMAL(12,2) DEFAULT 0,
  special_allowance_3 DECIMAL(12,2) DEFAULT 0,
  other_refund DECIMAL(12,2) DEFAULT 0,           -- remboursements divers, congés non pris
  eoy_bonus DECIMAL(12,2) DEFAULT 0,              -- 13ème mois
  departure_notice DECIMAL(12,2) DEFAULT 0,       -- préavis payé à la sortie
  salaire_brut DECIMAL(12,2) GENERATED ALWAYS AS (
    salaire_base + increment_salaire + heures_sup_montant +
    transport_allowance + petrol_allowance +
    special_allowance_1 + special_allowance_2 + special_allowance_3 +
    other_refund + eoy_bonus + departure_notice
  ) STORED,

  -- Déductions salarié
  csg_salarie DECIMAL(10,2) DEFAULT 0,
  csg_bonus DECIMAL(10,2) DEFAULT 0,  -- CSG sur EOY bonus
  nsf_salarie DECIMAL(10,2) DEFAULT 0,
  paye DECIMAL(10,2) DEFAULT 0,
  total_deductions DECIMAL(10,2) DEFAULT 0,
  salaire_net DECIMAL(12,2) DEFAULT 0,

  -- Charges patronales
  csg_patronal DECIMAL(10,2) DEFAULT 0,
  csg_patronal_bonus DECIMAL(10,2) DEFAULT 0,
  nsf_patronal DECIMAL(10,2) DEFAULT 0,
  training_levy DECIMAL(10,2) DEFAULT 0,
  prgf DECIMAL(10,2) DEFAULT 0,
  total_charges_patronales DECIMAL(10,2) DEFAULT 0,

  -- Absence
  jours_absence DECIMAL(5,2) DEFAULT 0,
  montant_absence DECIMAL(10,2) DEFAULT 0,

  -- Refacturation inter-sociétés
  pct_refacturation DECIMAL(5,4) DEFAULT 0,
  societe_refacturation_id UUID REFERENCES public.societes(id),
  montant_refacture_mur DECIMAL(12,2) DEFAULT 0,  -- inclut charges + airbox + ordi
  airbox_mur DECIMAL(10,2) DEFAULT 924.48,
  ordinateur_mur DECIMAL(10,2) DEFAULT 818.22,
  charges_sociales_pct DECIMAL(5,4) DEFAULT 0.105, -- 10.5% approximation

  -- Statut
  statut VARCHAR(20) DEFAULT 'brouillon', -- brouillon | valide | paye | declare_mra
  date_paiement DATE,
  reference_virement VARCHAR(50),

  -- IA / audit
  ia_valide BOOLEAN DEFAULT false,
  anomalies JSONB DEFAULT '[]',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employe_id, periode)
);

-- ============================================================
-- TABLE: declarations_csg_mensuelle
-- Déclaration CSG/NSF mensuelle à soumettre MRA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.declarations_csg_mensuelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL,
  ern VARCHAR(20), -- Employer Registration Number

  -- Totaux
  nb_employes INTEGER DEFAULT 0,
  masse_salariale_brute DECIMAL(15,2) DEFAULT 0,
  total_csg_salarie DECIMAL(12,2) DEFAULT 0,
  total_csg_patronal DECIMAL(12,2) DEFAULT 0,
  total_nsf_salarie DECIMAL(12,2) DEFAULT 0,
  total_nsf_patronal DECIMAL(12,2) DEFAULT 0,
  total_training_levy DECIMAL(12,2) DEFAULT 0,
  total_prgf DECIMAL(12,2) DEFAULT 0,
  total_a_remettre_mra DECIMAL(12,2) DEFAULT 0,

  -- Soumission
  date_limite DATE, -- fin du mois suivant
  date_declaration DATE,
  date_paiement DATE,
  reference_mra VARCHAR(50),
  statut VARCHAR(20) DEFAULT 'a_faire', -- a_faire | declare | paye | en_retard
  penalites DECIMAL(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: declarations_paye_mensuelle
-- PAYE Return mensuel MRA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.declarations_paye_mensuelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode DATE NOT NULL,

  total_salaires_bruts DECIMAL(15,2) DEFAULT 0,
  total_paye_retenu DECIMAL(12,2) DEFAULT 0,
  nb_employes INTEGER DEFAULT 0,

  date_limite DATE, -- 15 du mois suivant
  date_declaration DATE,
  date_paiement DATE,
  reference_mra VARCHAR(50),
  statut VARCHAR(20) DEFAULT 'a_faire',
  penalites DECIMAL(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: conges_employes
-- Suivi des congés légaux WRA 2019
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conges_employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  annee INTEGER NOT NULL,
  type_conge VARCHAR(30) NOT NULL, -- annuel | maladie | maternite | paternite | aidant | jury | sport

  -- Droits
  jours_droit INTEGER DEFAULT 0,
  jours_pris INTEGER DEFAULT 0,
  jours_restants INTEGER GENERATED ALWAYS AS (jours_droit - jours_pris) STORED,

  -- Accumulation maladie
  jours_accumules INTEGER DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: factures_interco_paie
-- Factures de refacturation des salaires entre sociétés
-- ============================================================
CREATE TABLE IF NOT EXISTS public.factures_interco_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_facture VARCHAR(30) UNIQUE NOT NULL, -- ex: 2210OCC
  societe_emettrice_id UUID REFERENCES public.societes(id),   -- OCC Maurice
  societe_destinataire_id UUID REFERENCES public.societes(id), -- OCC Malta

  periode DATE NOT NULL, -- mois de paie
  date_emission DATE NOT NULL,
  taux_change DECIMAL(10,4), -- EUR/MUR à la date

  -- Lignes (une par employé refacturé)
  lignes JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{employe_id, nom, poste, pct, salaire_net_mur, charges_mur, airbox_mur, ordi_mur, total_mur, total_eur}]

  marge_pct DECIMAL(5,4) DEFAULT 0.25, -- 25%
  montant_ht_mur DECIMAL(15,2) DEFAULT 0,
  montant_ht_eur DECIMAL(15,2) DEFAULT 0,
  tva_taux DECIMAL(5,4) DEFAULT 0.00, -- export = 0%
  montant_ttc_eur DECIMAL(15,2) DEFAULT 0,

  -- Compte inter-sociétés 451
  ecriture_debit VARCHAR(10) DEFAULT '451',
  ecriture_credit VARCHAR(10) DEFAULT '706',

  statut VARCHAR(20) DEFAULT 'emise', -- emise | payee
  date_paiement DATE,
  iban_paiement VARCHAR(50),
  swift VARCHAR(20),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FONCTION: calcul_bulletin_paie
-- Calcule automatiquement les cotisations selon paramètres MRA
-- ============================================================
CREATE OR REPLACE FUNCTION calcul_cotisations_paie(
  p_salaire_brut DECIMAL,
  p_annee INTEGER DEFAULT 2025
)
RETURNS JSONB AS $$
DECLARE
  params parametres_paie_mra%ROWTYPE;
  csg_taux DECIMAL;
  csg_sal DECIMAL;
  nsf_sal DECIMAL;
  result JSONB;
BEGIN
  SELECT * INTO params FROM parametres_paie_mra
  WHERE annee = p_annee AND actif = true
  ORDER BY mois_debut DESC LIMIT 1;

  -- CSG salarié : taux réduit si salaire ≤ 50 000 MUR
  IF p_salaire_brut <= params.csg_seuil_taux_reduit THEN
    csg_taux := params.csg_salarie_taux_reduit;
  ELSE
    csg_taux := params.csg_salarie_taux_plein;
  END IF;

  csg_sal := ROUND(p_salaire_brut * csg_taux);
  nsf_sal := ROUND(p_salaire_brut * params.nsf_salarie);

  result := jsonb_build_object(
    'csg_taux', csg_taux,
    'csg_salarie', csg_sal,
    'nsf_salarie', nsf_sal,
    'csg_patronal', ROUND(p_salaire_brut * params.csg_patronal),
    'nsf_patronal', ROUND(p_salaire_brut * params.nsf_patronal),
    'training_levy', ROUND(p_salaire_brut * params.training_levy),
    'total_deductions_salarie', csg_sal + nsf_sal,
    'total_charges_patronales', ROUND(p_salaire_brut * (params.csg_patronal + params.nsf_patronal + params.training_levy))
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FONCTION: verif_conformite_salaire
-- Vérifie conformité WRA — alerte si salaire < minimum
-- ============================================================
CREATE OR REPLACE FUNCTION verif_conformite_salaire(
  p_salaire_base DECIMAL,
  p_annee INTEGER DEFAULT 2025
)
RETURNS JSONB AS $$
DECLARE
  params parametres_paie_mra%ROWTYPE;
  alertes JSONB DEFAULT '[]';
BEGIN
  SELECT * INTO params FROM parametres_paie_mra WHERE annee = p_annee AND actif = true LIMIT 1;

  IF p_salaire_base < params.salaire_minimum_national THEN
    alertes := alertes || jsonb_build_object(
      'type', 'salaire_minimum',
      'message', 'Salaire inférieur au minimum légal MRA 2025 (' || params.salaire_minimum_national || ' MUR)',
      'niveau', 'critique'
    );
  END IF;

  RETURN jsonb_build_object('conforme', jsonb_array_length(alertes) = 0, 'alertes', alertes);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEW: recap_paie_mensuelle
-- Vue consolidée pour N8N et dashboard
-- ============================================================
CREATE OR REPLACE VIEW recap_paie_mensuelle AS
SELECT
  bp.periode,
  s.code AS societe,
  e.code AS employe_code,
  e.nom || ' ' || e.prenom AS employe_nom,
  e.poste,
  bp.salaire_brut,
  bp.total_deductions,
  bp.salaire_net,
  bp.total_charges_patronales,
  bp.salaire_brut + bp.total_charges_patronales AS cout_total_employeur,
  bp.pct_refacturation,
  bp.montant_refacture_mur,
  bp.statut,
  bp.anomalies
FROM bulletins_paie bp
JOIN employes e ON bp.employe_id = e.id
JOIN societes s ON bp.societe_id = s.id;

-- ============================================================
-- VIEW: tableau_declarations_mra
-- Toutes les déclarations dues avec alertes deadline
-- ============================================================
CREATE OR REPLACE VIEW tableau_declarations_mra AS
SELECT
  'CSG/NSF' AS type_declaration,
  s.code AS societe,
  dcm.periode,
  dcm.date_limite,
  dcm.total_a_remettre_mra AS montant,
  dcm.statut,
  CASE
    WHEN dcm.statut = 'a_faire' AND dcm.date_limite < CURRENT_DATE THEN '🔴 EN RETARD'
    WHEN dcm.statut = 'a_faire' AND dcm.date_limite <= CURRENT_DATE + 7 THEN '🟡 URGENT'
    WHEN dcm.statut = 'a_faire' THEN '⚪ À FAIRE'
    ELSE '✅ OK'
  END AS alerte
FROM declarations_csg_mensuelle dcm
JOIN societes s ON dcm.societe_id = s.id

UNION ALL

SELECT
  'PAYE' AS type_declaration,
  s.code AS societe,
  dpm.periode,
  dpm.date_limite,
  dpm.total_paye_retenu AS montant,
  dpm.statut,
  CASE
    WHEN dpm.statut = 'a_faire' AND dpm.date_limite < CURRENT_DATE THEN '🔴 EN RETARD'
    WHEN dpm.statut = 'a_faire' AND dpm.date_limite <= CURRENT_DATE + 7 THEN '🟡 URGENT'
    WHEN dpm.statut = 'a_faire' THEN '⚪ À FAIRE'
    ELSE '✅ OK'
  END AS alerte
FROM declarations_paye_mensuelle dpm
JOIN societes s ON dpm.societe_id = s.id

ORDER BY periode DESC, type_declaration;

-- ============================================================
-- INDEXES paie
-- ============================================================
CREATE INDEX idx_bulletins_periode ON bulletins_paie(periode);
CREATE INDEX idx_bulletins_employe ON bulletins_paie(employe_id);
CREATE INDEX idx_bulletins_statut ON bulletins_paie(statut);
CREATE INDEX idx_employes_actifs ON employes(societe_id) WHERE date_depart IS NULL;
CREATE INDEX idx_conges_employe_annee ON conges_employes(employe_id, annee);


-- ============================================================

-- ============================================================
-- Index et RLS pour les tables paie TIBOK-COMPTA
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_employes_societe ON public.employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_employe ON public.bulletins_paie(employe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_periode ON public.bulletins_paie(periode);
CREATE INDEX IF NOT EXISTS idx_bulletins_societe ON public.bulletins_paie(societe_id);
CREATE INDEX IF NOT EXISTS idx_conges_employes_emp ON public.conges_employes(employe_id);
CREATE INDEX IF NOT EXISTS idx_factures_interco ON public.factures_interco_paie(bulletin_id);

ALTER TABLE IF EXISTS public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parametres_paie_mra ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bulletins_paie ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conges_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.factures_interco_paie ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "employes_auth_016" ON public.employes FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "bulletins_auth_016" ON public.bulletins_paie FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "params_mra_auth" ON public.parametres_paie_mra FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "conges_employes_auth" ON public.conges_employes FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "interco_auth" ON public.factures_interco_paie FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
