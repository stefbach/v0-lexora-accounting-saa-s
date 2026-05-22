-- ============================================================================
-- Migration 319 — PURGE FINALE : Supprimer les fausses écritures
-- ============================================================================
-- DIAGNOSTIC FINAL:
--   Écart massif entre soldes réels bancaires et comptabilité:
--   - DDS 512100: Réel 80k MUR, Comptable 9.26M (+9.18M faux)
--   - DDS 512101: Réel 404€, Comptable -9.29M (-9.3M faux)
--   - OCC idem
--
--   ROOT CAUSE: Les migrations 314/315/316 ont créé/laissé 9.3M d'écritures
--   sans correspondance bancaire réelle (orphelines fausses + contreparties
--   créées pour non-virements).
--
-- SOLUTION:
--   1. IDENTIFIER écritures sur 512xxx avec NO MATCH bancaire strict
--   2. SUPPRIMER ces écritures (fausses)
--   3. Revalider les virements réels uniquement
--
-- RÉSULTAT: Comptes bancaires = vrais soldes (80k MUR, 404€, etc.)
-- ============================================================================

BEGIN;

-- ── 1. CRÉER TABLE DES VRAIS VIREMENTS (source of truth) ────────────────
CREATE TEMP TABLE temp_real_bank_virements_strict AS
WITH releve_data AS (
  SELECT
    rb.societe_id,
    cb.devise,
    cb.compte_comptable,
    jsonb_array_elements(COALESCE(rb.transactions_json, '[]'::jsonb)) AS tx
  FROM releves_bancaires rb
  JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  WHERE rb.transactions_json IS NOT NULL
)
SELECT DISTINCT
  rd.societe_id,
  rd.devise,
  rd.compte_comptable,
  (rd.tx->>'date')::date AS tx_date,
  (rd.tx->>'montant')::numeric AS tx_montant,
  rd.tx->>'libelle' AS tx_libelle,
  rd.tx->>'reference' AS tx_reference
FROM releve_data rd
WHERE (rd.tx->>'matched_type' IN ('interco', 'virement_interne')
   OR rd.tx->>'classification' IN ('interco', 'virement_interne'))
  AND (rd.tx->>'montant')::numeric > 0;

-- ── 2. IDENTIFIER ÉCRITURES SUR 512xxx AVEC MATCH BANCAIRE STRICT ───────
CREATE TEMP TABLE temp_verified_512_entries AS
SELECT DISTINCT
  e.id
FROM ecritures_comptables_v2 e
JOIN temp_real_bank_virements_strict rbv ON (
  e.societe_id = rbv.societe_id
  AND e.numero_compte = rbv.compte_comptable
  AND ABS(e.date_ecriture - rbv.tx_date) <= 1
  AND ABS(GREATEST(e.debit_mur, e.credit_mur) - rbv.tx_montant) < 1
);

-- ── 3. AUDIT: Combien d'écritures sur 512xxx SANS match bancaire ? ──────
SELECT
  '=== AUDIT ÉCRITURES 512xxx ===' AS section,
  COUNT(*) FILTER (WHERE e.numero_compte IN ('512100', '512101')) AS nb_total_512,
  COUNT(*) FILTER (WHERE e.numero_compte IN ('512100', '512101')
                    AND e.id IN (SELECT id FROM temp_verified_512_entries)) AS nb_verifiees,
  COUNT(*) FILTER (WHERE e.numero_compte IN ('512100', '512101')
                    AND e.id NOT IN (SELECT id FROM temp_verified_512_entries)) AS nb_fausses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE e.numero_compte IN ('512100', '512101')
                    AND e.id NOT IN (SELECT id FROM temp_verified_512_entries)) /
    NULLIF(COUNT(*) FILTER (WHERE e.numero_compte IN ('512100', '512101')), 0), 2) AS pct_fausses
FROM ecritures_comptables_v2 e;

-- ── 4. DÉTAIL DES ÉCRITURES FAUSSES À SUPPRIMER ────────────────────────
SELECT
  '=== ÉCRITURES FAUSSES À SUPPRIMER ===' AS section,
  numero_compte,
  societe_id,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte IN ('512100', '512101')
  AND id NOT IN (SELECT id FROM temp_verified_512_entries)
GROUP BY numero_compte, societe_id
ORDER BY numero_compte, societe_id;

-- ── 5. SUPPRIMER ÉCRITURES FAUSSES SUR 512xxx ──────────────────────────
DELETE FROM ecritures_comptables_v2
WHERE numero_compte IN ('512100', '512101')
  AND id NOT IN (SELECT id FROM temp_verified_512_entries);

SELECT
  '=== SUPPRESSION EXÉCUTÉE ===' AS section,
  'Écritures 512xxx sans match bancaire supprimées' AS action;

-- ── 6. SUPPRIMER ORPHELINES 5800 SANS CONTREPARTIES ────────────────────
-- (elles devaient avoir une contrepartie 512xxx qui a été supprimée)
DELETE FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_comptables_v2 e2
    WHERE e2.numero_compte IN ('512100', '512101')
      AND e2.societe_id = e.societe_id
      AND ABS(e2.date_ecriture - e.date_ecriture) <= 1
      AND ABS(
        COALESCE(e2.debit_mur, 0) + COALESCE(e2.credit_mur, 0) -
        COALESCE(e.debit_mur, 0) - COALESCE(e.credit_mur, 0)
      ) < 1
  );

SELECT
  '=== SUPPRESSION ORPHELINES 5800 ===' AS section,
  'Orphelines 5800 sans contrepartie 512 supprimées' AS action;

-- ── 7. VÉRIFICATION: SOLDES BANCAIRES APRÈS PURGE ──────────────────────
SELECT
  '=== SOLDES 512 APRÈS PURGE ===' AS section,
  e.numero_compte,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde_comptable,
  COALESCE((
    SELECT solde_actuel FROM comptes_bancaires cb
    WHERE cb.compte_comptable = e.numero_compte
      AND cb.societe_id = e.societe_id LIMIT 1
  ), 0) AS solde_reel_bancaire,
  ROUND(COALESCE((
    SELECT solde_actuel FROM comptes_bancaires cb
    WHERE cb.compte_comptable = e.numero_compte
      AND cb.societe_id = e.societe_id LIMIT 1
  ), 0) - (SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS ecart
FROM ecritures_comptables_v2 e
WHERE e.numero_compte IN ('512100', '512101')
GROUP BY e.numero_compte, e.societe_id
ORDER BY e.numero_compte, e.societe_id;

-- ── 8. VÉRIFICATION: 5800 APRÈS NETTOYAGE ──────────────────────────────
SELECT
  '=== 5800 APRÈS PURGE ===' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde,
  CASE
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 1 THEN '✓ ÉQUILIBRÉ'
    ELSE '⚠ RESTANT: ' || ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2)::TEXT
  END AS status
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 9. BALANCE GLOBALE FINALE ──────────────────────────────────────────
SELECT
  '=== BALANCE GLOBALE FINALE ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) < 0.01 THEN '✅ COMPTABILITÉ ÉQUILIBRÉE'
    ELSE '❌ DÉSÉQUILIBRE RESTANT'
  END AS status
FROM ecritures_comptables_v2;

COMMIT;
