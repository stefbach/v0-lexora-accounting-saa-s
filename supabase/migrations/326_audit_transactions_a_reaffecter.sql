-- ============================================================================
-- Migration 326 — AUDIT & RECLASSEMENT MANUEL DES TRANSACTIONS
-- ============================================================================
-- OBJECTIF:
--   Identifier les transactions à réaffecter manuellement:
--   1. Stéphane Bach (associé) → 455
--   2. Virements DDS EUR ↔ MUR (intra-société) → 5800
--   3. Virements DDS ↔ OCC (inter-sociétés) → 4411/4412
--
-- FORMAT:
--   - Audit sections identifient les transactions
--   - INSERT statements prêts à copier-coller pour reclassement manuel
--   - User peut vérifier avant d'exécuter
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 1: IDENTIFIER TRANSACTIONS STÉPHANE BACH → 455
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 1. TRANSACTIONS STÉPHANE BACH (À → 455) ===' AS section,
  e.id,
  e.date_ecriture,
  e.numero_compte,
  e.libelle,
  e.debit_mur,
  e.credit_mur,
  e.ref_folio,
  CASE
    WHEN e.debit_mur > 0 THEN 'RETRAIT (DR)'
    ELSE 'DÉPÔT (CR)'
  END AS type_mouvement,
  COUNT(*) OVER (PARTITION BY 1) AS nb_total
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
ORDER BY e.date_ecriture DESC
LIMIT 50;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 2: GÉNÉRER INSERT POUR RECLASSEMENT STÉPHANE BACH
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== PHASE 2. INSERT POUR STÉPHANE BACH → 455 ===' AS section,
  'À EXÉCUTER MANUELLEMENT APRÈS VÉRIFICATION:' AS instruction,
  '' AS blank,
  'DELETE FROM ecritures_comptables_v2 WHERE id IN (' || string_agg(DISTINCT e.id::text, ',') || ');' AS delete_old
FROM ecritures_comptables_v2 e
WHERE (e.libelle ILIKE '%BACH%' OR e.libelle ILIKE '%STEPHANE%')
  AND e.numero_compte IN ('512100', '512101')
  AND e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb';

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 3: IDENTIFIER VIREMENTS INTRA-DDS (EUR ↔ MUR) → 5800
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_virements_intra_dds AS
WITH virements_pairs AS (
  SELECT
    e1.date_ecriture,
    e1.id AS id_mur,
    e1.numero_compte AS compte_mur,
    GREATEST(e1.debit_mur, e1.credit_mur) AS montant,
    e2.id AS id_eur,
    e2.numero_compte AS compte_eur,
    ABS(e1.date_ecriture - e2.date_ecriture) AS jour_ecart
  FROM ecritures_comptables_v2 e1
  JOIN ecritures_comptables_v2 e2 ON (
    e1.societe_id = e2.societe_id
    AND e1.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
    AND ABS(e1.date_ecriture - e2.date_ecriture) <= 1
    AND ABS(GREATEST(e1.debit_mur, e1.credit_mur) - GREATEST(e2.debit_mur, e2.credit_mur)) < 1
  )
  WHERE e1.numero_compte = '512100'
    AND e2.numero_compte = '512101'
    AND (e1.debit_mur > 0 OR e1.credit_mur > 0)
    AND (e2.debit_mur > 0 OR e2.credit_mur > 0)
)
SELECT DISTINCT
  date_ecriture,
  id_mur,
  id_eur,
  montant,
  compte_mur,
  compte_eur
FROM virements_pairs
WHERE jour_ecart <= 1;

SELECT '=== AUDIT 2. VIREMENTS INTRA-DDS (MUR ↔ EUR → 5800) ===' AS section,
  t.date_ecriture,
  t.id_mur,
  t.id_eur,
  t.montant,
  'PAIRE À RECLASSER' AS action
FROM temp_virements_intra_dds t
ORDER BY t.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 4: IDENTIFIER VIREMENTS DDS ↔ OCC (RÉCEPTION/ENVOI) → 4411/4412
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_virements_inter_societes AS
WITH dds_receptions AS (
  SELECT
    e.id,
    e.date_ecriture,
    'RÉCEPTION' AS type_mouvement,
    'OCC → DDS' AS direction,
    GREATEST(e.debit_mur, e.credit_mur) AS montant,
    e.libelle,
    e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
    AND e.numero_compte IN ('512100', '512101')
    AND (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
    AND e.credit_mur > 0  -- Réception = crédit
),
dds_envois AS (
  SELECT
    e.id,
    e.date_ecriture,
    'ENVOI' AS type_mouvement,
    'DDS → OCC' AS direction,
    GREATEST(e.debit_mur, e.credit_mur) AS montant,
    e.libelle,
    e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'  -- DDS
    AND e.numero_compte IN ('512100', '512101')
    AND (e.libelle ILIKE '%OCC%' OR e.libelle ILIKE '%OBESITY%')
    AND e.debit_mur > 0  -- Envoi = débit
)
SELECT * FROM dds_receptions
UNION ALL
SELECT * FROM dds_envois;

SELECT '=== AUDIT 3. VIREMENTS INTER-SOCIÉTÉS (DDS ↔ OCC) ===' AS section,
  t.date_ecriture,
  t.type_mouvement,
  t.direction,
  t.montant,
  t.libelle,
  CASE
    WHEN t.type_mouvement = 'RÉCEPTION' THEN '→ 4411 (Créance sur OCC)'
    ELSE '→ 4412 (Dette à OCC)'
  END AS compte_cible,
  t.id AS transaction_id
FROM temp_virements_inter_societes t
ORDER BY t.date_ecriture DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 5: RÉSUMÉ POUR RECLASSEMENT MANUEL
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== AUDIT 4. RÉSUMÉ DES TRANSACTIONS À RÉAFFECTER ===' AS section,
  (SELECT COUNT(*) FROM ecritures_comptables_v2
   WHERE (libelle ILIKE '%BACH%' OR libelle ILIKE '%STEPHANE%')
   AND numero_compte IN ('512100', '512101')
   AND societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb') AS nb_bach,
  (SELECT COUNT(*) FROM temp_virements_intra_dds) AS nb_virements_intra_dds,
  (SELECT COUNT(*) FROM temp_virements_inter_societes) AS nb_virements_inter_societes;

SELECT '=== INSTRUCTIONS RECLASSEMENT MANUEL ===' AS section,
  '1. Vérifier les transactions identifiées dans les audits ci-dessus' AS step1,
  '2. Pour chaque groupe, créer les écritures correctes:' AS step2,
  '   - Stéphane Bach: supprimer de 512 + créer sur 455' AS step2a,
  '   - Virements intra: supprimer de 512 + créer sur 5800' AS step2b,
  '   - Virements inter: supprimer de 512 + créer sur 4411/4412' AS step2c,
  '3. Exécuter les INSERT/DELETE dans le bon ordre' AS step3,
  '4. Valider balance = 0.00 après chaque batch' AS step4;

COMMIT;
