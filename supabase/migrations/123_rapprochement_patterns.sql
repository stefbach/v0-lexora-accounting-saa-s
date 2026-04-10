-- Table pour mémoriser les patterns de rapprochement validés par l'utilisateur
CREATE TABLE IF NOT EXISTS rapprochement_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  -- Pattern de reconnaissance
  tiers_banque TEXT NOT NULL,          -- nom normalisé du tiers côté banque
  libelle_pattern TEXT,                -- mot-clé dans le libellé (optionnel)
  montant_min NUMERIC,                 -- fourchette montant (optionnel)
  montant_max NUMERIC,
  -- Cible de rapprochement
  type_cible TEXT NOT NULL,            -- "facture_tiers", "ecriture_compte", "salaire", "mra", "frais_bancaires"
  cible_tiers TEXT,                    -- nom du tiers dans les factures/écritures
  cible_compte TEXT,                   -- numéro de compte comptable cible
  -- Statistiques d'utilisation
  nb_utilisations INTEGER DEFAULT 1,
  derniere_utilisation TIMESTAMPTZ DEFAULT NOW(),
  confidence_cumul NUMERIC DEFAULT 0.8,
  -- Métadonnées
  source TEXT DEFAULT 'manual',  -- "manual" | "auto_validated"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_patterns_societe ON rapprochement_patterns(societe_id);
CREATE INDEX IF NOT EXISTS idx_patterns_tiers ON rapprochement_patterns(societe_id, tiers_banque);

-- RLS
ALTER TABLE rapprochement_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patterns_societe" ON rapprochement_patterns
  USING (societe_id IN (
    SELECT societe_id FROM dossiers WHERE client_id IN (
      SELECT client_id FROM dossiers WHERE societe_id = rapprochement_patterns.societe_id LIMIT 1
    )
  ));
