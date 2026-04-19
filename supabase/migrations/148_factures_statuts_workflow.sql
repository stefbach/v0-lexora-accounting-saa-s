-- ============================================================================
-- Migration 148 — Workflow enrichi des factures (approbation + encaissement)
-- ============================================================================
--
-- Contexte :
--   La colonne `statut` existante est trop grossière (en_attente, partiel,
--   paye, retard, annule). Le métier demande un workflow plus granulaire qui
--   couvre :
--     - l'approbation interne (brouillon -> à valider -> validée / refusée)
--     - l'envoi client (envoyee)
--     - l'encaissement (acompte_recu, paye_partiel, paye)
--     - le recouvrement (retard_7j, retard_30j, en_contentieux)
--     - la clôture (annulee, comptabilisee)
--
--   Seuils indicatifs de double-approbation :
--     > 50 000 Rs  => niveau 1 (manager)
--     > 500 000 Rs => niveau 2 (direction)
--
-- Stratégie :
--   1. Colonnes statut_workflow + métadonnées de validation
--   2. Table d'historique factures_approbations_historique
--   3. Trigger AFTER UPDATE qui log automatiquement tout changement de
--      statut_workflow
--   4. Index pour les requêtes dashboards (par statut, par échéance)
--
-- NOTE : on conserve la colonne `statut` existante pour compatibilité avec
--        les rapprochements bancaires (voir migration 121). statut_workflow
--        est un champ parallèle plus riche.
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout. Pas de RLS (Wave 2).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes workflow sur factures
-- ---------------------------------------------------------------------------
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS statut_workflow TEXT NOT NULL DEFAULT 'brouillon';

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS validee_par UUID REFERENCES auth.users(id);

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS validee_at TIMESTAMPTZ;

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS refus_raison TEXT;

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS approbation_niveau INT NOT NULL DEFAULT 0;

-- CHECK statut_workflow — ajouté via DO block pour idempotence
-- (CREATE TABLE CHECK IF NOT EXISTS n'existe pas < PG 18)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_statut_workflow_check'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_statut_workflow_check
      CHECK (statut_workflow IN (
        'brouillon',
        'a_valider',
        'validee',
        'refusee',
        'envoyee',
        'acompte_recu',
        'paye_partiel',
        'paye',
        'retard_7j',
        'retard_30j',
        'en_contentieux',
        'annulee',
        'comptabilisee'
      ));
  END IF;
END $$;

-- CHECK approbation_niveau ∈ {0,1,2}
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_approbation_niveau_check'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_approbation_niveau_check
      CHECK (approbation_niveau IN (0, 1, 2));
  END IF;
END $$;

COMMENT ON COLUMN public.factures.statut_workflow IS
  'Statut métier enrichi (workflow approbation + encaissement). Distinct de
   la colonne "statut" legacy utilisée par le rapprochement bancaire.
   Valeurs : brouillon, a_valider, validee, refusee, envoyee, acompte_recu,
   paye_partiel, paye, retard_7j, retard_30j, en_contentieux, annulee,
   comptabilisee.';

COMMENT ON COLUMN public.factures.validee_par IS
  'Utilisateur ayant validé la facture (auth.users.id). NULL tant qu''elle
   n''est pas validée.';

COMMENT ON COLUMN public.factures.validee_at IS
  'Horodatage de la validation.';

COMMENT ON COLUMN public.factures.refus_raison IS
  'Motif du refus si statut_workflow = ''refusee''. Libre.';

COMMENT ON COLUMN public.factures.approbation_niveau IS
  'Niveau d''approbation requis : 0=aucune, 1=manager (>50k Rs),
   2=direction (>500k Rs). Déterminé à la création/finalisation de la facture.';

-- ---------------------------------------------------------------------------
-- 2. Table d'historique des approbations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_approbations_historique (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id     UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  ancien_statut  TEXT,
  nouveau_statut TEXT NOT NULL,
  action         TEXT,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  commentaire    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.factures_approbations_historique IS
  'Journal d''audit de tous les changements de statut_workflow d''une facture.
   Alimenté automatiquement par le trigger trg_factures_log_statut_workflow.';

COMMENT ON COLUMN public.factures_approbations_historique.action IS
  'Libellé court de l''action métier (ex: ''soumettre'', ''valider'',
   ''refuser'', ''envoyer'', ''encaisser'', ''annuler'', ''comptabiliser'').';

CREATE INDEX IF NOT EXISTS idx_factures_approb_hist_facture
  ON public.factures_approbations_historique (facture_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_factures_approb_hist_user
  ON public.factures_approbations_historique (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Trigger AFTER UPDATE : log automatique sur changement de statut_workflow
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_facture_statut_workflow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seulement si le statut_workflow a réellement changé
  IF NEW.statut_workflow IS DISTINCT FROM OLD.statut_workflow THEN
    INSERT INTO public.factures_approbations_historique (
      facture_id,
      ancien_statut,
      nouveau_statut,
      action,
      user_id,
      commentaire,
      created_at
    ) VALUES (
      NEW.id,
      OLD.statut_workflow,
      NEW.statut_workflow,
      'changement_statut',
      -- auth.uid() peut être NULL dans un contexte service_role / job batch
      NULLIF(auth.uid()::TEXT, '')::UUID,
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_facture_statut_workflow_change() IS
  'Trigger AFTER UPDATE sur factures : insère une ligne dans
   factures_approbations_historique à chaque changement de statut_workflow.
   user_id récupéré depuis auth.uid() (peut être NULL en contexte batch).';

DROP TRIGGER IF EXISTS trg_factures_log_statut_workflow ON public.factures;

CREATE TRIGGER trg_factures_log_statut_workflow
  AFTER UPDATE OF statut_workflow ON public.factures
  FOR EACH ROW
  EXECUTE FUNCTION public.log_facture_statut_workflow_change();

-- ---------------------------------------------------------------------------
-- 4. Index pour requêtes rapides (dashboards, alertes recouvrement)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_factures_societe_statut_workflow
  ON public.factures (societe_id, statut_workflow);

CREATE INDEX IF NOT EXISTS idx_factures_echeance_statut_workflow
  ON public.factures (date_echeance, statut_workflow)
  WHERE date_echeance IS NOT NULL;
