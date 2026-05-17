-- =============================================================================
-- Migration 283 — Extension types/statuts documents pour OCR universel
-- =============================================================================
-- Le pipeline OCR (app/api/documents/process/route.ts) accepte maintenant
-- tous types de pièces commerciales : tickets POS, reçus manuscrits, bons
-- de livraison, photos mobiles, etc.
--
-- On étend les CHECK constraints existantes :
--   - documents.type_document : ajoute 'ticket', 'recu', 'bon_livraison'
--   - documents.statut         : ajoute 'en_attente_revue' (confiance < 50)
--
-- Idempotent : on drop puis re-crée la contrainte avec les nouvelles valeurs.
-- =============================================================================

-- 1. type_document : nouvelles valeurs (ticket / recu / bon_livraison)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_type_document_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_type_document_check;
  END IF;
END $$;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_type_document_check
  CHECK (type_document IS NULL OR type_document IN (
    'facture_fournisseur',
    'facture_client',
    'releve_bancaire',
    'fiche_paie',
    'charges_sociales',
    'contrat',
    'ticket',
    'recu',
    'bon_livraison',
    'autre'
  ));

-- 2. statut : ajouter 'en_attente_revue' pour les extractions confiance basse
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_statut_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_statut_check;
  END IF;
END $$;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_statut_check
  CHECK (statut IN (
    'en_attente',
    'en_cours',
    'traite',
    'erreur',
    'en_attente_revue'
  ));

COMMENT ON COLUMN public.documents.type_document IS
  'Type métier détecté par OCR. Outre les types classiques (facture_*,
   releve_bancaire, fiche_paie, charges_sociales, contrat), on accepte
   ticket (POS/thermique), recu (manuscrit/note frais), bon_livraison,
   et autre (carte de visite, doc non comptable).';

COMMENT ON COLUMN public.documents.statut IS
  'Workflow OCR : en_attente → en_cours → traite. Si l''extraction est
   peu fiable (confiance < 50), on passe en en_attente_revue pour signaler
   à l''utilisateur de vérifier manuellement avant tout impact comptable.';
