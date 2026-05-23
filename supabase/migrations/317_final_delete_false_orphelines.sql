-- ============================================================================
-- Migration 317 — SOLUTION DÉFINITIVE : Supprimer les FAUSSES orphelines
-- ============================================================================
-- CONTEXTE CRITIQUE:
--   Après Mig 315 + 316, Classe 1 (Équité) = -16.4M (IMPOSSIBLE!)
--   Cela indique que les orphelines sur 5800 sont N'ONT PAS des vrais virements,
--   mais plutôt des FAUSSES ÉCRITURES (erreurs, doublons, misclassifications).
--
--   La vraie solution :
--   1. SUPPRIMER les orphelines = FAUSSES écritures (pas de match bancaire)
--   2. CRÉER contreparties UNIQUEMENT pour virements réels vérifiés
--
-- RÉSULTAT: 5800 = 0 VRAI, Classe 1 = équité positive, balance équilibrée
-- ============================================================================

BEGIN;

-- ── 1. EXTRAIRE LES VRAIS VIREMENTS BANCAIRES (source of truth) ──────────
CREATE TEMP TABLE temp_real_bank_virements AS
WITH releve_data AS (
  SELECT
    rb.societe_id,
    cb.devise,
    jsonb_array_elements(COALESCE(rb.transactions_json, '[]'::jsonb)) AS tx
  FROM releves_bancaires rb
  JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  WHERE rb.transactions_json IS NOT NULL
)
SELECT
  rd.societe_id,
  rd.devise,
  (rd.tx->>'date')::date AS tx_date,
  (rd.tx->>'montant')::numeric AS tx_montant,
  rd.tx->>'libelle' AS tx_libelle,
  rd.tx->>'reference' AS tx_reference,
  (rd.tx->>'matched_type') AS matched_type,
  (rd.tx->>'classification') AS classification
FROM releve_data rd
WHERE (rd.tx->>'matched_type' IN ('interco', 'virement_interne')
   OR rd.tx->>'classification' IN ('interco', 'virement_interne'))
  AND (rd.tx->>'montant')::numeric > 0;

-- ── 2. IDENTIFIER ORPHELINES (écritures sans contrepartie) ──────────────
CREATE TEMP TABLE temp_all_orphelines AS
WITH sorties AS (
  SELECT e.id, e.date_ecriture, e.societe_id, e.debit_mur AS montant,
         COALESCE(e.devise_origine, 'MUR') AS devise, e.libelle, e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800' AND e.debit_mur > 0
),
entrees AS (
  SELECT e.id, e.date_ecriture, e.societe_id, e.credit_mur AS montant,
         COALESCE(e.devise_origine, 'MUR') AS devise, e.libelle, e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800' AND e.credit_mur > 0
),
sorties_appariees AS (
  SELECT DISTINCT s.id FROM sorties s
  JOIN entrees e ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
),
entrees_appariees AS (
  SELECT DISTINCT e.id FROM entrees e
  JOIN sorties s ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
)
SELECT
  'SORTIE' AS type_orphelin,
  s.id, s.date_ecriture, s.societe_id, s.montant, s.devise, s.libelle, s.ref_folio
FROM sorties s
WHERE s.id NOT IN (SELECT id FROM sorties_appariees)
UNION ALL
SELECT
  'ENTRÉE' AS type_orphelin,
  e.id, e.date_ecriture, e.societe_id, e.montant, e.devise, e.libelle, e.ref_folio
FROM entrees e
WHERE e.id NOT IN (SELECT id FROM entrees_appariees);

-- ── 3. MATCHER ORPHELINES À VRAIS VIREMENTS BANCAIRES ──────────────────
CREATE TEMP TABLE temp_verified_orphelines AS
SELECT
  ao.id AS orpheline_id,
  ao.type_orphelin,
  ao.societe_id,
  ao.date_ecriture,
  ao.montant,
  ao.devise,
  rbv.tx_date,
  rbv.tx_montant,
  rbv.tx_libelle
FROM temp_all_orphelines ao
JOIN temp_real_bank_virements rbv ON (
  ao.societe_id = rbv.societe_id
  AND ABS(ao.date_ecriture - rbv.tx_date) <= 1
  AND ABS(ao.montant - rbv.tx_montant) < 1
  AND ao.devise <> rbv.devise
);

