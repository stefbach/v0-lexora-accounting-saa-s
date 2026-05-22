-- ============================================================================
-- Diagnostic 318 — Investigation 512101 DDS anomalie
-- ============================================================================
-- ANOMALIE: 512101 DDS a 0.00 débit et 9.29M crédit (impossible)
-- HYPOTHÈSE: Restes d'écritures Mig 314 non purgées par 315
-- ============================================================================

-- ── 1. SOURCES DES ÉCRITURES SUR 512101 DDS ─────────────────────────────
-- Grouper par préfixe ref_folio pour voir d'où viennent les écritures
SELECT
  '=== SOURCES 512101 DDS ===' AS section,
  CASE
    WHEN ref_folio LIKE 'MC-intercompte-fix314%' THEN '❌ Mig 314 (à supprimer)'
    WHEN ref_folio LIKE 'MC-intercompte-verified316%' THEN '⚠ Mig 316'
    WHEN ref_folio LIKE 'MC-intercompte-final317%' THEN '✓ Mig 317'
    WHEN ref_folio LIKE 'MC-%' THEN 'MC (normal bank entry)'
    ELSE 'Autre source: ' || COALESCE(LEFT(ref_folio, 30), 'NULL')
  END AS source,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte = '512101'
  AND societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
GROUP BY 1, 2
ORDER BY 2;

-- ── 2. DÉTAIL DES ÉCRITURES SUR 512101 DDS (TOP 20 par montant) ─────────
SELECT
  '=== TOP ÉCRITURES 512101 DDS ===' AS section,
  date_ecriture,
  debit_mur,
  credit_mur,
  devise_origine,
  ref_folio,
  libelle,
  description
FROM ecritures_comptables_v2
WHERE numero_compte = '512101'
  AND societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
ORDER BY GREATEST(debit_mur, credit_mur) DESC
LIMIT 20;

-- ── 3. RESTE-T-IL DES ÉCRITURES MIG 314 PAS SUPPRIMÉES ? ────────────────
SELECT
  '=== ÉCRITURES MIG 314 RESTANTES ===' AS section,
  numero_compte,
  societe_id,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit
FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'MC-intercompte-fix314%'
GROUP BY numero_compte, societe_id
ORDER BY numero_compte;

-- ── 4. COMPARER AVEC SOLDE BANCAIRE RÉEL (comptes_bancaires.solde_actuel) ─
SELECT
  '=== SOLDE BANCAIRE RÉEL vs COMPTABLE ===' AS section,
  cb.societe_id,
  (SELECT nom FROM societes WHERE id = cb.societe_id) AS societe_nom,
  cb.compte_comptable,
  cb.devise,
  cb.banque,
  cb.solde_actuel AS solde_bancaire_reel,
  COALESCE((
    SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0) AS solde_comptable,
  cb.solde_actuel - COALESCE((
    SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0) AS ecart
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL
ORDER BY cb.societe_id, cb.compte_comptable;

-- ── 5. SOLDE 5800 ACTUEL ────────────────────────────────────────────────
SELECT
  '=== 5800 ACTUEL ===' AS section,
  societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2 e
WHERE numero_compte = '5800'
GROUP BY societe_id
ORDER BY societe_id;

-- ── 6. BALANCE GLOBALE ──────────────────────────────────────────────────
SELECT
  '=== BALANCE GLOBALE ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;
