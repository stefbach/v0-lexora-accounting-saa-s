-- =============================================================================
-- 441_crm_prospection_init.sql
-- Module CRM Prospection — Lexora central (équipe commerciale Lexora)
-- =============================================================================
-- Objectif : permettre à l'équipe commerciale Lexora de prospecter des
-- entreprises mauriciennes pour leur vendre la plateforme comptable Lexora.
--
-- Périmètre :
--   - crm_companies   : sociétés cibles (Maurice uniquement)
--   - crm_contacts    : personnes (CEO, DAF, dirigeants) dans ces sociétés
--   - crm_activities  : timeline interactions (emails, appels, notes, etc.)
--   - crm_opt_outs    : registre opt-out DPA Maurice 2017
--
-- Accès : super_admin + admin + nouveau rôle 'commercial' (à ajouter dans
-- la table profiles côté app — pas de modif du check existant ici car
-- 'role' est un TEXT libre, validé applicativement).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extension trgm pour la recherche fuzzy sur le nom de société
-- (doit être créée AVANT les index qui utilisent gin_trgm_ops)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- Types ENUM
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE crm_prospect_status AS ENUM (
    'nouveau',
    'a_qualifier',
    'qualifie',
    'contacte',
    'en_discussion',
    'gagne',
    'perdu',
    'opt_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm_source AS ENUM (
    'cbrd',           -- Corporate and Business Registration Dept (registre officiel MU)
    'yellowpages_mu', -- Yellow Pages Mauritius
    'mcci',           -- Mauritius Chamber of Commerce
    'apollo',         -- Apollo.io (B2B database compliant)
    'linkedin',       -- saisie manuelle depuis LinkedIn (compte humain)
    'manuel',         -- saisie 100% manuelle
    'import_csv',     -- import CSV
    'referral'        -- recommandation
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- Table : crm_companies
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  brn             TEXT UNIQUE,                  -- Business Registration Number (MU)
  tan             TEXT,                          -- MRA TAN (TVA)
  linkedin_url    TEXT UNIQUE,
  site_web        TEXT,
  email_principal TEXT,
  telephone       TEXT,

  -- Profil entreprise
  activite        TEXT,                          -- secteur libre
  nic_code        TEXT,                          -- code activité officiel MU
  industrie       TEXT,
  taille_effectif TEXT,                          -- "1-10","11-50","51-200","201-500","500+"
  ca_estime_mur   NUMERIC,                       -- chiffre d'affaires estimé (Rs)
  annee_creation  INTEGER,

  -- Localisation (Maurice uniquement)
  pays            TEXT NOT NULL DEFAULT 'Mauritius',
  region          TEXT,                          -- Port Louis, Plaines Wilhems, etc.
  ville           TEXT,
  adresse         TEXT,

  description     TEXT,

  -- Données enrichies
  raw_data        JSONB,                         -- payload brut source (CBRD/YP/Apollo/LinkedIn)
  enrichment      JSONB,                         -- sortie structurée Claude (persona, pain points)
  strategy        TEXT,                          -- stratégie de com générée par Claude

  -- Pipeline
  statut          crm_prospect_status NOT NULL DEFAULT 'nouveau',
  score           INTEGER,                       -- score de qualification (0-100)
  source          crm_source NOT NULL DEFAULT 'manuel',
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,

  -- Ownership
  assigned_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  enriched_at     TIMESTAMPTZ,

  CONSTRAINT crm_companies_pays_mu CHECK (pays = 'Mauritius')
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_statut ON crm_companies(statut);
CREATE INDEX IF NOT EXISTS idx_crm_companies_assigned ON crm_companies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_companies_source ON crm_companies(source);
CREATE INDEX IF NOT EXISTS idx_crm_companies_industrie ON crm_companies(industrie);
CREATE INDEX IF NOT EXISTS idx_crm_companies_created ON crm_companies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_companies_nom_trgm ON crm_companies USING gin (nom gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Table : crm_contacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES crm_companies(id) ON DELETE CASCADE,

  prenom          TEXT,
  nom             TEXT,
  titre           TEXT,                          -- "CEO", "Directeur Financier", etc.
  seniorite       TEXT,                          -- "C-Level", "VP", "Director", "Manager"
  decision_maker  BOOLEAN DEFAULT FALSE,

  -- Identifiants
  linkedin_url    TEXT UNIQUE,
  email           TEXT,
  email_verified  BOOLEAN DEFAULT FALSE,
  telephone       TEXT,
  whatsapp        TEXT,

  -- Données enrichies
  raw_data        JSONB,
  enrichment      JSONB,
  strategy        TEXT,

  -- Préférences
  langue_preferee TEXT DEFAULT 'fr',             -- 'fr' | 'en'
  canal_prefere   TEXT,                          -- 'email' | 'linkedin' | 'whatsapp' | 'phone'

  -- Opt-out (DPA Maurice 2017)
  opt_out         BOOLEAN NOT NULL DEFAULT FALSE,
  opt_out_reason  TEXT,
  opt_out_at      TIMESTAMPTZ,

  -- Pipeline
  statut          crm_prospect_status NOT NULL DEFAULT 'nouveau',
  source          crm_source NOT NULL DEFAULT 'manuel',
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,

  -- Ownership
  assigned_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  enriched_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_statut ON crm_contacts(statut);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned ON crm_contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_opt_out ON crm_contacts(opt_out) WHERE opt_out = TRUE;

-- -----------------------------------------------------------------------------
-- Table : crm_activities (timeline)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES crm_companies(id) ON DELETE CASCADE,

  type            TEXT NOT NULL,
  -- Types possibles :
  --  'note'              note manuelle
  --  'email_sent'        email envoyé
  --  'email_received'    email reçu
  --  'call_outbound'     appel sortant
  --  'call_inbound'      appel entrant
  --  'meeting'           rendez-vous
  --  'linkedin_dm'       message LinkedIn
  --  'whatsapp_msg'      message WhatsApp
  --  'status_change'     changement de statut pipeline
  --  'enrichment_run'    enrichissement Claude exécuté
  --  'ingest'            import depuis source externe
  --  'outreach_trigger'  déclenchement campagne outreach (N8N)

  direction       TEXT,                          -- 'outbound' | 'inbound' | NULL
  sujet           TEXT,
  contenu         TEXT,
  metadata        JSONB,                         -- payload outil externe

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crm_activities_target_required CHECK (
    contact_id IS NOT NULL OR company_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_company ON crm_activities(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);

-- -----------------------------------------------------------------------------
-- Table : crm_opt_outs (registre central DPA Maurice 2017)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_opt_outs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT,
  telephone       TEXT,
  linkedin_url    TEXT,
  raison          TEXT,
  source          TEXT,                          -- 'manuel', 'unsubscribe_link', 'reply_stop'
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crm_opt_outs_identifier_required CHECK (
    email IS NOT NULL OR telephone IS NOT NULL OR linkedin_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_opt_outs_email ON crm_opt_outs(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_crm_opt_outs_telephone ON crm_opt_outs(telephone);
CREATE INDEX IF NOT EXISTS idx_crm_opt_outs_linkedin ON crm_opt_outs(linkedin_url);

-- -----------------------------------------------------------------------------
-- Trigger : updated_at auto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_companies_updated ON crm_companies;
CREATE TRIGGER trg_crm_companies_updated
  BEFORE UPDATE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_contacts_updated ON crm_contacts;
CREATE TRIGGER trg_crm_contacts_updated
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger : opt-out propagation
-- Quand crm_contacts.opt_out passe à TRUE, on alimente crm_opt_outs
-- et on met le statut à 'opt_out'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_propagate_opt_out() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opt_out = TRUE AND (OLD.opt_out IS DISTINCT FROM TRUE) THEN
    NEW.opt_out_at = NOW();
    NEW.statut = 'opt_out';
    -- Inscription registre central (idempotent : ON CONFLICT DO NOTHING)
    INSERT INTO crm_opt_outs (email, telephone, linkedin_url, raison, source, created_by)
    VALUES (
      NULLIF(NEW.email, ''),
      NULLIF(NEW.telephone, ''),
      NULLIF(NEW.linkedin_url, ''),
      NEW.opt_out_reason,
      'contact_flag',
      NEW.assigned_to
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_contacts_optout ON crm_contacts;
CREATE TRIGGER trg_crm_contacts_optout
  BEFORE UPDATE OF opt_out ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION crm_propagate_opt_out();

-- -----------------------------------------------------------------------------
-- Helper : user_is_lexora_commercial()
-- Renvoie TRUE si l'utilisateur courant a un rôle Lexora central
-- (admin, super_admin ou commercial).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_is_lexora_commercial() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'commercial')
  );
$$;

REVOKE EXECUTE ON FUNCTION user_is_lexora_commercial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_is_lexora_commercial() TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS — accès restreint au cercle Lexora central
-- -----------------------------------------------------------------------------
ALTER TABLE crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_companies_lexora ON crm_companies;
CREATE POLICY crm_companies_lexora ON crm_companies
  FOR ALL TO authenticated
  USING (user_is_lexora_commercial())
  WITH CHECK (user_is_lexora_commercial());

DROP POLICY IF EXISTS crm_contacts_lexora ON crm_contacts;
CREATE POLICY crm_contacts_lexora ON crm_contacts
  FOR ALL TO authenticated
  USING (user_is_lexora_commercial())
  WITH CHECK (user_is_lexora_commercial());

DROP POLICY IF EXISTS crm_activities_lexora ON crm_activities;
CREATE POLICY crm_activities_lexora ON crm_activities
  FOR ALL TO authenticated
  USING (user_is_lexora_commercial())
  WITH CHECK (user_is_lexora_commercial());

DROP POLICY IF EXISTS crm_opt_outs_lexora ON crm_opt_outs;
CREATE POLICY crm_opt_outs_lexora ON crm_opt_outs
  FOR ALL TO authenticated
  USING (user_is_lexora_commercial())
  WITH CHECK (user_is_lexora_commercial());

-- -----------------------------------------------------------------------------
-- Commentaires de table (auto-documentation)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE crm_companies IS
  'CRM — sociétés mauriciennes prospectées par l''équipe commerciale Lexora.';
COMMENT ON TABLE crm_contacts IS
  'CRM — personnes (dirigeants, décideurs) dans les sociétés prospectées.';
COMMENT ON TABLE crm_activities IS
  'CRM — timeline des interactions (emails, appels, notes, enrichissements).';
COMMENT ON TABLE crm_opt_outs IS
  'CRM — registre central des opt-outs (conformité DPA Maurice 2017).';
COMMENT ON COLUMN crm_companies.enrichment IS
  'Sortie structurée de l''analyse Claude (pain points, persona, opportunité).';
COMMENT ON COLUMN crm_companies.strategy IS
  'Stratégie de prospection générée par Claude (accroche, canal, timing).';

-- =============================================================================
-- FIN 441
-- =============================================================================
