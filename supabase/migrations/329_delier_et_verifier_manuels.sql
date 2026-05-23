-- ============================================================================
-- Migration 329 — DÉLIER RECLASSEMENT AUTO & PRÉPARER RECLASSEMENT MANUEL
-- ============================================================================
-- ÉTAPE 1: Supprimer les écritures créées par Mig 328 (délier)
-- ÉTAPE 2: Identifier exactement ce qu'il faut réaffecter
-- ÉTAPE 3: Générer les INSERT/DELETE manuels prêts à copier-coller
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1: SUPPRIMER LES ÉCRITURES RECLASSEMENT-328 (DÉLIER)
-- ──────────────────────────────────────────────────────────────────────────

DELETE FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'RECLASSEMENT-328%';

SELECT '=== ÉTAPE 1: SUPPRESSION MIGS 328 ===' AS section,
  'Écritures RECLASSEMENT-328 supprimées' AS action;

-- ──────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2: IDENTIFIER TRANSACTIONS STÉPHANE BACH
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== ÉTAPE 2A: TRANSACTIONS STÉPHANE BACH À RECLASSER ===' AS section,
  e.id,
  e.date_ecriture,
  e.numero_compte,
  e.devise_origine,
  e.libelle,
  e.debit_mur,
  e.credit_mur,
  CASE WHEN e.debit_mur > 0 THEN 'RETRAIT' ELSE 'DÉPÔT' END AS type_mouvement
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- Montants totaux Stéphane Bach
SELECT '=== MONTANTS TOTAUX STÉPHANE BACH ===' AS section,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_retrait,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_depot
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb';

-- ──────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3: IDENTIFIER VIREMENTS INTRA-DDS
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== ÉTAPE 2B: VIREMENTS INTRA-DDS (EUR ↔ MUR) ===' AS section,
  e1.id AS id_512100_mur,
  e1.date_ecriture,
  e1.numero_compte AS compte_mur,
  GREATEST(e1.debit_mur, e1.credit_mur) AS montant_mur,
  e1.libelle,
  e2.id AS id_512101_eur,
  e2.numero_compte AS compte_eur,
  GREATEST(e2.debit_mur, e2.credit_mur) AS montant_eur
FROM ecritures_comptables_v2 e1
JOIN ecritures_comptables_v2 e2 ON (
  e1.societe_id = e2.societe_id
  AND e1.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND ABS(e1.date_ecriture - e2.date_ecriture) <= 1
  AND ABS(GREATEST(e1.debit_mur, e1.credit_mur) - GREATEST(e2.debit_mur, e2.credit_mur)) < 1
)
WHERE e1.numero_compte = '512100'
  AND e2.numero_compte = '512101'
  AND e1.libelle NOT ILIKE '%BACH%'
  AND e1.libelle NOT ILIKE '%STEPHANE%'
  AND e1.libelle NOT ILIKE '%OCC%'
  AND e1.libelle NOT ILIKE '%OBESITY%'
ORDER BY e1.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- ÉTAPE 4: IDENTIFIER VIREMENTS DDS ↔ OCC
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== ÉTAPE 2C: VIREMENTS DDS ↔ OCC ===' AS section,
  e.id,
  e.date_ecriture,
  e.numero_compte,
  e.libelle,
  e.debit_mur,
  e.credit_mur,
  CASE
    WHEN e.credit_mur > 0 THEN '📥 RÉCEPTION (OCC → DDS) → 4411'
    ELSE '📤 ENVOI (DDS → OCC) → 4412'
  END AS action_a_faire
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- ÉTAPE 5: INSTRUCTIONS RECLASSEMENT MANUEL
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== ÉTAPE 3: INSTRUCTIONS RECLASSEMENT MANUEL ===' AS section,
  '✅ VOIR LES RÉSULTATS CI-DESSUS' AS instruction,
  '' AS blank,
  'POUR CHAQUE TRANSACTION:' AS step1,
  '1. Copier le DELETE (pour supprimer de 512xxx)' AS step1a,
  '2. Exécuter le DELETE dans Supabase' AS step1b,
  '3. Copier l''INSERT (pour créer sur nouveau compte)' AS step2a,
  '4. Exécuter l''INSERT dans Supabase' AS step2b,
  '5. Vérifier balance = 0.00 après chaque batch' AS step3;

-- ──────────────────────────────────────────────────────────────────────────
-- GÉNÉRER DELETE/INSERT POUR STÉPHANE BACH → 455
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== INSERT/DELETE STÉPHANE BACH → 455 ===' AS section,
  'DELETE:' AS type;

SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || e.id::text || ''';'
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

SELECT '' AS blank, 'INSERT:' AS type;

SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (''' ||
  gen_random_uuid()::text || ''', ''' || e.societe_id::text || ''', ''' || e.date_ecriture::text || ''', ''RECLASSEMENT-329-BACH-' || e.id::text || ''', ''455'', ''Compte courant associé'', ''Reclassement associé'', ''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' || e.credit_mur::text || ', ''BNQ'', ''MUR'', NOW());'
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- GÉNÉRER DELETE/INSERT POUR VIREMENTS INTRA-DDS → 5800
-- ──────────────────────────────────────────────────────────────────────────

SELECT '' AS blank, '=== INSERT/DELETE VIREMENTS INTRA-DDS → 5800 ===' AS section,
  'PAIRES (même montant, dates proches):' AS type;

WITH pairs AS (
  SELECT
    e1.id AS id_512100,
    e1.date_ecriture,
    e1.debit_mur,
    e1.credit_mur,
    e2.id AS id_512101
  FROM ecritures_comptables_v2 e1
  JOIN ecritures_comptables_v2 e2 ON (
    e1.societe_id = e2.societe_id
    AND e1.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
    AND ABS(e1.date_ecriture - e2.date_ecriture) <= 1
    AND ABS(GREATEST(e1.debit_mur, e1.credit_mur) - GREATEST(e2.debit_mur, e2.credit_mur)) < 1
  )
  WHERE e1.numero_compte = '512100'
    AND e2.numero_compte = '512101'
    AND e1.libelle NOT ILIKE '%BACH%'
    AND e1.libelle NOT ILIKE '%OCC%'
)
SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || p.id_512100::text || ''';' ||
  ' -- 512100' AS delete_sql
FROM pairs p
ORDER BY p.date_ecriture;

-- ──────────────────────────────────────────────────────────────────────────
-- GÉNÉRER DELETE/INSERT POUR VIREMENTS INTER-DDS ↔ OCC
-- ──────────────────────────────────────────────────────────────────────────

SELECT '' AS blank, '=== INSERT/DELETE VIREMENTS DDS ↔ OCC ===' AS section,
  'RÉCEPTIONS (4411) et ENVOIS (4412):' AS type;

SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || e.id::text || ''';' ||
  ' -- ' || CASE WHEN e.credit_mur > 0 THEN 'RÉCEPTION' ELSE 'ENVOI' END
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- RÉSUMÉ FINAL
-- ──────────────────────────────────────────────────────────────────────────

SELECT '' AS blank, '=== PROCHAINES ÉTAPES ===' AS section,
  '1. Copier les DELETE et INSERT ci-dessus' AS step1,
  '2. Exécuter chaque DELETE dans Supabase' AS step2,
  '3. Exécuter l''INSERT correspondant' AS step3,
  '4. Valider: SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) FROM ecritures_comptables_v2;' AS step4,
  '5. Résultat attendu: 0.00' AS step5;

COMMIT;
