-- ============================================================
-- Migration 015: RH, Paie, Pointage, Congés, Juridique
-- Fusion TIBOK-COMPTA dans Lexora
-- ============================================================

-- EMPLOYES
CREATE TABLE IF NOT EXISTS public.employes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  code TEXT UNIQUE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  poste TEXT,
  date_arrivee DATE NOT NULL DEFAULT CURRENT_DATE,
  date_depart DATE,
  actif BOOLEAN GENERATED ALWAYS AS (date_depart IS NULL) STORED,
  salaire_base NUMERIC(15,2) NOT NULL DEFAULT 0,
  devise TEXT DEFAULT 'MUR',
  transport_allowance NUMERIC(15,2) DEFAULT 0,
  petrol_allowance NUMERIC(15,2) DEFAULT 0,
  pct_refacturation NUMERIC(5,2) DEFAULT 0,
  societe_refacturation_id UUID REFERENCES public.societes(id),
  csg_categorie TEXT DEFAULT 'A' CHECK (csg_categorie IN ('A','B')),
  nic_number TEXT,
  npf_number TEXT,
  tan_number TEXT,
  bank_account TEXT,
  bank_name TEXT,
  role TEXT DEFAULT 'salarie' CHECK (role IN ('salarie','manager','rh','admin','direction')),
  date_naissance DATE,
  genre TEXT DEFAULT 'M' CHECK (genre IN ('M','F')),
  statut_familial TEXT DEFAULT 'celibataire',
  nb_enfants INTEGER DEFAULT 0,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARAMETRES PAIE MRA (par societe + exercice)
CREATE TABLE IF NOT EXISTS public.parametres_paie_mra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  exercice TEXT NOT NULL DEFAULT '2024-2025',
  csg_seuil_taux_reduit NUMERIC(15,2) DEFAULT 50000,
  csg_salarie_taux_reduit NUMERIC(6,4) DEFAULT 0.015,
  csg_salarie_taux_plein NUMERIC(6,4) DEFAULT 0.030,
  csg_patronal NUMERIC(6,4) DEFAULT 0.060,
  nsf_salarie NUMERIC(6,4) DEFAULT 0.015,
  nsf_patronal NUMERIC(6,4) DEFAULT 0.025,
  training_levy NUMERIC(6,4) DEFAULT 0.010,
  prgf_patronal_par_jour NUMERIC(8,2) DEFAULT 4.50,
  paye_seuil_exoneration NUMERIC(15,2) DEFAULT 390000,
  paye_taux_1 NUMERIC(6,4) DEFAULT 0.10,
  paye_seuil_taux_2 NUMERIC(15,2) DEFAULT 650000,
  paye_taux_2 NUMERIC(6,4) DEFAULT 0.15,
  salaire_minimum NUMERIC(15,2) DEFAULT 11575,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paramètres par défaut 2024-2025
INSERT INTO public.parametres_paie_mra (exercice) VALUES ('2024-2025') ON CONFLICT DO NOTHING;

