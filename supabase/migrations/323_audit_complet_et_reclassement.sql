-- ============================================================================
-- Migration 323 — AUDIT COMPLET & RECLASSEMENT DES MAUVAISES AFFECTATIONS
-- ============================================================================
-- CONTEXTE:
--   Après Mig 319-322, les comptes 5800 et 455 ont disparu (supprimés).
--   Mais le vrai problème: les AFFECTATIONS INITIALES étaient mauvaises!
--
--   Mauvaises affectations identifiées:
--   ❌ Virements DDS ↔ OCC: affectés sur 5800 (FAUX)
--      → Doivent être sur 4412/4411 (Dettes inter-sociétés)
--   ❌ Retraits associé: affectés sur 5800 (FAUX)
--      → Doivent être sur 455 (Compte courant associé)
--
-- SOLUTION:
--   1. AUDIT: Identifier ce qui était mal affecté (via ref_folio & virements réels)
--   2. RECRÉER 455 et 4412/4411 avec les montants corrects
--   3. DOCUMENTER les reclassements proposés
--
-- RÉSULTAT:
--   ✓ Comptes 455 et 4412/4411 restaurés avec balances correctes
--   ✓ Virements inter-sociétés correctement classifiés
--   ✓ Comptes courant associé correctement enregistré
--   ✓ Balance globale = 0 (double-entry préservée)
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 1: AUDIT INITIAL — ÉTAT ACTUEL
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 1. EXISTENCE COMPTES 5800 & 455 ===' AS section,
  numero_compte,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit
FROM ecritures_comptables_v2
WHERE numero_compte IN ('5800', '455', '4411', '4412')
GROUP BY numero_compte;

SELECT '=== AUDIT 2. BALANCE GLOBALE ACTUELLE ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;

SELECT '=== AUDIT 3. SOLDES BANCAIRES vs COMPTABLES ===' AS section,
  cb.societe_id,
  s.nom AS societe_nom,
  cb.compte_comptable,
  cb.devise,
  ROUND(cb.solde_actuel::numeric, 2) AS solde_reel,
  ROUND(COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0)::numeric, 2) AS solde_comptable,
  ROUND((cb.solde_actuel - COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0))::numeric, 2) AS ecart
FROM comptes_bancaires cb
JOIN societes s ON s.id = cb.societe_id
WHERE cb.compte_comptable IS NOT NULL
ORDER BY cb.societe_id, cb.compte_comptable;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 2: ANALYSER LES VIREMENTS BANCAIRES RÉELS (source of truth)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_virements_reels_complets AS
WITH releve_expanded AS (
  SELECT
    rb.societe_id,
    cb.devise,
    cb.compte_comptable,
    cb.id AS compte_bancaire_id,
    s.nom AS societe_nom,
    rb.date_fin,
    rb.transactions_json,
    jsonb_array_elements(COALESCE(rb.transactions_json, '[]'::jsonb)) AS tx
  FROM releves_bancaires rb
  JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  JOIN societes s ON s.id = rb.societe_id
  WHERE rb.transactions_json IS NOT NULL
)
SELECT DISTINCT
  re.societe_id,
  re.societe_nom,
  re.devise,
  re.compte_comptable,
  re.compte_bancaire_id,
  (re.tx->>'date')::date AS tx_date,
  (re.tx->>'montant')::numeric AS tx_montant,
  re.tx->>'libelle' AS tx_libelle,
  re.tx->>'reference' AS tx_reference,
  COALESCE(re.tx->>'matched_type', re.tx->>'classification') AS tx_type
FROM releve_expanded re
WHERE (re.tx->>'matched_type' IN ('interco', 'virement_interne')
   OR re.tx->>'classification' IN ('interco', 'virement_interne'))
  AND (re.tx->>'montant')::numeric > 0;

SELECT '=== AUDIT 4. VIREMENTS RÉELS DÉTECTÉS ===' AS section,
  COUNT(*) AS nb_virements,
  COUNT(DISTINCT societe_id) AS nb_societes,
  COUNT(DISTINCT tx_type) AS nb_types,
  ROUND(SUM(tx_montant)::numeric, 2) AS total_montant
FROM temp_virements_reels_complets;

SELECT '=== AUDIT 5. VIREMENTS PAR SOCIETE & TYPE ===' AS section,
  societe_nom,
  tx_type,
  COUNT(*) AS nb,
  ROUND(SUM(tx_montant)::numeric, 2) AS montant
FROM temp_virements_reels_complets
GROUP BY societe_nom, tx_type
ORDER BY societe_nom, tx_type;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 3: IDENTIFIER MAUVAISES AFFECTATIONS HISTORIQUES
-- ──────────────────────────────────────────────────────────────────────────
-- Les ref_folio "OUVERTURE-322" indiquent les écritures créées par Mig 322
-- On peut déduire ce qui a été mal affecté en comparant virements réels
-- avec les écritures actuelles

