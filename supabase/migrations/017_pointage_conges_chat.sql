-- ============================================================
-- Migration 017 — Pointage, Congés détaillés, Chat RH
-- LEXORA — Module RH complémentaire
-- ============================================================

-- Nettoyage
DROP TABLE IF EXISTS public.rh_tickets CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_conversations CASCADE;
DROP TABLE IF EXISTS public.jours_feries CASCADE;
DROP TABLE IF EXISTS public.soldes_conges CASCADE;
DROP TABLE IF EXISTS public.demandes_conges CASCADE;
DROP TABLE IF EXISTS public.primes_variables_mois CASCADE;
DROP TABLE IF EXISTS public.catalogue_primes CASCADE;
DROP TABLE IF EXISTS public.heures_travaillees CASCADE;
DROP TABLE IF EXISTS public.pointages CASCADE;

-- ============================================================
-- Extension table employes (colonnes supplémentaires)
-- ============================================================
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS genre VARCHAR(5) DEFAULT 'M';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS statut_familial VARCHAR(20) DEFAULT 'celibataire';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nb_enfants INTEGER DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS tan_number VARCHAR(20);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS telephone VARCHAR(20);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS role_rh VARCHAR(20) DEFAULT 'salarie';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contrat_type VARCHAR(20) DEFAULT 'CDI';
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS contrat_url TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.employes(id);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS departement VARCHAR(100);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS lieu_travail VARCHAR(100);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS gps_latitude DECIMAL(10,8);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS gps_longitude DECIMAL(11,8);
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS gps_rayon_metres INTEGER DEFAULT 100;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS solde_conges_ouverture DECIMAL(5,2) DEFAULT 0;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS solde_sick_ouverture DECIMAL(5,2) DEFAULT 0;

-- ============================================================
-- TABLE: pointages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pointages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  date_pointage DATE NOT NULL,
  heure_entree TIME,
  heure_sortie TIME,
  heure_pause_debut TIME,
  heure_pause_fin TIME,
  type_pointage VARCHAR(20) DEFAULT 'manuel',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  distance_bureau DECIMAL(8,2),
  valide BOOLEAN DEFAULT true,
  correction BOOLEAN DEFAULT false,
  corrected_by UUID REFERENCES public.employes(id),
  correction_motif TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pointages_employe_date
  ON public.pointages(employe_id, date_pointage);

-- ============================================================
-- TABLE: heures_travaillees
-- ============================================================
CREATE TABLE IF NOT EXISTS public.heures_travaillees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  date DATE NOT NULL,
  heures_normales DECIMAL(5,2) DEFAULT 0,
  heures_ot_1_5 DECIMAL(5,2) DEFAULT 0,
  heures_ot_2 DECIMAL(5,2) DEFAULT 0,
  montant_ot DECIMAL(10,2) DEFAULT 0,
  taux_horaire_base DECIMAL(10,2) DEFAULT 0,
  statut_jour VARCHAR(20) DEFAULT 'travaille',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, date)
);

-- ============================================================
-- TABLE: catalogue_primes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.catalogue_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id),
  code VARCHAR(30) UNIQUE NOT NULL,
  libelle VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  montant_fixe DECIMAL(12,2),
  tarif_unitaire DECIMAL(12,2),
  unite_libelle VARCHAR(50),
  objectif_valeur DECIMAL(12,2),
  bonus_si_atteint DECIMAL(12,2),
  bonus_type VARCHAR(10),
  pourcentage DECIMAL(5,4),
  source_donnee VARCHAR(50) DEFAULT 'saisie_manager',
  applicable_postes TEXT[],
  periode VARCHAR(20) DEFAULT 'mensuel',
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: primes_variables_mois
-- ============================================================
CREATE TABLE IF NOT EXISTS public.primes_variables_mois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  prime_id UUID REFERENCES public.catalogue_primes(id) NOT NULL,
  periode DATE NOT NULL,
  quantite DECIMAL(10,2) DEFAULT 1,
  tarif_unitaire_applique DECIMAL(12,2),
  montant DECIMAL(12,2),
  saisi_par UUID REFERENCES public.employes(id),
  date_saisie TIMESTAMPTZ DEFAULT NOW(),
  approuve BOOLEAN DEFAULT false,
  approuve_par UUID REFERENCES public.employes(id),
  date_approbation TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, prime_id, periode)
);

-- ============================================================
-- TABLE: demandes_conges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.demandes_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  type_conge VARCHAR(30) NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nb_jours DECIMAL(5,2),
  demi_journee BOOLEAN DEFAULT false,
  matin_ou_apres_midi VARCHAR(10),
  motif TEXT,
  document_url TEXT,
  statut VARCHAR(20) DEFAULT 'en_attente',
  approuve_par UUID REFERENCES public.employes(id),
  date_decision TIMESTAMPTZ,
  notes_manager TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: soldes_conges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.soldes_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  annee INTEGER NOT NULL,
  al_droit DECIMAL(5,2) DEFAULT 15,
  al_pris DECIMAL(5,2) DEFAULT 0,
  al_reporte DECIMAL(5,2) DEFAULT 0,
  al_solde DECIMAL(5,2) GENERATED ALWAYS AS (al_droit + al_reporte - al_pris) STORED,
  sl_droit DECIMAL(5,2) DEFAULT 15,
  sl_pris DECIMAL(5,2) DEFAULT 0,
  sl_accumule DECIMAL(5,2) DEFAULT 0,
  sl_solde DECIMAL(5,2) GENERATED ALWAYS AS (sl_droit + sl_accumule - sl_pris) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, annee)
);

