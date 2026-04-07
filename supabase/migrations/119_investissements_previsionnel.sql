-- Investissements prévisionnel table
CREATE TABLE IF NOT EXISTS investissements_previsionnel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('investissement', 'credit')),
  libelle text NOT NULL,
  montant numeric DEFAULT 0,
  date_debut date,
  date_fin date,
  mensualite numeric DEFAULT 0,
  taux_interet numeric DEFAULT 0,
  capital_restant numeric DEFAULT 0,
  banque text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE investissements_previsionnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view investissements for their societes"
  ON investissements_previsionnel FOR SELECT
  USING (societe_id IN (
    SELECT societe_id FROM dossiers WHERE client_id = auth.uid()
    UNION
    SELECT id FROM societes WHERE created_by = auth.uid()
  ));

CREATE POLICY "Users can manage investissements for their societes"
  ON investissements_previsionnel FOR ALL
  USING (societe_id IN (
    SELECT societe_id FROM dossiers WHERE client_id = auth.uid()
    UNION
    SELECT id FROM societes WHERE created_by = auth.uid()
  ));
