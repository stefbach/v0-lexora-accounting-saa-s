-- ============================================================================
-- Migration 327 — GÉNÉRER INSERT/DELETE SQL POUR RECLASSEMENT MANUEL
-- ============================================================================
-- Cette migration génère les INSERT/DELETE prêts à copier-coller pour:
-- 1. Stéphane Bach → 455
-- 2. Virements intra-DDS → 5800
-- 3. Virements inter-DDS/OCC → 4411/4412
--
-- Format: SQL prêt à exécuter directement
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1: STÉPHANE BACH → 455 (COMPTE COURANT ASSOCIÉ)
-- ══════════════════════════════════════════════════════════════════════════

SELECT '=== SECTION 1: STÉPHANE BACH → 455 ===' AS section,
  'Copier les DELETE et INSERT ci-dessous et exécuter en Supabase' AS instruction;

-- DELETE des écritures actuelles (512xxx)
SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || e.id::text || ''';' AS delete_sql
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
ORDER BY e.date_ecriture DESC;

-- INSERT sur 455 (Compte courant associé)
SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (' ||
  '''' || gen_random_uuid()::text || ''', ' ||
  '''' || e.societe_id::text || ''', ' ||
  '''' || e.date_ecriture::text || ''', ' ||
  '''RECLASSEMENT-327-BACH-' || e.id::text || ''', ' ||
  '''455'', ' ||
  '''Compte courant associé - Stéphane Bach'', ' ||
  '''Reclassement virement associé (mig 327)'', ' ||
  '''''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' ||
  e.credit_mur::text || ', ' ||
  '''BNQ'', ' ||
  '''MUR'', ' ||
  'NOW());' AS insert_sql
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2: VIREMENTS INTRA-DDS (EUR ↔ MUR) → 5800
-- ══════════════════════════════════════════════════════════════════════════

SELECT '=== SECTION 2: VIREMENTS INTRA-DDS (EUR ↔ MUR) → 5800 ===' AS section,
  'Paires de virements 512100 ↔ 512101 (même montant, dates proches)' AS instruction;

CREATE TEMP TABLE temp_intra_dds_pairs AS
WITH pairs AS (
  SELECT
    e1.id AS id_512100,
    e1.date_ecriture,
    GREATEST(e1.debit_mur, e1.credit_mur) AS montant,
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
    AND e1.libelle NOT ILIKE '%STEPHANE%'
    AND e1.libelle NOT ILIKE '%OCC%'
    AND e1.libelle NOT ILIKE '%OBESITY%'
    AND (e1.debit_mur > 0 OR e1.credit_mur > 0)
    AND (e2.debit_mur > 0 OR e2.credit_mur > 0)
)
SELECT DISTINCT * FROM pairs;

-- DELETE pour 512100
SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || t.id_512100::text || ''';' AS delete_sql
FROM temp_intra_dds_pairs t
ORDER BY t.date_ecriture;

-- DELETE pour 512101
SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || t.id_512101::text || ''';' AS delete_sql
FROM temp_intra_dds_pairs t
ORDER BY t.date_ecriture;