-- ============================================================
-- TABLE: jours_feries (Maurice 2025-2026)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jours_feries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  libelle VARCHAR(100) NOT NULL,
  pays VARCHAR(5) DEFAULT 'MU'
);

INSERT INTO public.jours_feries (date, libelle) VALUES
  ('2025-01-01', 'Nouvel An'),
  ('2025-02-01', 'Thaipoosam Cavadee'),
  ('2025-02-02', 'Thaipoosam Cavadee (2ème jour)'),
  ('2025-03-01', 'Indépendance'),
  ('2025-03-12', 'République'),
  ('2025-03-29', 'Ugaadi'),
  ('2025-04-14', 'Tamil New Year'),
  ('2025-05-01', 'Fête du Travail'),
  ('2025-08-15', 'Assomption'),
  ('2025-11-02', 'Tous Saints'),
  ('2025-12-25', 'Noël'),
  ('2025-12-26', 'Noël (2ème jour)'),
  ('2026-01-01', 'Nouvel An'),
  ('2026-02-10', 'Thaipoosam Cavadee'),
  ('2026-03-12', 'Indépendance & République'),
  ('2026-05-01', 'Fête du Travail'),
  ('2026-08-15', 'Assomption'),
  ('2026-11-02', 'Tous Saints'),
  ('2026-12-25', 'Noël')
ON CONFLICT (date) DO NOTHING;

-- ============================================================
-- TABLE: chat_conversations (Module RH CLARA)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  titre TEXT,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'ferme', 'escalade')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rh_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id),
  employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
  sujet TEXT NOT NULL,
  description TEXT,
  priorite TEXT DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
  assigne_a UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ============================================================
-- FONCTION: calculer_droit_conges (WRA 2019)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculer_droit_conges(
  p_date_arrivee DATE,
  p_annee INTEGER DEFAULT 2025
)
RETURNS INTEGER AS $$
DECLARE
  annees_service DECIMAL(5,2);
BEGIN
  annees_service := (DATE(p_annee || '-12-31') - p_date_arrivee) / 365.25;
  IF annees_service >= 5 THEN
    RETURN 20;
  ELSE
    RETURN 15;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FONCTION: calculer_ot_journalier
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculer_ot_journalier(
  p_employe_id UUID,
  p_date DATE,
  p_heure_entree TIME,
  p_heure_sortie TIME,
  p_heure_pause_minutes INTEGER DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
  heures_totales DECIMAL(5,2);
  heures_effectives DECIMAL(5,2);
  heures_std DECIMAL(5,2) := 9.0;
  heures_normales DECIMAL(5,2);
  heures_ot_1_5 DECIMAL(5,2) := 0;
  heures_ot_2 DECIMAL(5,2) := 0;
  taux_horaire DECIMAL(10,2);
  v_salaire_base DECIMAL(12,2);
  est_ferie BOOLEAN;
  montant_ot DECIMAL(10,2) := 0;
  depassement DECIMAL(5,2);
BEGIN
  SELECT COUNT(*) > 0 INTO est_ferie
  FROM public.jours_feries WHERE date = p_date;

  heures_totales := EXTRACT(EPOCH FROM (p_heure_sortie - p_heure_entree)) / 3600;
  heures_effectives := heures_totales - (p_heure_pause_minutes / 60.0);

  SELECT salaire_base INTO v_salaire_base FROM public.employes WHERE id = p_employe_id;
  taux_horaire := v_salaire_base / (45.0 * 52.0 / 12.0);

  IF est_ferie THEN
    heures_normales := 0;
    heures_ot_2 := heures_effectives;
    montant_ot := heures_ot_2 * taux_horaire * 2;
  ELSE
    heures_normales := LEAST(heures_effectives, heures_std);
    IF heures_effectives > heures_std THEN
      depassement := heures_effectives - heures_std;
      heures_ot_1_5 := LEAST(depassement, 2.0);
      heures_ot_2 := GREATEST(depassement - 2.0, 0);
      montant_ot := (heures_ot_1_5 * taux_horaire * 1.5) + (heures_ot_2 * taux_horaire * 2);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'heures_normales', heures_normales,
    'heures_ot_1_5', heures_ot_1_5,
    'heures_ot_2', heures_ot_2,
    'montant_ot', ROUND(montant_ot, 2),
    'taux_horaire', ROUND(taux_horaire, 2),
    'est_ferie', est_ferie
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_heures_employe ON public.heures_travaillees(employe_id, date);
CREATE INDEX IF NOT EXISTS idx_demandes_conges_emp ON public.demandes_conges(employe_id, statut);
CREATE INDEX IF NOT EXISTS idx_soldes_conges_emp ON public.soldes_conges(employe_id, annee);
CREATE INDEX IF NOT EXISTS idx_chat_conv_employe ON public.chat_conversations(employe_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rh_tickets_employe ON public.rh_tickets(employe_id);
CREATE INDEX IF NOT EXISTS idx_rh_tickets_statut ON public.rh_tickets(statut);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heures_travaillees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_primes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.primes_variables_mois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_conges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soldes_conges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jours_feries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "pointages_auth" ON public.pointages
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "heures_auth" ON public.heures_travaillees
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "catalogue_primes_read" ON public.catalogue_primes
    FOR SELECT USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "catalogue_primes_write" ON public.catalogue_primes
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "primes_vars_auth" ON public.primes_variables_mois
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "demandes_conges_auth" ON public.demandes_conges
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "soldes_conges_auth" ON public.soldes_conges
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "jours_feries_read" ON public.jours_feries
    FOR SELECT USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "chat_conv_auth" ON public.chat_conversations
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "chat_msg_auth" ON public.chat_messages
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "rh_tickets_auth" ON public.rh_tickets
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- FIN MIGRATION 017
-- ============================================================
