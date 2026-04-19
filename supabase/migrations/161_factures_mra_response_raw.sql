-- ============================================================================
-- Migration 161: store full MRA response for audit trail
-- ============================================================================
-- Objectif : conserver la réponse brute renvoyée par l'API MRA IFP lors de la
-- fiscalisation d'une facture, afin de disposer d'une piste d'audit complète
-- (IRN, QR code, signature numérique, statut, métadonnées) et de permettre la
-- vérification ultérieure de la signature MRA sans dépendre d'un log applicatif.
--
-- Deux colonnes sont ajoutées :
--   - `mra_response_raw` (JSONB) : payload JSON complet retourné par MRA.
--   - `mra_signature`    (TEXT)  : signature numérique extraite (shortcut de
--     lecture pour les écrans d'audit / exports).
-- ============================================================================

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS mra_response_raw JSONB,
  ADD COLUMN IF NOT EXISTS mra_signature TEXT;

COMMENT ON COLUMN public.factures.mra_response_raw IS
  'Réponse brute de l''API MRA (IRN, QR, signature, metadata). Utilisé pour audit et vérification future de la signature.';
COMMENT ON COLUMN public.factures.mra_signature IS
  'Signature numérique MRA extraite de la réponse (pour vérification ultérieure).';
