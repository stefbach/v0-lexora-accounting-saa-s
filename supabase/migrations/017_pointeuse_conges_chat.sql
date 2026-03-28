-- ============================================================
-- Migration 017: Pointage, Congés détaillés, Chat CLARA
-- Source: tibok-compta Partie 3 (pointeuse)
-- ============================================================

DROP TABLE IF EXISTS public.chat_conversations CASCADE;
DROP TABLE IF EXISTS public.jours_feries CASCADE;
DROP TABLE IF EXISTS public.soldes_conges CASCADE;
DROP TABLE IF EXISTS public.demandes_conges CASCADE;
DROP TABLE IF EXISTS public.primes_variables_mois CASCADE;
DROP TABLE IF EXISTS public.catalogue_primes CASCADE;
DROP TABLE IF EXISTS public.heures_travaillees CASCADE;
DROP TABLE IF EXISTS public.pointages CASCADE;

-- PARTIE 3 : POINTEUSE & CONGÉS (supabase-pointeuse.sql)
-- ============================================================

-- ============================================================
-- TIBOK PAIE — Tables complémentaires
-- Pointeuse + Primes + Congés + Auth 3 rôles
-- ============================================================

-- ============================================================
-- Extension table employes
-- ============================================================
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS genre VARCHAR(5) DEFAULT 'M';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS statut_familial VARCHAR(20) DEFAULT 'celibataire';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS nb_enfants INTEGER DEFAULT 0;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS tan_number VARCHAR(20);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS telephone VARCHAR(20);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'salarie'; -- salarie | manager | rh | admin
ALTER TABLE employes ADD COLUMN IF NOT EXISTS contrat_type VARCHAR(20) DEFAULT 'CDI';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS contrat_url TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.employes(id);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS departement VARCHAR(100);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS lieu_travail VARCHAR(100);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS gps_latitude DECIMAL(10,8);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS gps_longitude DECIMAL(11,8);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS gps_rayon_metres INTEGER DEFAULT 100;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS solde_conges_ouverture DECIMAL(5,2) DEFAULT 0;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS solde_sick_ouverture DECIMAL(5,2) DEFAULT 0;

-- ============================================================
-- TABLE: pointages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS pointages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  date_pointage DATE NOT NULL,
  heure_entree TIME,
  heure_sortie TIME,
  heure_pause_debut TIME,
  heure_pause_fin TIME,
  type_pointage VARCHAR(20) DEFAULT 'manuel',
  -- qr_code | gps | manuel | badge
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  distance_bureau DECIMAL(8,2), -- mètres
  valide BOOLEAN DEFAULT true,
  correction BOOLEAN DEFAULT false,
  corrected_by UUID REFERENCES public.employes(id),
  correction_motif TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pointages_employe_date
  ON pointages(employe_id, date_pointage);

-- ============================================================
-- TABLE: heures_travaillees
-- Calculé automatiquement depuis pointages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS heures_travaillees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  date DATE NOT NULL,
  heures_normales DECIMAL(5,2) DEFAULT 0,
  heures_ot_1_5 DECIMAL(5,2) DEFAULT 0,
  heures_ot_2 DECIMAL(5,2) DEFAULT 0,
  montant_ot DECIMAL(10,2) DEFAULT 0,
  taux_horaire_base DECIMAL(10,2) DEFAULT 0,
  statut_jour VARCHAR(20) DEFAULT 'travaille',
  -- travaille | absent_justifie | absent_injustifie | conge_annuel
  -- sick_leave | maternite | paternite | ferie | sans_solde
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, date)
);

-- ============================================================
-- TABLE: catalogue_primes
-- Primes configurables par société
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS catalogue_primes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id),
  code VARCHAR(30) UNIQUE NOT NULL,
  libelle VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  -- fixe | variable_unitaire | commission | bonus_objectif | pourcentage_salaire

  -- Pour type = fixe
  montant_fixe DECIMAL(12,2),

  -- Pour type = variable_unitaire / commission
  tarif_unitaire DECIMAL(12,2),
  unite_libelle VARCHAR(50), -- "consultation" | "vente" | "acte" | "score"

  -- Pour type = bonus_objectif
  objectif_valeur DECIMAL(12,2),
  bonus_si_atteint DECIMAL(12,2),
  bonus_type VARCHAR(10), -- montant | pourcentage

  -- Pour type = pourcentage_salaire
  pourcentage DECIMAL(5,4),

  -- Source des données (variable)
  source_donnee VARCHAR(50) DEFAULT 'saisie_manager',
  -- saisie_manager | tibok_api | auto | import_excel

  -- Applicabilité
  applicable_postes TEXT[], -- NULL = tous les postes
  periode VARCHAR(20) DEFAULT 'mensuel', -- mensuel | trimestriel | annuel

  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exemples primes catalogue