-- INSERT sur 5800 pour 512100
SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (' ||
  '''' || gen_random_uuid()::text || ''', ' ||
  '''' || e.societe_id::text || ''', ' ||
  '''' || e.date_ecriture::text || ''', ' ||
  '''RECLASSEMENT-327-INTRA-' || e.id::text || ''', ' ||
  '''5800'', ' ||
  '''Virements internes (transit)'', ' ||
  '''Reclassement virement intra-DDS MUR (mig 327)'', ' ||
  '''''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' ||
  e.credit_mur::text || ', ' ||
  '''BNQ'', ' ||
  '''MUR'', ' ||
  'NOW());' AS insert_sql
FROM ecritures_comptables_v2 e
WHERE e.id IN (SELECT id_512100 FROM temp_intra_dds_pairs)
ORDER BY e.date_ecriture;

-- INSERT sur 5800 pour 512101 (devise EUR)
SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (' ||
  '''' || gen_random_uuid()::text || ''', ' ||
  '''' || e.societe_id::text || ''', ' ||
  '''' || e.date_ecriture::text || ''', ' ||
  '''RECLASSEMENT-327-INTRA-' || e.id::text || ''', ' ||
  '''5800'', ' ||
  '''Virements internes (transit)'', ' ||
  '''Reclassement virement intra-DDS EUR (mig 327)'', ' ||
  '''''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' ||
  e.credit_mur::text || ', ' ||
  '''BNQ'', ' ||
  '''EUR'', ' ||
  'NOW());' AS insert_sql
FROM ecritures_comptables_v2 e
WHERE e.id IN (SELECT id_512101 FROM temp_intra_dds_pairs)
ORDER BY e.date_ecriture;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3: VIREMENTS INTER-SOCIÉTÉS (DDS ↔ OCC) → 4411/4412
-- ══════════════════════════════════════════════════════════════════════════

SELECT '=== SECTION 3: VIREMENTS INTER-SOCIÉTÉS (DDS ↔ OCC) ===' AS section,
  'DELETE des écritures actuelles sur 512xxx' AS instruction;

-- DELETE pour virements avec OCC/OBESITY en libellé
SELECT
  'DELETE FROM ecritures_comptables_v2 WHERE id = ''' || e.id::text || ''';' AS delete_sql
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
ORDER BY e.date_ecriture DESC;

-- INSERT sur 4411 (RÉCEPTIONS = créances sur OCC)
SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (' ||
  '''' || gen_random_uuid()::text || ''', ' ||
  '''' || e.societe_id::text || ''', ' ||
  '''' || e.date_ecriture::text || ''', ' ||
  '''RECLASSEMENT-327-INTER-' || e.id::text || ''', ' ||
  '''4411'', ' ||
  '''Créances inter-sociétés'', ' ||
  '''Reclassement réception OCC (mig 327)'', ' ||
  '''''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' ||
  e.credit_mur::text || ', ' ||
  '''BNQ'', ' ||
  '''MUR'', ' ||
  'NOW());' AS insert_sql
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND e.credit_mur > 0  -- RÉCEPTION
ORDER BY e.date_ecriture DESC;

-- INSERT sur 4412 (ENVOIS = dettes à OCC)
SELECT
  'INSERT INTO ecritures_comptables_v2 (id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at) VALUES (' ||
  '''' || gen_random_uuid()::text || ''', ' ||
  '''' || e.societe_id::text || ''', ' ||
  '''' || e.date_ecriture::text || ''', ' ||
  '''RECLASSEMENT-327-INTER-' || e.id::text || ''', ' ||
  '''4412'', ' ||
  '''Dettes inter-sociétés'', ' ||
  '''Reclassement envoi OCC (mig 327)'', ' ||
  '''''' || REPLACE(e.libelle, '''', '''''') || ''', ' ||
  e.debit_mur::text || ', ' ||
  e.credit_mur::text || ', ' ||
  '''BNQ'', ' ||
  '''MUR'', ' ||
  'NOW());' AS insert_sql
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND e.debit_mur > 0  -- ENVOI
ORDER BY e.date_ecriture DESC;

-- ══════════════════════════════════════════════════════════════════════════
-- RÉSUMÉ & INSTRUCTIONS FINALES
-- ══════════════════════════════════════════════════════════════════════════

SELECT '=== RÉSUMÉ RECLASSEMENT ===' AS section,
  'EXÉCUTER DANS CET ORDRE:' AS instruction,
  '1. Copier tous les DELETE (Section 1, 2, 3)' AS step1,
  '2. Exécuter tous les DELETE ensemble' AS step2,
  '3. Copier tous les INSERT (Section 1, 2, 3)' AS step3,
  '4. Exécuter tous les INSERT ensemble' AS step4,
  '5. Valider: SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) FROM ecritures_comptables_v2;' AS step5,
  '6. Résultat attendu: 0.00' AS step6;

COMMIT;