-- BULLETINS DE PAIE
CREATE TABLE IF NOT EXISTS public.bulletins_paie (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID REFERENCES public.societes(id),
  periode TEXT NOT NULL, -- YYYY-MM
  jours_travailles INTEGER DEFAULT 26,
  heures_sup NUMERIC(6,2) DEFAULT 0,
  salaire_base NUMERIC(15,2) NOT NULL,
  transport_allowance NUMERIC(15,2) DEFAULT 0,
  petrol_allowance NUMERIC(15,2) DEFAULT 0,
  primes_variables NUMERIC(15,2) DEFAULT 0,
  avances NUMERIC(15,2) DEFAULT 0,
  autres_deductions NUMERIC(15,2) DEFAULT 0,
  salaire_brut NUMERIC(15,2) NOT NULL,
  csg_taux NUMERIC(6,4),
  csg_salarie NUMERIC(15,2) DEFAULT 0,
  nsf_salarie NUMERIC(15,2) DEFAULT 0,
  paye NUMERIC(15,2) DEFAULT 0,
  total_deductions NUMERIC(15,2) DEFAULT 0,
  salaire_net NUMERIC(15,2) NOT NULL,
  csg_patronal NUMERIC(15,2) DEFAULT 0,
  nsf_patronal NUMERIC(15,2) DEFAULT 0,
  training_levy NUMERIC(15,2) DEFAULT 0,
  prgf NUMERIC(15,2) DEFAULT 0,
  total_charges_patronales NUMERIC(15,2) DEFAULT 0,
  cout_total_employeur NUMERIC(15,2) NOT NULL,
  statut TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide','paye','declare_mra')),
  date_validation DATE,
  date_paiement DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POINTAGES
CREATE TABLE IF NOT EXISTS public.pointages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  date_pointage DATE NOT NULL DEFAULT CURRENT_DATE,
  heure_entree TIME,
  heure_sortie TIME,
  type_entree TEXT DEFAULT 'manuel' CHECK (type_entree IN ('qr_code','gps','manuel','badge')),
  type_sortie TEXT DEFAULT 'manuel' CHECK (type_sortie IN ('qr_code','gps','manuel','badge')),
  latitude_entree NUMERIC(10,7),
  longitude_entree NUMERIC(10,7),
  latitude_sortie NUMERIC(10,7),
  longitude_sortie NUMERIC(10,7),
  duree_minutes INTEGER,
  statut_jour TEXT DEFAULT 'travaille',
  notes TEXT,
  valide_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HEURES TRAVAILLEES (calculées)
CREATE TABLE IF NOT EXISTS public.heures_travaillees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  jours_travailles INTEGER DEFAULT 0,
  heures_normales NUMERIC(8,2) DEFAULT 0,
  heures_sup_25 NUMERIC(8,2) DEFAULT 0,
  heures_sup_50 NUMERIC(8,2) DEFAULT 0,
  jours_feries_travailles INTEGER DEFAULT 0,
  absences_justifiees INTEGER DEFAULT 0,
  absences_injustifiees INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, periode)
);

-- DEMANDES CONGES
CREATE TABLE IF NOT EXISTS public.demandes_conges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  type_conge TEXT NOT NULL CHECK (type_conge IN ('AL','SL','UL','MAT','PAT','CAR','ABS')),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nb_jours INTEGER NOT NULL,
  motif TEXT,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuve','refuse','annule')),
  approuve_par UUID,
  date_approbation TIMESTAMPTZ,
  commentaire_manager TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SOLDES CONGES
CREATE TABLE IF NOT EXISTS public.soldes_conges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  conge_annuel_droit NUMERIC(6,2) DEFAULT 20,
  conge_annuel_pris NUMERIC(6,2) DEFAULT 0,
  conge_annuel_solde NUMERIC(6,2) DEFAULT 20,
  sick_leave_droit NUMERIC(6,2) DEFAULT 15,
  sick_leave_pris NUMERIC(6,2) DEFAULT 0,
  sick_leave_solde NUMERIC(6,2) DEFAULT 15,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, annee)
);

-- CATALOGUE PRIMES
CREATE TABLE IF NOT EXISTS public.catalogue_primes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  type TEXT DEFAULT 'fixe' CHECK (type IN ('fixe','variable_unitaire','commission','bonus_objectif','pourcentage_salaire')),
  montant_defaut NUMERIC(15,2) DEFAULT 0,
  taux_defaut NUMERIC(6,4),
  imposable BOOLEAN DEFAULT true,
  soumis_csg BOOLEAN DEFAULT true,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRIMES VARIABLES PAR MOIS
