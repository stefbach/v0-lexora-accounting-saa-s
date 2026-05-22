-- ============================================================================
-- Migration 320 — RÉPARER LA DOUBLE-ENTRY (after Mig 319)
-- ============================================================================
-- PROBLÈME APRÈS MIG 319:
--   Mig 319 a supprimé 9.3M d'écritures sur 512100/512101 (fausses, pas de
--   match bancaire). MAIS chaque écriture bancaire a une contrepartie sur
--   un AUTRE compte (401, 411, 6xxx, 5800, etc.) avec le même ref_folio.
--
--   Résultat: les contreparties sont devenues orphelines
--   → Balance globale: déséquilibre de -6.7M MUR
--
-- SOLUTION:
--   Identifier ref_folios qui ont des écritures sur 512xxx + contreparties
--   ailleurs. Si le côté 512 a été supprimé (n'existe plus), supprimer
--   aussi les contreparties.
--
-- RÈGLE: Chaque "transaction" (groupée par ref_folio) doit être DR=CR.
--        Sinon, supprimer le groupe entier.
-- ============================================================================

BEGIN;

-- ── 1. IDENTIFIER LES REF_FOLIOS DÉSÉQUILIBRÉS ──────────────────────────
-- Une transaction équilibrée a SUM(debit) = SUM(credit) pour son ref_folio
CREATE TEMP TABLE temp_refs_deséquilibrées AS
SELECT
  ref_folio,
  societe_id,
  COUNT(*) AS nb_lignes,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS deséquilibre
FROM ecritures_comptables_v2
WHERE ref_folio IS NOT NULL
GROUP BY ref_folio, societe_id
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01;

SELECT
  '=== REF_FOLIOS DÉSÉQUILIBRÉS ===' AS section,
  COUNT(*) AS nb_refs_deséquilibrés,
  ROUND(SUM(ABS(deséquilibre))::numeric, 2) AS total_deséquilibre
FROM temp_refs_deséquilibrées;

-- ── 2. DÉTAIL DES TOP REF_FOLIOS DÉSÉQUILIBRÉS ─────────────────────────
SELECT
  '=== TOP 20 REF_FOLIOS DÉSÉQUILIBRÉS ===' AS section,
  ref_folio,
  societe_id,
  nb_lignes,
  total_debit,
  total_credit,
  deséquilibre
FROM temp_refs_deséquilibrées
ORDER BY ABS(deséquilibre) DESC
LIMIT 20;

-- ── 3. DÉCISION : 2 OPTIONS ────────────────────────────────────────────
-- Option A (CONSERVATRICE): Supprimer toutes les lignes orphelines
--   → Restaure l'équilibre MAIS peut perdre des données légitimes
--
-- Option B (RECRÉER): Recréer les lignes 512xxx manquantes au solde réel
--   → Préserve les données MAIS complexe et risqué
--
-- On choisit Option A: supprimer les lignes orphelines pour rétablir balance.
-- Ces lignes étaient des contreparties de transactions qui n'existent pas
-- réellement (puisque Mig 319 a vérifié contre les vraies données bancaires).

-- ── 4. SUPPRIMER LES LIGNES ORPHELINES (même ref_folio que les supprimés) ─
DELETE FROM ecritures_comptables_v2 e
WHERE EXISTS (
  SELECT 1 FROM temp_refs_deséquilibrées trd
  WHERE trd.ref_folio = e.ref_folio
    AND trd.societe_id = e.societe_id
);

SELECT
  '=== SUPPRESSION DES ORPHELINES ===' AS section,
  'Lignes appartenant à des ref_folios déséquilibrés supprimées' AS action;

-- ── 5. VÉRIFICATION: BALANCE GLOBALE ──────────────────────────────────
SELECT
  '=== BALANCE GLOBALE APRÈS MIG 320 ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) < 0.01 THEN '✅ ÉQUILIBRÉ'
    ELSE '❌ DÉSÉQUILIBRE: ' || ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)::TEXT
  END AS status
FROM ecritures_comptables_v2;

-- ── 6. VÉRIFICATION: SOLDES 512xxx vs RÉEL BANCAIRE ────────────────────
SELECT
  '=== SOLDES 512 APRÈS MIG 320 ===' AS section,
  e.numero_compte,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde_comptable,
  COALESCE((
    SELECT solde_actuel FROM comptes_bancaires cb
    WHERE cb.compte_comptable = e.numero_compte
      AND cb.societe_id = e.societe_id LIMIT 1
  ), 0) AS solde_reel_bancaire,
  ROUND((COALESCE((
    SELECT solde_actuel FROM comptes_bancaires cb
    WHERE cb.compte_comptable = e.numero_compte
      AND cb.societe_id = e.societe_id LIMIT 1
  ), 0) - (SUM(e.debit_mur) - SUM(e.credit_mur)))::numeric, 2) AS ecart
FROM ecritures_comptables_v2 e
WHERE e.numero_compte IN ('512100', '512101')
GROUP BY e.numero_compte, e.societe_id
ORDER BY e.numero_compte, e.societe_id;

-- ── 7. VÉRIFICATION: 5800 ──────────────────────────────────────────────
SELECT
  '=== 5800 APRÈS MIG 320 ===' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 8. VÉRIFICATION: TOTAUX PAR CLASSE ─────────────────────────────────
SELECT
  '=== TOTAUX PAR CLASSE ===' AS section,
  SUBSTRING(numero_compte FROM 1 FOR 1) AS classe,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
GROUP BY SUBSTRING(numero_compte FROM 1 FOR 1)
ORDER BY classe;

COMMIT;
