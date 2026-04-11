-- ============================================================
-- MIGRATION 125 — Module Rédaction Contrats Clients
-- ============================================================

-- Table principale des contrats
CREATE TABLE IF NOT EXISTS contrats_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parties
  societe_id UUID REFERENCES societes(id) ON DELETE SET NULL,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comptable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Identification
  titre TEXT NOT NULL,
  reference TEXT UNIQUE, -- ex: CTR-2025-001
  type_contrat TEXT NOT NULL DEFAULT 'autre',
  -- Types: lettre_mission | convention_honoraires | prestation_service | nda | mandat | autre
  
  -- Statut
  statut TEXT NOT NULL DEFAULT 'brouillon',
  -- Statuts: brouillon | en_revision | valide | envoye | signe | archive | resilie
  
  -- Contenu final
  contenu_html TEXT,
  contenu_markdown TEXT,
  
  -- Paramètres structurés extraits par IA
  parametres JSONB DEFAULT '{}'::jsonb,
  -- Ex: { honoraires, periodicite, duree, date_debut, services, clauses_speciales, ... }
  
  -- Conversation IA (historique complet du chat)
  conversation_ia JSONB DEFAULT '[]'::jsonb,
  
  -- Métadonnées
  cree_par UUID REFERENCES profiles(id),
  date_debut DATE,
  date_fin DATE,
  montant_total NUMERIC(15,2),
  devise TEXT DEFAULT 'MUR',
  
  -- Workflow
  date_envoi TIMESTAMPTZ,
  date_signature_client TIMESTAMPTZ,
  date_signature_cabinet TIMESTAMPTZ,
  
  -- Stockage PDF
  pdf_path TEXT,
  
  -- Signatures électroniques (hash)
  signature_client_hash TEXT,
  signature_cabinet_hash TEXT,
  
  -- Notes internes
  notes_internes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Versions du contrat (historique)
CREATE TABLE IF NOT EXISTS contrat_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id UUID REFERENCES contrats_clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  contenu_html TEXT,
  contenu_markdown TEXT,
  raison_modification TEXT,
  modifie_par UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates de contrats réutilisables
CREATE TABLE IF NOT EXISTS contrat_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  type_contrat TEXT NOT NULL,
  description TEXT,
  contenu_html TEXT,
  contenu_markdown TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  -- Ex: [{ "cle": "nom_client", "label": "Nom du client", "type": "text" }]
  actif BOOLEAN DEFAULT true,
  cree_par UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_contrats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contrats_updated_at ON contrats_clients;
CREATE TRIGGER trigger_contrats_updated_at
  BEFORE UPDATE ON contrats_clients
  FOR EACH ROW EXECUTE FUNCTION update_contrats_updated_at();

-- Trigger: auto-générer référence
CREATE OR REPLACE FUNCTION generate_contrat_reference()
RETURNS TRIGGER AS $$
DECLARE
  annee TEXT;
  sequence INTEGER;
BEGIN
  IF NEW.reference IS NULL THEN
    annee := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO sequence
    FROM contrats_clients
    WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
    NEW.reference := 'CTR-' || annee || '-' || LPAD(sequence::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contrat_reference ON contrats_clients;
CREATE TRIGGER trigger_contrat_reference
  BEFORE INSERT ON contrats_clients
  FOR EACH ROW EXECUTE FUNCTION generate_contrat_reference();

-- RLS
ALTER TABLE contrats_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrat_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrat_templates ENABLE ROW LEVEL SECURITY;

-- Policy: comptables voient leurs contrats
CREATE POLICY contrats_comptable_policy ON contrats_clients
  FOR ALL USING (
    comptable_id = auth.uid()
    OR cree_par = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Policy: clients voient leurs contrats signés/envoyés
CREATE POLICY contrats_client_policy ON contrats_clients
  FOR SELECT USING (
    client_id = auth.uid()
    AND statut IN ('envoye', 'signe', 'archive')
  );

CREATE POLICY contrat_versions_policy ON contrat_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM contrats_clients c
      WHERE c.id = contrat_id
        AND (c.comptable_id = auth.uid() OR c.cree_par = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY contrat_templates_policy ON contrat_templates
  FOR ALL USING (
    cree_par = auth.uid()
    OR actif = true
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contrats_societe ON contrats_clients(societe_id);
CREATE INDEX IF NOT EXISTS idx_contrats_client ON contrats_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_contrats_comptable ON contrats_clients(comptable_id);
CREATE INDEX IF NOT EXISTS idx_contrats_statut ON contrats_clients(statut);
CREATE INDEX IF NOT EXISTS idx_contrats_type ON contrats_clients(type_contrat);
CREATE INDEX IF NOT EXISTS idx_contrat_versions_contrat ON contrat_versions(contrat_id, version);

-- Seed: templates de base
INSERT INTO contrat_templates (nom, type_contrat, description, variables) VALUES
(
  'Lettre de mission comptable',
  'lettre_mission',
  'Lettre de mission standard pour services comptables',
  '[
    {"cle": "nom_client", "label": "Nom du client", "type": "text"},
    {"cle": "nom_societe_client", "label": "Société du client", "type": "text"},
    {"cle": "services", "label": "Services inclus", "type": "textarea"},
    {"cle": "honoraires_mensuels", "label": "Honoraires mensuels (MUR)", "type": "number"},
    {"cle": "date_debut", "label": "Date de début", "type": "date"},
    {"cle": "duree_mois", "label": "Durée (mois)", "type": "number"}
  ]'::jsonb
),
(
  'Convention d''honoraires',
  'convention_honoraires',
  'Convention d''honoraires pour prestations ponctuelles',
  '[
    {"cle": "nom_client", "label": "Nom du client", "type": "text"},
    {"cle": "objet_mission", "label": "Objet de la mission", "type": "textarea"},
    {"cle": "montant_total", "label": "Montant total HT (MUR)", "type": "number"},
    {"cle": "modalites_paiement", "label": "Modalités de paiement", "type": "text"},
    {"cle": "delai_realisation", "label": "Délai de réalisation", "type": "text"}
  ]'::jsonb
),
(
  'NDA / Accord de confidentialité',
  'nda',
  'Accord de non-divulgation mutuel',
  '[
    {"cle": "partie_b_nom", "label": "Nom de la partie B", "type": "text"},
    {"cle": "objet_echange", "label": "Objet des échanges confidentiels", "type": "textarea"},
    {"cle": "duree_confidentialite", "label": "Durée de confidentialité (années)", "type": "number"}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