INSERT INTO catalogue_primes (societe_id, code, libelle, type, tarif_unitaire, unite_libelle, source_donnee)
SELECT s.id, p.code, p.libelle, p.type, p.tarif, p.unite, p.source
FROM societes s, (VALUES
  ('TIBOK_CONSULT', 'Prime consultation TIBOK', 'variable_unitaire', 150, 'consultation', 'tibok_api'),
  ('TIBOK_ABONNEMENT', 'Prime signature abonnement B2B', 'variable_unitaire', 500, 'contrat signé', 'saisie_manager'),
  ('OCC_COACH', 'Prime accompagnement patient', 'variable_unitaire', 200, 'patient suivi', 'saisie_manager'),
  ('BPO_PERF', 'Prime performance BPO', 'variable_unitaire', 100, 'dossier traité', 'saisie_manager'),
  ('NHS_PATIENT', 'Commission patient NHS S2', 'variable_unitaire', 63000, 'patient (1200 EUR)', 'saisie_manager')
) AS p(code, libelle, type, tarif, unite, source)
WHERE s.code = 'TIBOK' ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- TABLE: primes_variables_mois
-- Saisie manager + approbation RH
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS primes_variables_mois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  prime_id UUID REFERENCES catalogue_primes(id) NOT NULL,
  periode DATE NOT NULL,

  quantite DECIMAL(10,2) DEFAULT 1,
  tarif_unitaire_applique DECIMAL(12,2),
  montant DECIMAL(12,2), -- calculé : quantite × tarif

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
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS demandes_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  type_conge VARCHAR(30) NOT NULL,
  -- AL | SL | UL | MAT | PAT | CAR | ABS

  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nb_jours DECIMAL(5,2),
  demi_journee BOOLEAN DEFAULT false,
  matin_ou_apres_midi VARCHAR(10), -- matin | apres_midi

  motif TEXT,
  document_url TEXT, -- certificat médical

  statut VARCHAR(20) DEFAULT 'en_attente',
  -- en_attente | approuve | refuse | annule

  approuve_par UUID REFERENCES public.employes(id),
  date_decision TIMESTAMPTZ,
  notes_manager TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: soldes_conges
-- Soldes par employé par année
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS soldes_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  annee INTEGER NOT NULL,

  -- Congés annuels
  al_droit DECIMAL(5,2) DEFAULT 15,
  al_pris DECIMAL(5,2) DEFAULT 0,
  al_reporte DECIMAL(5,2) DEFAULT 0,
  al_solde DECIMAL(5,2) GENERATED ALWAYS AS (al_droit + al_reporte - al_pris) STORED,

  -- Sick leave
  sl_droit DECIMAL(5,2) DEFAULT 15,
  sl_pris DECIMAL(5,2) DEFAULT 0,
  sl_accumule DECIMAL(5,2) DEFAULT 0, -- non utilisés années précédentes
  sl_solde DECIMAL(5,2) GENERATED ALWAYS AS (sl_droit + sl_accumule - sl_pris) STORED,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employe_id, annee)
);

-- ============================================================
-- TABLE: jours_feries
-- Calendrier jours fériés Maurice 2025-2026
-- ============================================================
CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS jours_feries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  libelle VARCHAR(100) NOT NULL,
  pays VARCHAR(5) DEFAULT 'MU'
);

-- Jours fériés Maurice 2025
INSERT INTO jours_feries (date, libelle) VALUES
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
  ('2025-12-26', 'Noël (2ème jour)')
ON CONFLICT (date) DO NOTHING;

