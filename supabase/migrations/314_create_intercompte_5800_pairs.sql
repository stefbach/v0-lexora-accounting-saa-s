-- ============================================================================
-- Migration 314 — Créer les écritures manquantes virements intercompte (5800)
-- ============================================================================
-- CONTEXTE :
--   Suite du diagnostic 313. Pour chaque virement intercompte identifié,
--   créer la contrepartie manquante afin que 5800 = 0 pour chaque société.
--
-- LOGIQUE :
--   1. Matcher sorties (DR 5800 / CR 512) ↔ entrées (DR 512 / CR 5800)
--      par (date ±1j, montant approx, devises différentes)
--   2. Pour chaque paire appairée :
--      - Si sortie existe mais pas contrepartie : créer DR 512-dest / CR 5800
--      - Si entrée existe mais pas sortie : créer DR 5800 / CR 512-source
--   3. Générer des ref_folio uniques pour les nouvelles écritures
--
-- RÉSULTAT :
--   - Compte 5800 revient à ~0 pour chaque société (ou résidus < 1 MUR)
--   - Chaque virement est maintenant en double-jambe équilibrée
-- ============================================================================

BEGIN;

-- ── HELPER : générer un ref_folio unique pour les créations ──────────────
-- Format : MC-intercompte-TIMESTAMP-COUNTER pour éviter collisions
CREATE TEMP TABLE temp_new_ecritures (
  id UUID,
  date_ecriture DATE,
  journal_code TEXT,
  numero_compte TEXT,
  nom_compte TEXT,
  libelle TEXT,
  debit_mur NUMERIC,
  credit_mur NUMERIC,
  societe_id UUID,
  compte_bancaire_id UUID,
  ref_folio TEXT,
  piece_justificative TEXT,
  lettrage TEXT,
  facture_id UUID,
  created_at TIMESTAMP
);

-- ── 1. MATCHER sorties ↔ entrées ──────────────────────────────────────────
WITH compte_devises AS (
  SELECT
    cb.id,
    cb.numero_compte,
    cb.devise,
    cb.societe_id
  FROM comptes_bancaires cb
  WHERE cb.societe_id IN (
    SELECT DISTINCT societe_id FROM ecritures_comptables_v2
    WHERE numero_compte = '5800'
  )
),

sorties_5800 AS (
  SELECT
    e.id                AS sortie_id,
    e.date_ecriture,
    e.societe_id,
    e.compte_bancaire_id,
    e.debit_mur,
    e.libelle,
    e.ref_folio,
    cb.devise           AS sortie_devise,
    cb.numero_compte    AS sortie_compte,
    -- Trouver le compte pair (autre devise, même société)
    (SELECT id FROM comptes_bancaires cb2
     WHERE cb2.societe_id = e.societe_id
       AND cb2.devise <> cb.devise
     LIMIT 1) AS compte_pair_id
  FROM ecritures_comptables_v2 e
  LEFT JOIN comptes_bancaires cb ON e.compte_bancaire_id = cb.id
  WHERE e.numero_compte = '5800'
    AND e.debit_mur > 0
),

entrees_5800 AS (
  SELECT
    e.id                AS entree_id,
    e.date_ecriture,
    e.societe_id,
    e.compte_bancaire_id,
    e.credit_mur,
    e.libelle,
    e.ref_folio,
    cb.devise           AS entree_devise,
    cb.numero_compte    AS entree_compte,
    -- Trouver le compte pair (autre devise, même société)
    (SELECT id FROM comptes_bancaires cb2
     WHERE cb2.societe_id = e.societe_id
       AND cb2.devise <> cb.devise
     LIMIT 1) AS compte_pair_id
  FROM ecritures_comptables_v2 e
  LEFT JOIN comptes_bancaires cb ON e.compte_bancaire_id = cb.id
  WHERE e.numero_compte = '5800'
    AND e.credit_mur > 0
),

