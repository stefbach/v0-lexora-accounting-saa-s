-- ============================================================================
-- Migration 155 — Enrichissement table contrats_clients (module UI)
-- ============================================================================
--
-- Ajoute les colonnes manquantes nécessaires à la nouvelle UI du module
-- Contrats Clients (liste, création, détail) :
--   - frequence_facturation : périodicité de facturation (ponctuel/mensuel/...)
--   - description : description libre (additionnelle aux notes_internes)
--   - montant : alias direct sur le montant du contrat (simpler que montant_total)
--   - action_renouvellement : mode de renouvellement
--
-- Les colonnes date_debut, date_fin, montant_total, devise, type_contrat,
-- statut et updated_at existent déjà (voir migrations 125 et 142).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS sur chaque colonne.
-- ============================================================================

ALTER TABLE public.contrats_clients
  ADD COLUMN IF NOT EXISTS frequence_facturation TEXT DEFAULT 'ponctuel',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS montant NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS action_renouvellement TEXT DEFAULT 'aucun';

COMMENT ON COLUMN public.contrats_clients.frequence_facturation IS
  'Périodicité de facturation : ponctuel | mensuel | trimestriel | annuel';

COMMENT ON COLUMN public.contrats_clients.description IS
  'Description libre du contrat (distincte des notes_internes réservées au cabinet)';

COMMENT ON COLUMN public.contrats_clients.montant IS
  'Montant principal du contrat (alias simplifié de montant_total pour la nouvelle UI)';

COMMENT ON COLUMN public.contrats_clients.action_renouvellement IS
  'Mode de renouvellement : aucun | tacite | manuel';

-- Index utile pour filtre statut + tri par date_fin (échéances 30j)
CREATE INDEX IF NOT EXISTS idx_contrats_clients_statut_date_fin
  ON public.contrats_clients(statut, date_fin);
