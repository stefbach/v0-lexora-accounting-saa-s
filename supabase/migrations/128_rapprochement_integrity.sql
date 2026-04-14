-- ═══════════════════════════════════════════════════════════════
-- Migration 128: Intégrité comptable rapprochement
--
-- Corrige les bugs critiques identifiés par l'audit:
-- 1. Contrainte unique (societe_id, ref_folio) sur ecritures_v2
--    → empêche les doublons BNQ (systémique avec la Phase finale)
-- 2. Colonne solde_non_paye sur factures
--    → permet de tracker les paiements partiels
-- 3. Fonction helper pour détecter les écritures orphelines
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Contrainte unique pour empêcher doublons BNQ ──
-- D'abord nettoyer les doublons existants (garder le plus récent)
DO $$
BEGIN
  -- Supprimer les doublons : pour chaque (societe_id, ref_folio) avec plus d'une ligne,
  -- garder uniquement l'id max et supprimer les autres
  WITH doublons AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY societe_id, ref_folio, numero_compte ORDER BY created_at DESC) as rn
    FROM public.ecritures_comptables_v2
    WHERE ref_folio IS NOT NULL AND societe_id IS NOT NULL
  )
  DELETE FROM public.ecritures_comptables_v2
  WHERE id IN (SELECT id FROM doublons WHERE rn > 1);
  RAISE NOTICE 'Doublons BNQ supprimés';
END $$;

-- Index unique sur (societe_id, ref_folio, numero_compte)
-- Pour les entrées avec ref_folio NULL, aucune contrainte (comptabilité manuelle)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ecritures_v2_ref_folio
  ON public.ecritures_comptables_v2(societe_id, ref_folio, numero_compte)
  WHERE ref_folio IS NOT NULL;

-- ── 2. Colonne solde_non_paye sur factures ──
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS solde_non_paye NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tds_retenu NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN public.factures.solde_non_paye IS 'Montant restant à payer (NULL = entièrement payé ou non applicable)';
COMMENT ON COLUMN public.factures.tds_retenu IS 'Retenue à la source (TDS) déduite lors du paiement';

-- Initialiser solde_non_paye pour les factures existantes
-- Si statut=paye et rapproche_releve_id IS NOT NULL → 0
-- Sinon → montant_ttc
UPDATE public.factures
SET solde_non_paye = CASE
  WHEN statut = 'paye' AND rapproche_releve_id IS NOT NULL THEN 0
  ELSE montant_ttc
END
WHERE solde_non_paye IS NULL;

-- ── 3. Vue pour détecter les incohérences ──
CREATE OR REPLACE VIEW public.rapprochement_incoherences AS
SELECT
  f.societe_id,
  f.id as facture_id,
  f.numero_facture,
  f.tiers,
  f.montant_ttc,
  f.statut,
  f.solde_non_paye,
  f.rapproche_releve_id,
  f.tds_retenu,
  CASE
    WHEN f.statut = 'paye' AND f.rapproche_releve_id IS NULL THEN 'PAYE SANS RAPPROCHEMENT'
    WHEN f.statut = 'paye' AND f.solde_non_paye > 0 THEN 'PAYE AVEC SOLDE RESTANT'
    WHEN f.statut = 'en_attente' AND f.rapproche_releve_id IS NOT NULL THEN 'RAPPROCHE MAIS NON PAYE'
    ELSE NULL
  END as anomalie
FROM public.factures f
WHERE f.statut IN ('paye', 'en_attente', 'partiel');

COMMENT ON VIEW public.rapprochement_incoherences IS 'Détecte les incohérences entre le statut de facture et le rapprochement bancaire';

-- ── 4. Index de performance ──
CREATE INDEX IF NOT EXISTS idx_factures_solde_non_paye ON public.factures(societe_id, solde_non_paye) WHERE solde_non_paye > 0;
