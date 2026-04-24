-- 209_ot_setup_rls_policies.sql
-- Configure RLS pour la table heures_travaillees avant première utilisation en prod.
-- La contrainte UNIQUE(employe_id, date) existe déjà (migration 017).
-- Ajout d'un index fonctionnel sur (employe_id, mois) pour les requêtes d'agrégation mensuelle.

-- Index pour les requêtes mensuelles (preview OT par période)
CREATE INDEX IF NOT EXISTS idx_heures_travaillees_employe_mois
  ON heures_travaillees(employe_id, date_trunc('month', date));

-- Activer RLS si pas déjà actif
ALTER TABLE heures_travaillees ENABLE ROW LEVEL SECURITY;

-- Policy lecture : tout membre de la société de l'employé
DROP POLICY IF EXISTS "heures_travaillees_select_same_societe" ON heures_travaillees;
CREATE POLICY "heures_travaillees_select_same_societe"
  ON heures_travaillees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employes e
    JOIN user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
  ));

-- Policy écriture : rh, manager, client_admin uniquement
DROP POLICY IF EXISTS "heures_travaillees_write_rh_manager_dirigeant" ON heures_travaillees;
CREATE POLICY "heures_travaillees_write_rh_manager_dirigeant"
  ON heures_travaillees FOR ALL
  USING (EXISTS (
    SELECT 1 FROM employes e
    JOIN user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
      AND us.role IN ('rh', 'manager', 'client_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM employes e
    JOIN user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
      AND us.role IN ('rh', 'manager', 'client_admin')
  ));

NOTIFY pgrst, 'reload schema';
