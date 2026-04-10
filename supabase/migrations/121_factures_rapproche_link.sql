-- ═══════════════════════════════════════════════════════════════
-- Migration 121: Link factures to reconciling bank transaction
-- Fixes inconsistency between facture.statut=paye and real rapprochement
-- ═══════════════════════════════════════════════════════════════

-- Add fields to track the bank reconciliation link
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS rapproche_releve_id UUID REFERENCES public.releves_bancaires(id),
  ADD COLUMN IF NOT EXISTS rapproche_transaction_idx INTEGER,
  ADD COLUMN IF NOT EXISTS rapproche_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rapproche_by UUID,
  ADD COLUMN IF NOT EXISTS rapproche_source TEXT; -- 'auto' | 'ai' | 'manual'

CREATE INDEX IF NOT EXISTS idx_factures_rapproche_releve ON public.factures(rapproche_releve_id);

-- A facture is truly "rapprochee" when these conditions are met:
-- - statut = 'paye'
-- - rapproche_releve_id IS NOT NULL
-- - rapproche_transaction_idx IS NOT NULL
-- This lets us distinguish "marked paid manually" from "really reconciled with bank"

COMMENT ON COLUMN public.factures.rapproche_releve_id IS 'Link to the bank statement that contains the reconciling transaction';
COMMENT ON COLUMN public.factures.rapproche_transaction_idx IS 'Index of the transaction within the transactions_json array';
COMMENT ON COLUMN public.factures.rapproche_date IS 'Timestamp when the facture was reconciled with the bank transaction';
COMMENT ON COLUMN public.factures.rapproche_source IS 'How the match was made: auto (heuristic), ai (Claude), manual';