-- ============================================================
-- FONCTION: calculer_ot_journalier
-- Calcule OT depuis heures pointées
-- ============================================================
CREATE OR REPLACE FUNCTION calculer_ot_journalier(
  p_employe_id UUID,
  p_date DATE,
  p_heure_entree TIME,
  p_heure_sortie TIME,
  p_heure_pause_minutes INTEGER DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
  heures_totales DECIMAL(5,2);
  heures_pause DECIMAL(5,2);
  heures_effectives DECIMAL(5,2);
  heures_std DECIMAL(5,2) := 9.0; -- 9h/jour standard
  heures_normales DECIMAL(5,2);
  heures_ot_1_5 DECIMAL(5,2) := 0;
  heures_ot_2 DECIMAL(5,2) := 0;
  taux_horaire DECIMAL(10,2);
  salaire_base DECIMAL(12,2);
  est_ferie BOOLEAN;
  montant_ot DECIMAL(10,2) := 0;
BEGIN
  -- Vérifier si jour férié
  SELECT COUNT(*) > 0 INTO est_ferie
  FROM jours_feries WHERE date = p_date;

  -- Heures totales
  heures_totales := EXTRACT(EPOCH FROM (p_heure_sortie - p_heure_entree)) / 3600;
  heures_pause := p_heure_pause_minutes / 60.0;
  heures_effectives := heures_totales - heures_pause;

  -- Taux horaire
  SELECT salaire_base INTO salaire_base FROM employes WHERE id = p_employe_id;
  taux_horaire := salaire_base / (45.0 * 52.0 / 12.0);

  -- Calcul OT
  IF est_ferie THEN
    -- Jour férié : tout est à 2x
    heures_normales := 0;
    heures_ot_2 := heures_effectives;
    montant_ot := heures_ot_2 * taux_horaire * 2;
  ELSE
    heures_normales := LEAST(heures_effectives, heures_std);
    IF heures_effectives > heures_std THEN
      DECLARE depassement DECIMAL(5,2) := heures_effectives - heures_std;
      BEGIN
        -- 2 premières heures OT à 1.5x
        heures_ot_1_5 := LEAST(depassement, 2.0);
        -- Au-delà à 2x
        heures_ot_2 := GREATEST(depassement - 2.0, 0);
        montant_ot := (heures_ot_1_5 * taux_horaire * 1.5) + (heures_ot_2 * taux_horaire * 2);
      END;
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
-- FONCTION: calculer_solde_conges_annuels
-- Selon ancienneté WRA 2019
-- ============================================================
CREATE OR REPLACE FUNCTION calculer_droit_conges(
  p_date_arrivee DATE,
  p_annee INTEGER DEFAULT 2025
)
RETURNS INTEGER AS $$
DECLARE
  annees_service DECIMAL(5,2);
BEGIN
  annees_service := (DATE(p_annee || '-12-31') - p_date_arrivee) / 365.25;
  IF annees_service >= 5 THEN
    RETURN 20; -- WRA 2019 : 20j après 5 ans
  ELSE
    RETURN 15; -- Standard
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEW: tableau_bord_rh
-- Vue consolidée pour interface RH
-- ============================================================
CREATE OR REPLACE VIEW tableau_bord_rh AS
SELECT
  s.code AS societe,
  COUNT(e.id) FILTER (WHERE e.date_depart IS NULL) AS employes_actifs,
  SUM(e.salaire_base) FILTER (WHERE e.date_depart IS NULL) AS masse_salariale_base,
  COUNT(dc.id) FILTER (WHERE dc.statut = 'en_attente') AS conges_en_attente,
  COUNT(dc.id) FILTER (WHERE dc.statut = 'en_attente' AND dc.created_at < NOW() - INTERVAL '48h') AS conges_urgents
FROM societes s
LEFT JOIN employes e ON e.societe_id = s.id
LEFT JOIN demandes_conges dc ON dc.employe_id = e.id
GROUP BY s.code, s.id;

-- ============================================================
-- VIEW: presences_aujourd_hui
-- Pour dashboard manager
-- ============================================================
CREATE OR REPLACE VIEW presences_aujourd_hui AS
SELECT
  e.id,
  e.code,
  e.prenom || ' ' || e.nom AS nom_complet,
  e.poste,
  p.heure_entree,
  p.heure_sortie,
  CASE
    WHEN p.heure_entree IS NOT NULL AND p.heure_sortie IS NULL THEN '🟢 En poste'
    WHEN p.heure_entree IS NOT NULL AND p.heure_sortie IS NOT NULL THEN '✅ Parti'
    WHEN dc.type_conge = 'SL' THEN '🤒 Maladie'
    WHEN dc.type_conge = 'AL' THEN '🏖️ Congé'
    WHEN dc.type_conge IS NOT NULL THEN '📋 ' || dc.type_conge
    ELSE '🔴 Absent'
  END AS statut,
  CASE
    WHEN p.heure_entree IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (COALESCE(p.heure_sortie, CURRENT_TIME) - p.heure_entree)) / 3600, 2)
    ELSE 0
  END AS heures_travaillees
