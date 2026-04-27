-- 209_ot_setup_rls_policies.sql
-- Configure RLS pour la table heures_travaillees avant première utilisation en prod.
--
-- Contexte :
-- - La contrainte UNIQUE(employe_id, date) existe déjà (migration 017), donc
--   l'index implicite sous-jacent suffit pour les UPSERT ON CONFLICT.
-- - Une policy legacy `heures_auth` (rôles Lexora globaux via get_my_role())
--   contournait le cloisonnement société et avait un bug FOR ALL sans WITH CHECK.
--   On la supprime au profit de policies cloisonnées par société.
-- - Accès lecture : tout membre de la société de l'employé.
-- - Accès écriture : rh, manager, client_admin uniquement (pas de backdoor admin Lexora).

-- Index pour les agrégations transversales par date.
-- Note : on n'utilise PAS date_trunc('month', date) car non-IMMUTABLE en Postgres.
-- L'index implicite (employe_id, date) de la contrainte UNIQUE couvre déjà les
-- requêtes filtrées par employé + plage de dates.
CREATE INDEX IF NOT EXISTS idx_heures_travaillees_date
  ON public.heures_travaillees(date);

-- Activer RLS si pas déjà actif
ALTER TABLE public.heures_travaillees ENABLE ROW LEVEL SECURITY;

-- Suppression de la policy legacy `heures_auth` (accès global toutes sociétés)
DROP POLICY IF EXISTS "heures_auth" ON public.heures_travaillees;

-- Policy lecture : tout membre de la société de l'employé
DROP POLICY IF EXISTS "heures_travaillees_select_same_societe" ON public.heures_travaillees;
CREATE POLICY "heures_travaillees_select_same_societe"
  ON public.heures_travaillees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
  ));

-- Policy écriture : rh, manager, client_admin uniquement
DROP POLICY IF EXISTS "heures_travaillees_write_rh_manager_dirigeant" ON public.heures_travaillees;
CREATE POLICY "heures_travaillees_write_rh_manager_dirigeant"
  ON public.heures_travaillees FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
      AND us.role IN ('rh', 'manager', 'client_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employes e
    JOIN public.user_societes us ON us.societe_id = e.societe_id
    WHERE e.id = heures_travaillees.employe_id
      AND us.user_id = auth.uid()
      AND us.role IN ('rh', 'manager', 'client_admin')
  ));

NOTIFY pgrst, 'reload schema';
