-- ============================================================================
-- Migration 316 — Créer contreparties intercompte 5800 À PARTIR DES VIREMENTS RÉELS
-- ============================================================================
-- CONTEXTE :
--   Mig 314 a créé des contreparties pour TOUTES les orphelines de 5800, ce qui
--   a gonflé les comptes bancaires de 6M+. La vraie solution : matcher les
--   orphelines contre les virements RÉELS de releves_bancaires.transactions_json.
--
--   Cette migration :
--   1. Extrait tous les virements "interco" / "virement_interne" des relevés
--   2. Les matche contre les orphelines de 5800 (date, devise)
--   3. Crée contreparties UNIQUEMENT pour les virements vérifiés
--
-- RÉSULTAT : 5800 équilibré SANS inventer de l'argent (repose sur real data)
-- ============================================================================

BEGIN;

-- ── 1. EXTRAIRE LES VIREMENTS RÉELS DES RELEVÉS BANCAIRES ────────────────
-- Format transactions_json : chaque tx a {date, montant, libelle, type/matched_type}
CREATE TEMP TABLE temp_real_intercompte_virements AS
WITH releve_txs AS (
  SELECT
    rb.id AS releve_id,
    rb.compte_bancaire_id,
    rb.societe_id,
    cb.devise,
    jsonb_array_elements(COALESCE(rb.transactions_json, '[]'::jsonb)) AS tx
  FROM releves_bancaires rb
  JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  WHERE rb.transactions_json IS NOT NULL
)
SELECT
  rt.releve_id,
  rt.compte_bancaire_id,
  rt.societe_id,
  rt.devise,
  (rt.tx->>'date')::date AS tx_date,
  (rt.tx->>'montant')::numeric AS tx_montant,
  COALESCE(rt.tx->>'matched_type', rt.tx->>'classification') AS tx_type,
  rt.tx->>'libelle' AS tx_libelle,
  rt.tx->>'reference' AS tx_reference,
  rt.tx AS tx_json
FROM releve_txs rt
WHERE (rt.tx->>'matched_type' IN ('interco', 'virement_interne')
   OR rt.tx->>'classification' IN ('interco', 'virement_interne'))
  AND (rt.tx->>'montant')::numeric > 0;

-- ── 2. IDENTIFIER LES ORPHELINES RESTANTES (après rollback de 314) ────────
CREATE TEMP TABLE temp_remaining_orphelines AS
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
  SELECT DISTINCT s.id
  FROM sorties s
  JOIN entrees e ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
),
entrees_appariees AS (
  SELECT DISTINCT e.id
  FROM entrees e
  JOIN sorties s ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
)
SELECT
  'SORTIE_ORPHELINE' AS type_orphelin,
  s.id, s.date_ecriture, s.societe_id, s.montant, s.devise, s.libelle, s.ref_folio
FROM sorties s
WHERE s.id NOT IN (SELECT id FROM sorties_appariees)
UNION ALL
SELECT
  'ENTREE_ORPHELINE' AS type_orphelin,
  e.id, e.date_ecriture, e.societe_id, e.montant, e.devise, e.libelle, e.ref_folio
FROM entrees e
WHERE e.id NOT IN (SELECT id FROM entrees_appariees);

-- ── 3. MATCHER ORPHELINES AVEC VIREMENTS RÉELS ─────────────────────────────
-- Critères : même societe_id, date proche, montant approx, devises différentes
CREATE TEMP TABLE temp_verified_pairs AS
SELECT
  o.id AS orpheline_id,
  o.type_orphelin,
  o.societe_id,
  o.date_ecriture,
  o.montant,
  o.devise,
  rv.releve_id,
  rv.tx_date,
  rv.tx_montant,
  rv.devise AS virement_devise,
  CASE WHEN o.devise <> rv.devise THEN TRUE ELSE FALSE END AS devises_differentes
FROM temp_remaining_orphelines o
JOIN temp_real_intercompte_virements rv ON (
  o.societe_id = rv.societe_id
  AND ABS(o.date_ecriture - rv.tx_date) <= 1
  AND ABS(o.montant - rv.tx_montant) < 1
  AND o.devise <> rv.devise
)
WHERE devises_differentes = TRUE;

-- ── 4. AUDIT : quelles orphelines sont vérifiées ? ──────────────────────────
SELECT
  'ORPHELINES VÉRIFIÉES PAR VIREMENTS RÉELS' AS section,
  vp.societe_id,
  (SELECT nom FROM societes WHERE id = vp.societe_id) AS societe_nom,
  COUNT(*) AS nb,
  ROUND(SUM(vp.montant)::numeric, 2) AS total_montant
FROM temp_verified_pairs vp
GROUP BY vp.societe_id
ORDER BY vp.societe_id;