FROM employes e
LEFT JOIN pointages p ON p.employe_id = e.id AND p.date_pointage = CURRENT_DATE
LEFT JOIN demandes_conges dc ON dc.employe_id = e.id
  AND CURRENT_DATE BETWEEN dc.date_debut AND dc.date_fin
  AND dc.statut = 'approuve'
WHERE e.date_depart IS NULL;


-- ============================================================
-- PARTIE 4 : CHAT CLARA (tables chat_conversations + messages)
-- ============================================================

-- Tables CLARA chatbot (SPEC-CHAT-RH)

CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
    titre TEXT,
    statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'ferme', 'escalade')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.IF NOT EXISTS rh_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES chat_conversations(id),
    employe_id UUID REFERENCES public.employes(id) ON DELETE CASCADE,
    sujet TEXT NOT NULL,
    description TEXT,
    priorite TEXT DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),
    statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
    assigne_a UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_chat_conv_employe ON chat_conversations(employe_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rh_tickets_employe ON rh_tickets(employe_id);
CREATE INDEX IF NOT EXISTS idx_rh_tickets_statut ON rh_tickets(statut);

-- RLS (Row Level Security)
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_tickets ENABLE ROW LEVEL SECURITY;

-- Policies : un employé ne voit que ses propres conversations
CREATE POLICY "employe_own_conversations" ON chat_conversations
    FOR ALL USING (
        employe_id IN (
            SELECT id FROM employes WHERE email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "employe_own_messages" ON chat_messages
    FOR ALL USING (
        conversation_id IN (
            SELECT id FROM chat_conversations
            WHERE employe_id IN (
                SELECT id FROM employes WHERE email = auth.jwt() ->> 'email'
            )
        )
    );

-- RH voit tout
CREATE POLICY "rh_all_conversations" ON chat_conversations
    FOR ALL USING (auth.jwt() ->> 'role' IN ('rh', 'admin'));

CREATE POLICY "rh_all_messages" ON chat_messages
    FOR ALL USING (auth.jwt() ->> 'role' IN ('rh', 'admin'));

CREATE POLICY "rh_all_tickets" ON rh_tickets
    FOR ALL USING (auth.jwt() ->> 'role' IN ('rh', 'admin'));

-- Rate limiting view : messages des 24 dernières heures par employé
CREATE OR REPLACE VIEW chat_rate_limit AS
SELECT
    e.id AS employe_id,
    e.email,
    COUNT(cm.id) AS messages_24h,
    50 AS limite_journaliere,
    COUNT(cm.id) >= 50 AS limite_atteinte
FROM employes e
LEFT JOIN chat_conversations cc ON cc.employe_id = e.id
LEFT JOIN chat_messages cm ON cm.conversation_id = cc.id
    AND cm.role = 'user'
    AND cm.created_at > NOW() - INTERVAL '24 hours'
GROUP BY e.id, e.email;

-- ============================================================
-- FIN DE LA MIGRATION 001_initial.sql
-- TIBOK COMPTA IA — Sprint 1
-- ============================================================


-- RLS
DO $$ BEGIN
  CREATE POLICY "pointages_auth_017" ON public.pointages FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "heures_auth_017" ON public.heures_travaillees FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "catalogue_primes_auth" ON public.catalogue_primes FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "primes_vars_auth" ON public.primes_variables_mois FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "demandes_conges_auth" ON public.demandes_conges FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "soldes_conges_auth" ON public.soldes_conges FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "chat_auth_017" ON public.chat_conversations FOR ALL USING (auth.uid() IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
