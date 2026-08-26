-- =====================================================================
-- Migration 505 — POS : champs provider de paiement (fondation)
-- =====================================================================
-- Prépare la connexion à un système de paiement (MCB Juice / QR, terminal
-- carte) et le rapprochement du compte 5118 « Monétique en transit ». Ajoute à
-- paiements_pos les métadonnées d'une transaction électronique. 100 % ADDITIF —
-- aucune logique comptable modifiée (le double-entrée reste posé par la RPC 504).
--
-- statut_capture : cycle de vie côté provider —
--   en_attente (QR affiché / autorisation) → capture (encaissé) → echoue / rembourse.
--   Défaut 'capture' = paiement manuel encaissé immédiatement (comportement actuel).
-- =====================================================================

BEGIN;

ALTER TABLE public.paiements_pos
  ADD COLUMN IF NOT EXISTS provider        TEXT,
  ADD COLUMN IF NOT EXISTS transaction_ref TEXT,
  ADD COLUMN IF NOT EXISTS statut_capture  TEXT NOT NULL DEFAULT 'capture'
    CHECK (statut_capture IN ('en_attente','capture','echoue','rembourse')),
  ADD COLUMN IF NOT EXISTS terminal_ref    TEXT;

CREATE INDEX IF NOT EXISTS idx_paiements_pos_txref
  ON public.paiements_pos(societe_id, transaction_ref)
  WHERE transaction_ref IS NOT NULL;

COMMENT ON COLUMN public.paiements_pos.provider IS
  'Fournisseur de paiement (mcb_juice, terminal_carte, stripe…) ; NULL = manuel.';
COMMENT ON COLUMN public.paiements_pos.statut_capture IS
  'Cycle provider : en_attente → capture → echoue/rembourse (mig 505).';

COMMIT;