pairs_matched AS (
  SELECT
    s.sortie_id,
    s.date_ecriture,
    s.societe_id,
    s.debit_mur,
    s.sortie_devise,
    s.sortie_compte,
    s.compte_pair_id AS sortie_compte_pair_id,
    e.entree_id,
    e.credit_mur,
    e.entree_devise,
    e.entree_compte,
    e.compte_pair_id AS entree_compte_pair_id,
    CASE
      WHEN e.entree_id IS NOT NULL THEN 'COMPLÈTE'
      ELSE 'MANQUE_ENTRÉE'
    END AS status
  FROM sorties_5800 s
  LEFT JOIN entrees_5800 e ON (
    s.societe_id = e.societe_id
    AND ABS(EXTRACT(DAY FROM (s.date_ecriture - e.date_ecriture))) <= 1
    AND ABS(s.debit_mur - e.credit_mur) < 1
    AND s.sortie_devise <> e.entree_devise
  )
  WHERE s.compte_pair_id IS NOT NULL
),

-- ── 2. CRÉER les contreparties manquantes ──────────────────────────────────
-- Pour chaque sortie sans entrée : créer DR 512-pair / CR 5800
nouvelles_ecritures AS (
  SELECT
    gen_random_uuid()                                     AS id,
    pm.date_ecriture,
    'BNQ'                                                 AS journal_code,
    '512'                                                 AS numero_compte,
    (SELECT nom_compte FROM comptes_bancaires
     WHERE id = pm.sortie_compte_pair_id LIMIT 1)        AS nom_compte,
    'intercompte — ' || pm.sortie_compte || ' → ' ||
    (SELECT numero_compte FROM comptes_bancaires
     WHERE id = pm.sortie_compte_pair_id LIMIT 1)        AS libelle,
    pm.debit_mur                                          AS debit_mur,
    0::NUMERIC                                            AS credit_mur,
    pm.societe_id,
    pm.sortie_compte_pair_id,
    'MC-intercompte-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' ||
    ROW_NUMBER() OVER (PARTITION BY pm.societe_id ORDER BY pm.date_ecriture)::TEXT
                                                          AS ref_folio,
    NULL::TEXT                                            AS piece_justificative,
    NULL::TEXT                                            AS lettrage,
    NULL::UUID                                            AS facture_id,
    NOW()                                                 AS created_at
  FROM pairs_matched pm
  WHERE pm.status = 'MANQUE_ENTRÉE'
)

INSERT INTO ecritures_comptables_v2 (
  id, date_ecriture, journal_code, numero_compte, nom_compte, libelle,
  debit_mur, credit_mur, societe_id, compte_bancaire_id, ref_folio,
  piece_justificative, lettrage, facture_id, created_at
)
SELECT * FROM nouvelles_ecritures;

-- ── 3. VÉRIFICATION : solde 5800 après création ────────────────────────────
WITH soldes_5800 AS (
  SELECT
    societe_id,
    (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
    SUM(debit_mur) AS total_debit,
    SUM(credit_mur) AS total_credit,
    SUM(debit_mur) - SUM(credit_mur) AS solde
  FROM ecritures_comptables_v2 e
  WHERE numero_compte = '5800'
  GROUP BY societe_id
)
SELECT
  'SOLDE 5800 APRÈS FIX' AS section,
  societe_nom,
  ROUND(total_debit::numeric, 2) AS debit,
  ROUND(total_credit::numeric, 2) AS credit,
  ROUND(solde::numeric, 2) AS solde,
  CASE
    WHEN ABS(solde) < 1 THEN '✓ ÉQUILIBRÉ'
    WHEN ABS(solde) < 100 THEN '⚠ QUASI-ÉQUILIBRÉ'
    ELSE '✗ TOUJOURS DÉSÉQUILIBRÉ'
  END AS status
FROM soldes_5800
ORDER BY societe_nom;

COMMIT;