CREATE TABLE IF NOT EXISTS public.primes_variables_mois (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  catalogue_prime_id UUID REFERENCES public.catalogue_primes(id),
  periode TEXT NOT NULL,
  montant NUMERIC(15,2) NOT NULL,
  unite INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DECLARATIONS MRA CSG MENSUELLES
CREATE TABLE IF NOT EXISTS public.declarations_csg_mensuelle (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  periode TEXT NOT NULL,
  nb_employes INTEGER DEFAULT 0,
  total_salaires_bruts NUMERIC(15,2) DEFAULT 0,
  total_csg_salaries NUMERIC(15,2) DEFAULT 0,
  total_csg_patronal NUMERIC(15,2) DEFAULT 0,
  total_nsf_salaries NUMERIC(15,2) DEFAULT 0,
  total_nsf_patronal NUMERIC(15,2) DEFAULT 0,
  total_training_levy NUMERIC(15,2) DEFAULT 0,
  montant_total NUMERIC(15,2) DEFAULT 0,
  date_echeance DATE,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','soumis','paye')),
  reference_mra TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONTRATS EMPLOYES
CREATE TABLE IF NOT EXISTS public.contrats_employes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID REFERENCES public.societes(id),
  type_contrat TEXT NOT NULL CHECK (type_contrat IN ('CDI','CDD','Temps_partiel','Consultant','Stage','Saisonnier')),
  secteur TEXT DEFAULT 'general',
  date_debut DATE NOT NULL,
  date_fin DATE,
  salaire_brut NUMERIC(15,2),
  poste TEXT,
  html_content TEXT,
  statut TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','signe','expire','resilie')),
  token_signature TEXT UNIQUE,
  date_signature TIMESTAMPTZ,
  ip_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- JOURS FERIES
CREATE TABLE IF NOT EXISTS public.jours_feries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date_ferie DATE UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  pays TEXT DEFAULT 'MU',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jours fériés Maurice 2025
INSERT INTO public.jours_feries (date_ferie, nom) VALUES
('2025-01-01','Nouvel An'),('2025-01-02','Lendemain Nouvel An'),
('2025-02-01','Thaipoosam Cavadee'),('2025-02-12','Maha Shivaratree'),
('2025-03-12','Fête Nationale'),('2025-04-18','Vendredi Saint'),
('2025-05-01','Fête du Travail'),('2025-06-06','Eid ul Fitr'),
('2025-08-15','Assomption'),('2025-08-29','Ganesh Chaturthi'),
('2025-11-02','Divali'),('2025-11-01','Tous les Saints'),
('2025-11-02','Arrivée des Indiens Engagés'),('2025-12-25','Noël')
ON CONFLICT (date_ferie) DO NOTHING;

-- DOCUMENTS JURIDIQUES
CREATE TABLE IF NOT EXISTS public.documents_juridiques (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  type_document TEXT NOT NULL CHECK (type_document IN (
    'statuts','proces_verbal','resolution','contrat_commercial',
    'accord_actionnaires','pacte_associes','due_diligence',
    'rapport_kyc','valorisation','formalite_roc'
  )),
  titre TEXT NOT NULL,
  contenu_html TEXT,
  statut TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','valide','signe','archive')),
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT CLARA (conversations RH IA)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES public.employes(id),
  titre TEXT DEFAULT 'Nouvelle conversation',
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_employes_societe ON public.employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_employes_role ON public.employes(role);
CREATE INDEX IF NOT EXISTS idx_bulletins_employe ON public.bulletins_paie(employe_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_periode ON public.bulletins_paie(periode);
CREATE INDEX IF NOT EXISTS idx_bulletins_societe ON public.bulletins_paie(societe_id);
CREATE INDEX IF NOT EXISTS idx_pointages_employe ON public.pointages(employe_id);
CREATE INDEX IF NOT EXISTS idx_pointages_date ON public.pointages(date_pointage);
CREATE INDEX IF NOT EXISTS idx_conges_employe ON public.demandes_conges(employe_id);
CREATE INDEX IF NOT EXISTS idx_conges_statut ON public.demandes_conges(statut);
CREATE INDEX IF NOT EXISTS idx_contrats_employe ON public.contrats_employes(employe_id);

-- RLS (auth requis pour tout)
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_conges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soldes_conges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.primes_variables_mois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrats_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents_juridiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heures_travaillees ENABLE ROW LEVEL SECURITY;

-- Policies (auth requis)
DO $$ BEGIN
  CREATE POLICY "employes_auth" ON public.employes FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "bulletins_auth" ON public.bulletins_paie FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "pointages_auth" ON public.pointages FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "conges_auth" ON public.demandes_conges FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "soldes_auth" ON public.soldes_conges FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "primes_auth" ON public.primes_variables_mois FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "contrats_auth" ON public.contrats_employes FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "chat_auth" ON public.chat_conversations FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "juridique_auth" ON public.documents_juridiques FOR ALL USING (auth.uid() IS NOT NULL);
  CREATE POLICY "heures_auth" ON public.heures_travaillees FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
