-- ============================================================
-- LEXORA — Migration 010: Financial modules
-- Multi-bank accounts, Bilans, Tableaux de bord,
-- Prévisionnels, Simulations, Notifications v2, Cron logs
-- ============================================================

-- ============================================================
-- 1. COMPTES BANCAIRES (enhanced)
-- ============================================================
DROP TABLE IF EXISTS public.comptes_bancaires;
CREATE TABLE public.comptes_bancaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  banque TEXT NOT NULL,
  nom_compte TEXT,
  numero_compte TEXT,
  iban TEXT,
  swift TEXT,
  devise TEXT DEFAULT 'MUR',
  compte_comptable TEXT,
  solde_actuel NUMERIC(15,2) DEFAULT 0,
  date_dernier_releve DATE,
  solde_dernier_releve NUMERIC(15,2) DEFAULT 0,
  compte_principal BOOLEAN DEFAULT false,
  actif BOOLEAN DEFAULT true,
  ordre_affichage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comptes_bancaires_societe ON public.comptes_bancaires(societe_id);

-- ============================================================
-- 2. RELEVES BANCAIRES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.releves_bancaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  compte_bancaire_id UUID REFERENCES public.comptes_bancaires(id) NOT NULL,
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  periode TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  solde_ouverture NUMERIC(15,2) DEFAULT 0,
  solde_cloture NUMERIC(15,2) DEFAULT 0,
  total_debits NUMERIC(15,2) DEFAULT 0,
  total_credits NUMERIC(15,2) DEFAULT 0,
  document_id UUID REFERENCES public.documents(id),
  transactions_json JSONB,
  anomalies_json JSONB,
  statut_rapprochement TEXT DEFAULT 'en_attente' CHECK (statut_rapprochement IN ('en_attente','en_cours','equilibre','ecart_detecte')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. TRANSACTIONS BANCAIRES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions_bancaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  releve_id UUID REFERENCES public.releves_bancaires(id),
  compte_bancaire_id UUID REFERENCES public.comptes_bancaires(id) NOT NULL,
  societe_id UUID REFERENCES public.societes(id) NOT NULL,
  date_transaction DATE NOT NULL,
  date_valeur DATE,
  libelle_banque TEXT NOT NULL,
  reference TEXT,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  solde_apres NUMERIC(15,2),
  tiers_identifie TEXT,
  compte_comptable TEXT,
  libelle_comptable TEXT,
  type_transaction TEXT,
  document_lie_id UUID REFERENCES public.documents(id),
  statut_lettrage TEXT DEFAULT 'a_lettrer' CHECK (statut_lettrage IN ('a_lettrer','lettre','justifie','a_verifier')),
  type_anomalie TEXT,
  anomalie_description TEXT,
  anomalie_niveau TEXT CHECK (anomalie_niveau IN ('critique','important','informatif')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. BILANS OFFICIELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bilans_officiels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  exercice TEXT NOT NULL,
  date_cloture DATE NOT NULL,
  -- ACTIF NON COURANT
  immobilisations_corporelles NUMERIC(15,2) DEFAULT 0,
  immobilisations_incorporelles NUMERIC(15,2) DEFAULT 0,
  amortissements NUMERIC(15,2) DEFAULT 0,
  investissements_lt NUMERIC(15,2) DEFAULT 0,
  total_actif_non_courant NUMERIC(15,2) DEFAULT 0,
  -- ACTIF COURANT
  stocks NUMERIC(15,2) DEFAULT 0,
  creances_clients NUMERIC(15,2) DEFAULT 0,
  autres_creances NUMERIC(15,2) DEFAULT 0,
  tresorerie NUMERIC(15,2) DEFAULT 0,
  tresorerie_detail_json JSONB,
  total_actif_courant NUMERIC(15,2) DEFAULT 0,
  total_actif NUMERIC(15,2) DEFAULT 0,
  -- CAPITAUX PROPRES
  capital_social NUMERIC(15,2) DEFAULT 0,
  reserves NUMERIC(15,2) DEFAULT 0,
  report_a_nouveau NUMERIC(15,2) DEFAULT 0,
  resultat_exercice NUMERIC(15,2) DEFAULT 0,
  total_capitaux_propres NUMERIC(15,2) DEFAULT 0,
  -- PASSIF NON COURANT
  emprunts_lt NUMERIC(15,2) DEFAULT 0,
  impots_differes NUMERIC(15,2) DEFAULT 0,
  total_passif_non_courant NUMERIC(15,2) DEFAULT 0,
  -- PASSIF COURANT
  dettes_fournisseurs NUMERIC(15,2) DEFAULT 0,
  tva_a_payer NUMERIC(15,2) DEFAULT 0,
  csg_nsf_a_payer NUMERIC(15,2) DEFAULT 0,
  paye_a_payer NUMERIC(15,2) DEFAULT 0,
  emprunts_ct NUMERIC(15,2) DEFAULT 0,
  autres_dettes_ct NUMERIC(15,2) DEFAULT 0,
  total_passif_courant NUMERIC(15,2) DEFAULT 0,
  total_passif NUMERIC(15,2) DEFAULT 0,
  notes_json JSONB,
  statut TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','finalise','audite')),
  publie_client BOOLEAN DEFAULT false,
  date_publication TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLEAUX DE BORD
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tableaux_de_bord (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  periode TEXT NOT NULL,
  type_periode TEXT CHECK (type_periode IN ('mensuel','trimestriel','annuel')),
  tresorerie_consolidee NUMERIC(15,2) DEFAULT 0,
  tresorerie_par_compte JSONB,
  ratio_liquidite NUMERIC(5,2),
  score_liquidite TEXT,
  ca_ht NUMERIC(15,2) DEFAULT 0,
  marge_brute_pct NUMERIC(5,2),
  benefice_net NUMERIC(15,2) DEFAULT 0,
  marge_nette_pct NUMERIC(5,2),
  ebitda NUMERIC(15,2) DEFAULT 0,
  roe_pct NUMERIC(5,2),
  score_rentabilite TEXT,
  ratio_dettes_cp NUMERIC(5,2),
  autonomie_financiere_pct NUMERIC(5,2),
  score_structure TEXT,
  dso_jours NUMERIC(5,1),
  dpo_jours NUMERIC(5,1),
  burn_rate NUMERIC(15,2) DEFAULT 0,
  runway_mois NUMERIC(5,1),
  score_efficacite TEXT,
  score_global TEXT,
  conseil_ia TEXT,
  publie_client BOOLEAN DEFAULT false,
  genere_par TEXT DEFAULT 'manuel' CHECK (genere_par IN ('manuel','cron','ia')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. PREVISIONNELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.previsionnels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  type_periode TEXT CHECK (type_periode IN ('mensuel','trimestriel','annuel')),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  prev_ca NUMERIC(15,2) DEFAULT 0,
  prev_charges NUMERIC(15,2) DEFAULT 0,
  prev_resultat NUMERIC(15,2) DEFAULT 0,
  prev_tresorerie_consolidee NUMERIC(15,2) DEFAULT 0,
  prev_tresorerie_par_compte JSONB,
  prev_tva NUMERIC(15,2) DEFAULT 0,
  prev_detail_json JSONB,
  reel_ca NUMERIC(15,2),
  reel_charges NUMERIC(15,2),
  reel_tresorerie_consolidee NUMERIC(15,2),
  ecart_ca_pct NUMERIC(5,2),
  ecart_tresorerie_pct NUMERIC(5,2),
  analyse_ia TEXT,
  genere_par TEXT DEFAULT 'manuel' CHECK (genere_par IN ('manuel','cron')),
  visible_client BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. SIMULATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.simulations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  cree_par_type TEXT CHECK (cree_par_type IN ('comptable','client')),
  cree_par_id UUID,
  titre TEXT NOT NULL,
  description TEXT,
  type_simulation TEXT CHECK (type_simulation IN ('nouveau_client','embauche','investissement','variation_prix','perte_client','expansion','autre')),
  parametres_json JSONB NOT NULL,
  impact_m1_m3 JSONB,
  impact_m4_m12 JSONB,
  impact_tresorerie_par_compte JSONB,
  point_mort_mois INTEGER,
  recommandation TEXT,
  verdict TEXT,
  scenario_pessimiste JSONB,
  scenario_base JSONB,
  scenario_optimiste JSONB,
  score_opportunite INTEGER,
  statut TEXT DEFAULT 'brouillon',
  visible_comptable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. NOTIFICATIONS V2
-- ============================================================
-- Drop old if exists, create new
DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  destinataire_id UUID,
  destinataire_type TEXT CHECK (destinataire_type IN ('client','comptable')),
  societe_id UUID REFERENCES public.societes(id),
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  message TEXT NOT NULL,
  niveau TEXT DEFAULT 'info' CHECK (niveau IN ('critique','important','info')),
  lu BOOLEAN DEFAULT false,
  envoye_app BOOLEAN DEFAULT false,
  envoye_whatsapp BOOLEAN DEFAULT false,
  envoye_email BOOLEAN DEFAULT false,
  cron_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_dest ON public.notifications(destinataire_id);
CREATE INDEX idx_notifications_lu ON public.notifications(lu);

-- ============================================================
-- 9. CRON LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  statut TEXT DEFAULT 'running' CHECK (statut IN ('running','success','error','partial')),
  nb_societes_traitees INTEGER DEFAULT 0,
  nb_alertes_creees INTEGER DEFAULT 0,
  nb_notifications_envoyees INTEGER DEFAULT 0,
  erreurs JSONB,
  details JSONB
);

-- ============================================================
-- 10. UPDATE DOCUMENTS — add publie_client
-- ============================================================
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS publie_client BOOLEAN DEFAULT false;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS date_publication TIMESTAMPTZ;

-- ============================================================
-- 11. RLS for all new tables
-- ============================================================
ALTER TABLE public.comptes_bancaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releves_bancaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions_bancaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bilans_officiels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tableaux_de_bord ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previsionnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

-- Simple RLS: comptables + admin can manage everything
CREATE POLICY "manage_comptes_bancaires" ON public.comptes_bancaires FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_releves" ON public.releves_bancaires FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_transactions" ON public.transactions_bancaires FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_bilans" ON public.bilans_officiels FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_tdb" ON public.tableaux_de_bord FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_prev" ON public.previsionnels FOR ALL USING (public.get_my_role() IN ('admin','comptable','comptable_dedie'));
CREATE POLICY "manage_sims" ON public.simulations FOR ALL USING (true);
CREATE POLICY "manage_notifs" ON public.notifications FOR ALL USING (true);
CREATE POLICY "manage_cron_logs" ON public.cron_logs FOR ALL USING (public.get_my_role() IN ('admin','comptable'));

-- Clients can read published content
CREATE POLICY "clients_read_bilans" ON public.bilans_officiels FOR SELECT USING (publie_client = true AND public.get_my_role() IN ('client_admin'));
CREATE POLICY "clients_read_tdb" ON public.tableaux_de_bord FOR SELECT USING (publie_client = true AND public.get_my_role() IN ('client_admin'));
CREATE POLICY "clients_read_prev" ON public.previsionnels FOR SELECT USING (visible_client = true AND public.get_my_role() IN ('client_admin'));

-- ============================================================
-- 12. VIEW: Trésorerie consolidée
-- ============================================================
CREATE OR REPLACE VIEW public.tresorerie_consolidee AS
SELECT
  s.id as societe_id,
  s.nom as societe_nom,
  SUM(CASE WHEN cb.devise = 'MUR' THEN cb.solde_actuel ELSE 0 END) as total_mur,
  SUM(CASE WHEN cb.devise = 'EUR' THEN cb.solde_actuel ELSE 0 END) as total_eur,
  SUM(CASE WHEN cb.devise = 'GBP' THEN cb.solde_actuel ELSE 0 END) as total_gbp,
  COUNT(cb.id) as nb_comptes,
  MAX(cb.date_dernier_releve) as date_derniere_maj
FROM public.societes s
LEFT JOIN public.comptes_bancaires cb ON cb.societe_id = s.id AND cb.actif = true
GROUP BY s.id, s.nom;
