-- ============================================================================
-- Migration 235 — Backfill transactions_json depuis documents.n8n_result.lignes
-- ============================================================================
--
-- Bug observé en prod (OCC MUR.pdf) :
-- L'OCR extrait correctement les montants dans documents.n8n_result.extraction.lignes
-- (debit: 115, credit: 521900, etc.) mais le code de backfill
-- (/api/admin/backfill-releves-bancaires/route.ts) n'utilisait que l'ancien format
-- {sens, montant} → debit/credit à 0 sur tous les transactions_json créés.
--
-- Le fix code (commit 2026-05-03) corrige le mapping pour les futurs imports.
-- Cette migration RE-PEUPLE transactions_json à partir de extraction.lignes
-- pour les relevés déjà stockés (avec debit/credit à 0 mais lignes OCR ok).
--
-- IDEMPOTENT : ne touche que les relevés où transactions_json a tous les
-- debit ET credit à 0 (ce qui ne devrait jamais arriver pour un vrai relevé).
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  new_txs JSONB;
  nb_repaired INT := 0;
BEGIN
  FOR rec IN
    SELECT
      rb.id AS releve_id,
      rb.document_id,
      d.n8n_result->'extraction'->'lignes' AS lignes,
      jsonb_array_length(COALESCE(rb.transactions_json, '[]'::jsonb)) AS nb_tx_actuel
    FROM public.releves_bancaires rb
    JOIN public.documents d ON d.id = rb.document_id
    WHERE rb.transactions_json IS NOT NULL
      AND jsonb_array_length(rb.transactions_json) > 0
      AND d.n8n_result->'extraction'->'lignes' IS NOT NULL
      AND jsonb_array_length(d.n8n_result->'extraction'->'lignes') > 0
      -- Critère de détection bug : TOUS les debit ET credit sont à 0
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(rb.transactions_json) tx
        WHERE (tx->>'debit')::numeric > 0 OR (tx->>'credit')::numeric > 0
      )
  LOOP
    -- Re-mapper depuis n8n_result.extraction.lignes en supportant les 2 formats
    -- (debit/credit direct OU sens/montant). Préserve les autres champs déjà
    -- enrichis dans transactions_json (lettre, statut, facture_id, etc.) en
    -- récupérant la position par index depuis l'ancien JSON.
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', l->>'date',
        'libelle', l->>'libelle',
        'debit', CASE
          WHEN (l->>'debit')::numeric > 0 THEN (l->>'debit')::numeric
          WHEN l->>'sens' = 'debit' AND (l->>'montant')::numeric > 0 THEN (l->>'montant')::numeric
          ELSE 0
        END,
        'credit', CASE
          WHEN (l->>'credit')::numeric > 0 THEN (l->>'credit')::numeric
          WHEN l->>'sens' = 'credit' AND (l->>'montant')::numeric > 0 THEN (l->>'montant')::numeric
          ELSE 0
        END,
        'solde_apres', (l->>'solde_apres')::numeric,
        'tiers_detecte', l->>'tiers_detecte',
        'compte_comptable', COALESCE(l->>'compte_comptable', l->>'compte_debit', l->>'compte_credit'),
        'statut', CASE
          WHEN COALESCE((l->>'confiance')::numeric, 0) >= 70 THEN 'identifie'
          WHEN COALESCE((l->>'confiance')::numeric, 0) >= 40 THEN 'a_verifier'
          ELSE 'non_identifie'
        END
      )
    )
    INTO new_txs
    FROM jsonb_array_elements(rec.lignes) l;

    UPDATE public.releves_bancaires
    SET transactions_json = new_txs
    WHERE id = rec.releve_id;

    nb_repaired := nb_repaired + 1;
    RAISE NOTICE 'Releve % (doc %) réparé : % tx remappées',
      rec.releve_id, rec.document_id, jsonb_array_length(new_txs);
  END LOOP;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Migration 235 terminée : % relevés bancaires réparés', nb_repaired;
END $$;