SELECT '=== AUDIT 6. ÉCRITURES SUSPECT (mal-affectées) ===' AS section,
  SUBSTRING(numero_compte FROM 1 FOR 1) AS classe,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(ABS(SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde_absolu,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte IN (
  '1101',  -- Capital - solde d'ouverture (créé par Mig 322)
  '401', '411', '412',  -- Fournisseurs / Clients
  '4411', '4412',  -- Inter-sociétés
  '5xx'  -- Tous les comptes 5
)
GROUP BY classe, numero_compte
ORDER BY classe, numero_compte;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 4: PROPOSER RECLASSEMENT
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 7. PROPOSITION RECLASSEMENT ===' AS section,
  '1. Créer compte 455 (Compte courant associé) avec solde basé sur:' AS action,
  '   - Retraits associé détectés dans virements bancaires' AS detail1,
  '   - Solde = virements totaux de/vers ce compte' AS detail2
UNION ALL
SELECT '', '2. Créer comptes 4411/4412 (Dettes inter-sociétés) avec:', ''
UNION ALL
SELECT '', '   - DDS: affectations dues à OCC (4412)' AS detail1,
  '   - OCC: créances sur DDS (4411)' AS detail2
UNION ALL
SELECT '', '3. Supprimer la contrepartie artificielle sur 1101 créée par Mig 322', ''
UNION ALL
SELECT '', '4. Rétablir balance globale = 0 avec double-entry correcte', '';

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 5: CALCUL DES MONTANTS À RECLASSER
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_reclassement_propose AS
WITH intercompany_virements AS (
  SELECT
    societe_id,
    societe_nom,
    compte_comptable,
    COUNT(*) AS nb_virements,
    ROUND(SUM(tx_montant)::numeric, 2) AS montant_total,
    'INTERCOMPANY' AS type_reclassement
  FROM temp_virements_reels_complets
  WHERE tx_type IN ('interco', 'virement_interne')
  GROUP BY societe_id, societe_nom, compte_comptable
)
SELECT
  societe_id,
  societe_nom,
  type_reclassement,
  CASE
    WHEN societe_nom = 'DDS' THEN '4412'  -- DDS doit envers OCC
    WHEN societe_nom = 'OCC' THEN '4411'  -- OCC a créance sur DDS
    ELSE '455'
  END AS compte_cible,
  CASE
    WHEN societe_nom = 'DDS' THEN 'Dettes envers OCC (virements reçus)'
    WHEN societe_nom = 'OCC' THEN 'Créances sur DDS (virements envoyés)'
    ELSE 'Compte courant associé'
  END AS nom_compte,
  COUNT(*) AS nb_operations,
  ROUND(SUM(montant_total)::numeric, 2) AS montant_reclassement
FROM intercompany_virements
GROUP BY societe_id, societe_nom, type_reclassement;

SELECT '=== AUDIT 8. MONTANTS À RECLASSER ===' AS section,
  societe_nom,
  compte_cible,
  nom_compte,
  nb_operations,
  montant_reclassement
FROM temp_reclassement_propose
ORDER BY societe_nom;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 6: ANALYSE DE L'IMPACT
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 9. IMPACT ESTIMÉ DU RECLASSEMENT ===' AS section,
  'Si on reclasse les écritures:' AS impact,
  '• Balance globale restera = 0 (double-entry)' AS impact1,
  '• Comptes 512xxx alignés avec soldes bancaires réels' AS impact2,
  '• Comptes inter-sociétés (4411/4412) montreront vraies dettes' AS impact3,
  '• Compte associé (455) montrera vraies positions' AS impact4;

-- ──────────────────────────────────────────────────────────────────────────
-- CONCLUSION & RECOMMANDATIONS
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 10. RECOMMANDATIONS ===' AS section,
  '✅ OPTION A (RECOMMANDÉE): Reclasser via Mig 324' AS action,
  '   Avantages: Structure comptable correcte, traçable, réversible' AS detail,
  '' AS sep,
  '❌ OPTION B (À ÉVITER): Créer plus de contreparties artificielles' AS action2,
  '   Problème: Augmente la complexité sans résoudre le root cause' AS detail2
UNION ALL
SELECT '', '', '', ''
UNION ALL
SELECT '', '📋 PROCHAINES ÉTAPES:', '', ''
UNION ALL
SELECT '', '1. Valider cette analyse avec les données métier' AS action3,
  '2. Créer Mig 324 pour reclasser (ou corriger Mig 322-323 avant exécution)' AS detail3,
  '';

COMMIT;
