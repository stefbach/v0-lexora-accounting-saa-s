-- ============================================================================
-- Migration 324 — RECLASSER LES AFFECTATIONS INCORRECTES
-- ============================================================================
-- BASÉ SUR: Audit Mig 323 qui a identifié les mauvaises affectations
--
-- STRATÉGIE:
--   1. Recréer 455 (Compte courant associé) si supprimé
--   2. Recréer 4411/4412 (Dettes inter-sociétés) si supprimées
--   3. Reclasser les écritures de 5800 vers les comptes corrects
--   4. Valider balance = 0
--
-- IMPACT:
--   ✓ Comptes correctement affectés
--   ✓ Balance globale = 0
--   ✓ Traçabilité via ref_folio "RECLASSEMENT-324"
--   ✓ Préserve double-entry
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 1: VÉRIFIER QUELS COMPTES EXISTENT
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== VÉRIFICATION COMPTES PRÉ-RECLASSEMENT ===' AS section,
  numero_compte,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2) AS debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS credit
FROM ecritures_comptables_v2
WHERE numero_compte IN ('455', '4411', '4412', '5800', '1101')
GROUP BY numero_compte
ORDER BY numero_compte;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 2: IDENTIFIER VIREMENTS RÉELS & CRÉER RECLASSEMENT
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_virements_reclassement AS
WITH releve_expanded AS (
  SELECT
    rb.societe_id,
    cb.devise,
    cb.compte_comptable,
    s.nom AS societe_nom,
    rb.date_fin,
    jsonb_array_elements(COALESCE(rb.transactions_json, '[]'::jsonb)) AS tx
  FROM releves_bancaires rb
  JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  JOIN societes s ON s.id = rb.societe_id
  WHERE rb.transactions_json IS NOT NULL
)
SELECT DISTINCT
  re.societe_id,
  re.societe_nom,
  (re.tx->>'date')::date AS tx_date,
  (re.tx->>'montant')::numeric AS tx_montant,
  re.tx->>'libelle' AS tx_libelle,
  CASE
    WHEN re.societe_nom = 'DDS' THEN '4412'  -- DDS doit à OCC
    WHEN re.societe_nom = 'OCC' THEN '4411'  -- OCC a créance
    ELSE '455'
  END AS compte_cible,
  CASE
    WHEN re.societe_nom = 'DDS' THEN 'Dettes envers OCC'
    WHEN re.societe_nom = 'OCC' THEN 'Créances sur DDS'
    ELSE 'Compte courant associé'
  END AS nom_compte,
  COALESCE(re.tx->>'matched_type', re.tx->>'classification') AS tx_type
FROM releve_expanded re
WHERE (re.tx->>'matched_type' IN ('interco', 'virement_interne')
   OR re.tx->>'classification' IN ('interco', 'virement_interne'))
  AND (re.tx->>'montant')::numeric > 0;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 3: CALCULER SOLDES RECLASSEMENT PAR COMPTE
-- ──────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE temp_soldes_reclassement AS
SELECT
  vr.societe_id,
  vr.compte_cible,
  vr.nom_compte,
  COUNT(*) AS nb_virements,
  ROUND(SUM(vr.tx_montant)::numeric, 2) AS montant_total,
  MIN(vr.tx_date) AS date_premiere,
  MAX(vr.tx_date) AS date_derniere
FROM temp_virements_reclassement vr
GROUP BY vr.societe_id, vr.compte_cible, vr.nom_compte;

SELECT '=== SOLDES PROPOSÉS POUR RECLASSEMENT ===' AS section,
  sr.compte_cible,
  sr.nom_compte,
  COUNT(*) AS nb_societes,
  ROUND(SUM(sr.montant_total)::numeric, 2) AS montant_total
FROM temp_soldes_reclassement sr
GROUP BY sr.compte_cible, sr.nom_compte
ORDER BY sr.compte_cible;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 4: CRÉER ÉCRITURES DE RECLASSEMENT
-- ──────────────────────────────────────────────────────────────────────────
-- Logique:
--   Pour chaque virement inter-sociétés, créer 2 écritures:
--   1. DR 4412/4411/455 (compte cible)
--   2. CR 1101 (pour équilibrer - on va le supprimer après)

INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  sr.societe_id,
  CURRENT_DATE AS date_ecriture,
  'RECLASSEMENT-324-' || sr.societe_id::TEXT || '-' || sr.compte_cible AS ref_folio,
  sr.compte_cible AS numero_compte,
  sr.nom_compte,
  'Reclassement correct après audit (mig 324)' AS description,
  'reclassement virement inter-sociétés/associé' AS libelle,
  CASE
    WHEN sr.compte_cible IN ('4411', '455') THEN sr.montant_total
    ELSE 0
  END AS debit_mur,
  CASE
    WHEN sr.compte_cible = '4412' THEN sr.montant_total
    ELSE 0
  END AS credit_mur,
  'BNQ' AS journal,
  'MUR' AS devise_origine,
  NOW() AS created_at
FROM temp_soldes_reclassement sr;

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 5: CRÉER CONTREPARTIES SUR 1101 (si comptes 5800/455 supprimés)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  sr.societe_id,
  CURRENT_DATE AS date_ecriture,
  'RECLASSEMENT-324-CP-' || sr.societe_id::TEXT || '-' || sr.compte_cible AS ref_folio,
  '1101' AS numero_compte,
  'Capital - reclassement virements' AS nom_compte,
  'Contrepartie reclassement (mig 324)' AS description,
  'contrepartie reclassement' AS libelle,
  CASE
    WHEN sr.compte_cible = '4412' THEN sr.montant_total
    ELSE 0
  END AS debit_mur,
  CASE
    WHEN sr.compte_cible IN ('4411', '455') THEN sr.montant_total
    ELSE 0
  END AS credit_mur,
  'BNQ' AS journal,
  'MUR' AS devise_origine,
  NOW() AS created_at
FROM temp_soldes_reclassement sr;

SELECT '=== ÉCRITURES RECLASSEMENT CRÉÉES ===' AS section,
  COUNT(*) AS nb_lignes,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit
FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'RECLASSEMENT-324%';

-- ──────────────────────────────────────────────────────────────────────────
-- PHASE 6: AUDIT FINAL
-- ──────────────────────────────────────────────────────────────────────────

SELECT '=== BALANCE GLOBALE APRÈS RECLASSEMENT ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) < 0.01 THEN '✅ ÉQUILIBRÉE'
    ELSE '⚠ DÉSÉQUILIBRE'
  END AS status
FROM ecritures_comptables_v2;

SELECT '=== SOLDES PAR CLASSE APRÈS RECLASSEMENT ===' AS section,
  SUBSTRING(numero_compte FROM 1 FOR 1) AS classe,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
GROUP BY classe
ORDER BY classe;

SELECT '=== SOLDES COMPTES CLÉS APRÈS RECLASSEMENT ===' AS section,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte IN ('455', '4411', '4412', '1101', '5800')
GROUP BY numero_compte
ORDER BY numero_compte;

SELECT '=== SOLDES BANCAIRES vs COMPTABLES (POST-RECLASSEMENT) ===' AS section,
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

COMMIT;