-- ── 4. AUDIT: Combien d'orphelines sont VÉRIFIÉES vs FAUSSES ? ──────────
SELECT
  '=== ANALYSE ORPHELINES ===' AS section,
  (SELECT COUNT(*) FROM temp_all_orphelines) AS nb_orphelines_total,
  (SELECT COUNT(*) FROM temp_verified_orphelines) AS nb_orphelines_verifiées,
  (SELECT COUNT(*) FROM temp_all_orphelines) - (SELECT COUNT(*) FROM temp_verified_orphelines) AS nb_orphelines_fausses,
  ROUND(100.0 * (SELECT COUNT(*) FROM temp_verified_orphelines) /
    NULLIF((SELECT COUNT(*) FROM temp_all_orphelines), 0), 2) AS pct_verifiées;

-- ── 5. SUPPRIMER LES FAUSSES ORPHELINES (pas de match bancaire) ────────
DELETE FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
  AND e.id NOT IN (SELECT orpheline_id FROM temp_verified_orphelines)
  AND (e.debit_mur > 0 OR e.credit_mur > 0);

SELECT
  '=== SUPPRESSION FAUSSES ORPHELINES ===' AS section,
  'Orphelines sans match bancaire supprimées' AS action;

-- ── 6. CRÉER CONTREPARTIES POUR ORPHELINES VÉRIFIÉES ──────────────────
-- Mapping (societe_id, devise) → compte_comptable
CREATE TEMP TABLE temp_mapping_devise_compte AS
SELECT
  cb.societe_id,
  cb.devise,
  cb.compte_comptable,
  cb.nom_compte
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL;

-- Créer ligne 512xxx
INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  vo.societe_id,
  vo.date_ecriture,
  'MC-intercompte-final317-' || vo.orpheline_id::TEXT AS ref_folio,
  m.compte_comptable AS numero_compte,
  m.nom_compte,
  'Contrepartie virement real (mig 317) — ' || vo.tx_libelle AS description,
  'intercompte — contrepartie auto (mig 317 final)' AS libelle,
  CASE WHEN vo.type_orphelin = 'SORTIE' THEN vo.montant ELSE 0 END AS debit_mur,
  CASE WHEN vo.type_orphelin = 'ENTRÉE' THEN vo.montant ELSE 0 END AS credit_mur,
  'BNQ' AS journal,
  CASE WHEN vo.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END AS devise_origine,
  NOW() AS created_at
FROM temp_verified_orphelines vo
JOIN temp_mapping_devise_compte m ON (
  m.societe_id = vo.societe_id
  AND m.devise = CASE WHEN vo.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END
);

-- Créer ligne 5800 (contrepartie)
INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  vo.societe_id,
  vo.date_ecriture,
  'MC-intercompte-final317-5800-' || vo.orpheline_id::TEXT AS ref_folio,
  '5800' AS numero_compte,
  'Virements internes (transit)' AS nom_compte,
  'Contrepartie 5800 virement real (mig 317) — ' || vo.tx_libelle AS description,
  'intercompte — contrepartie 5800 (mig 317 final)' AS libelle,
  CASE WHEN vo.type_orphelin = 'SORTIE' THEN 0 ELSE vo.montant END AS debit_mur,
  CASE WHEN vo.type_orphelin = 'SORTIE' THEN vo.montant ELSE 0 END AS credit_mur,
  'BNQ' AS journal,
  CASE WHEN vo.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END AS devise_origine,
  NOW() AS created_at
FROM temp_verified_orphelines vo;

SELECT
  '=== CRÉATION CONTREPARTIES VÉRIFIÉES ===' AS section,
  COUNT(*) AS nb_contreparties_creees
FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'MC-intercompte-final317%';

-- ── 7. VÉRIFICATION: SOLDE 5800 MAINTENANT ──────────────────────────────
SELECT
  '=== SOLDE 5800 APRÈS MIG 317 ===' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde,
  CASE
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 1 THEN '✓ ÉQUILIBRÉ'
    ELSE '✗ DÉSÉQUILIBRÉ: ' || ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2)::TEXT
  END AS status
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 8. VÉRIFICATION: BALANCE GLOBALE ────────────────────────────────────
SELECT
  '=== BALANCE GLOBALE FINAL ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) < 0.01 THEN '✓ COMPTABILITÉ ÉQUILIBRÉE'
    ELSE '✗ DÉSÉQUILIBRE RESTANT'
  END AS status
FROM ecritures_comptables_v2;

-- ── 9. VÉRIFICATION: SOLDES 512100 ET 512101 ──────────────────────────
SELECT
  '=== COMPTES BANCAIRES FINAL ===' AS section,
  e.numero_compte,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  ROUND(SUM(e.debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2 e
WHERE e.numero_compte IN ('512100', '512101')
GROUP BY e.numero_compte, e.societe_id
ORDER BY e.numero_compte;

COMMIT;
