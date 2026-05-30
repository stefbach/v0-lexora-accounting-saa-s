-- ═══════════════════════════════════════════════════════════════════════
-- Migration 447 : index de transaction sur factures_paiements
--
-- Contexte : le rapprochement bancaire peut désormais régler une facture en
-- PLUSIEURS prélèvements (paiement partiel — voir action `lettrer_partiel`
-- dans /api/comptable/rapprochement). Chaque versement issu d'une ligne de
-- relevé crée une ligne factures_paiements avec source='rapprochement'.
--
-- Jusqu'ici factures_paiements ne stockait que `rapproche_releve_id`. Or un
-- même relevé peut contenir DEUX lignes qui règlent partiellement la MÊME
-- facture. Pour pouvoir délettrer précisément UNE de ces lignes (sans
-- supprimer l'autre versement du même relevé), on ajoute l'index de la
-- transaction dans le relevé (`transactions_json[idx]`).
--
-- Colonne nullable + additive : aucun impact sur les paiements manuels
-- existants (source='manuel'/'backfill') qui restent à NULL.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.factures_paiements
  ADD COLUMN IF NOT EXISTS rapproche_transaction_idx INTEGER;

COMMENT ON COLUMN public.factures_paiements.rapproche_transaction_idx IS
  'Index (0-based) de la transaction dans releves_bancaires.transactions_json '
  'qui a généré ce versement (uniquement pour source=rapprochement). Permet '
  'le délettrage ciblé d''un prélèvement parmi plusieurs sur la même facture.';

-- Lookup delettrage : (releve, idx) → ligne(s) de paiement à supprimer.
CREATE INDEX IF NOT EXISTS idx_factures_paiements_rapproche_tx
  ON public.factures_paiements (rapproche_releve_id, rapproche_transaction_idx)
  WHERE rapproche_releve_id IS NOT NULL;