-- ── 5. CRÉER CONTREPARTIES UNIQUEMENT POUR VIREMENTS VÉRIFIÉS ──────────────
-- Mapping (societe_id, devise) → compte_comptable
CREATE TEMP TABLE temp_mapping_devise_compte AS
SELECT
  cb.societe_id,
  cb.devise,
  cb.compte_comptable,
  cb.nom_compte
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL;

-- Créer les 2 lignes de contrepartie (512xxx et 5800)
INSERT INTO ecritures_comptables_v2 (
  id,
  societe_id,
  date_ecriture,
  ref_folio,
  numero_compte,
  nom_compte,
  description,
  libelle,
  debit_mur,
  credit_mur,
  journal,
  devise_origine,
  created_at
)
SELECT
  gen_random_uuid()                                              AS id,
  vp.societe_id,
  vp.date_ecriture,
  'MC-intercompte-verified316-' || vp.orpheline_id::TEXT         AS ref_folio,
  m.compte_comptable                                             AS numero_compte,
  m.nom_compte                                                   AS nom_compte,
  'Contrepartie intercompte (mig 316 verified) — ' ||
    'Virement réel ' || vp.virement_devise || ' → ' || vp.devise AS description,
  'intercompte — contrepartie auto (mig 316)'                    AS libelle,
  CASE WHEN vp.type_orphelin = 'SORTIE_ORPHELINE' THEN vp.montant ELSE 0 END AS debit_mur,
  CASE WHEN vp.type_orphelin = 'ENTREE_ORPHELINE' THEN vp.montant ELSE 0 END AS credit_mur,
  'BNQ'                                                          AS journal,
  vp.virement_devise                                             AS devise_origine,
  NOW()                                                          AS created_at
FROM temp_verified_pairs vp
JOIN temp_mapping_devise_compte m ON (
  m.societe_id = vp.societe_id
  AND m.devise = vp.virement_devise
)
-- Éviter les doublons : une seule contrepartie par orpheline
WHERE NOT EXISTS (
  SELECT 1 FROM ecritures_comptables_v2 e
  WHERE e.ref_folio = 'MC-intercompte-verified316-' || vp.orpheline_id::TEXT
);

-- Créer la 2e ligne (sur 5800)
INSERT INTO ecritures_comptables_v2 (
  id,
  societe_id,
  date_ecriture,
  ref_folio,
  numero_compte,
  nom_compte,
  description,
  libelle,
  debit_mur,
  credit_mur,
  journal,
  devise_origine,
  created_at
)
SELECT
  gen_random_uuid()                                              AS id,
  vp.societe_id,
  vp.date_ecriture,
  'MC-intercompte-verified316-5800-' || vp.orpheline_id::TEXT    AS ref_folio,
  '5800'                                                         AS numero_compte,
  'Virements internes (transit)'                                 AS nom_compte,
  'Contrepartie 5800 intercompte (mig 316 verified) — ' ||
    'Virement réel ' || vp.virement_devise || ' → ' || vp.devise AS description,
  'intercompte — contrepartie 5800 (mig 316)'                    AS libelle,
  CASE WHEN vp.type_orphelin = 'SORTIE_ORPHELINE' THEN 0 ELSE vp.montant END AS debit_mur,
  CASE WHEN vp.type_orphelin = 'SORTIE_ORPHELINE' THEN vp.montant ELSE 0 END AS credit_mur,
  'BNQ'                                                          AS journal,
  vp.virement_devise                                             AS devise_origine,
  NOW()                                                          AS created_at
FROM temp_verified_pairs vp
WHERE NOT EXISTS (
  SELECT 1 FROM ecritures_comptables_v2 e
  WHERE e.ref_folio = 'MC-intercompte-verified316-5800-' || vp.orpheline_id::TEXT
);

-- ── 6. VÉRIFICATION : soldes 5800 après création ──────────────────────────
SELECT
  '5800 APRÈS MIG 316 (VERIFIED)' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  ROUND(SUM(e.debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde,
  CASE
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 1 THEN '✓ ÉQUILIBRÉ'
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 100 THEN '⚠ QUASI'
    ELSE '✗ DÉSÉQUILIBRÉ'
  END AS status
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 7. VÉRIFICATION : balance globale ────────────────────────────────────
SELECT
  'BALANCE GLOBALE APRÈS MIG 316' AS section,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;

-- ── 8. RAPPORT : orphelines RESTANTES (non vérifiées, à investiguer) ────────
SELECT
  'ORPHELINES NON VÉRIFIÉES (NON TRAITÉES)' AS section,
  o.societe_id,
  (SELECT nom FROM societes WHERE id = o.societe_id) AS societe_nom,
  o.type_orphelin,
  COUNT(*) AS nb,
  ROUND(SUM(o.montant)::numeric, 2) AS total
FROM temp_remaining_orphelines o
WHERE NOT EXISTS (
  SELECT 1 FROM temp_verified_pairs vp WHERE vp.orpheline_id = o.id
)
GROUP BY o.societe_id, o.type_orphelin
ORDER BY o.societe_id, o.type_orphelin;

COMMIT;
