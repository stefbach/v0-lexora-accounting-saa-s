-- ============================================================================
-- Migration 313 — Diagnostic : paires manquantes virements intercompte (5800)
-- ============================================================================
-- CONTEXTE :
--   Compte 5800 "Virements internes (transit)" doit être équilibré pour chaque
--   société. Chaque virement intercompte (EUR ↔ MUR) crée 2 écritures :
--     - DR 5800 / CR 512-source   (sortie de la devise source)
--     - DR 512-dest / CR 5800     (entrée dans la devise dest)
--
--   Diagnostic : identifier les écritures DR 5800 / CR 512 qui N'ONT PAS leur
--   contrepartie DR 512 / CR 5800 du même jour (± 1 jour).
--
-- RÉSULTAT : affichage en console SQL des écritures orphelines à matcher/créer.
-- ============================================================================

-- ── 1. VUE HELPER : devises des comptes bancaires ─────────────────────────
-- Pour une écriture donnée (compte_bancaire_id + devise), trouver
-- la devise de l'autre compte bancaire de la même société.
WITH compte_devises AS (
  -- Récupérer tous les comptes bancaires et leurs devises
  SELECT
    cb.id,
    cb.numero_compte,
    cb.devise,
    cb.societe_id,
    ROW_NUMBER() OVER (PARTITION BY cb.societe_id ORDER BY cb.numero_compte) AS rn
  FROM comptes_bancaires cb
  WHERE cb.societe_id IN (
    SELECT DISTINCT societe_id FROM ecritures_comptables_v2
    WHERE numero_compte = '5800'
  )
),
-- Pour chaque compte, identifier quel est l'autre compte de l'autre devise
compte_pairs AS (
  SELECT
    src.id         AS compte_id,
    src.societe_id AS societe_id,
    src.devise     AS devise,
    tgt.id         AS compte_pair_id,
    tgt.devise     AS devise_pair
  FROM compte_devises src
  JOIN compte_devises tgt ON (
    src.societe_id = tgt.societe_id
    AND src.devise <> tgt.devise
    AND src.rn < tgt.rn  -- éviter doublons
  )
),

-- ── 2. ÉCRITURES ORPHELINES : DR 5800 / CR 512 sans contrepartie ──────────
sorties_5800 AS (
  SELECT
    e.id,
    e.date_ecriture,
    e.societe_id,
    e.compte_bancaire_id,
    e.numero_compte,
    e.debit_mur,
    e.libelle,
    e.ref_folio,
    cb.devise,
    cb.numero_compte AS compte_numero,
    e.created_at
  FROM ecritures_comptables_v2 e
  LEFT JOIN comptes_bancaires cb ON e.compte_bancaire_id = cb.id
  WHERE e.numero_compte = '5800'
    AND e.debit_mur > 0  -- DR 5800 (sortie)
),

-- Chercher les contreparties (DR 512 / CR 5800, même date ± 1 jour, montant approx)
entrees_5800 AS (
  SELECT
    e.id,
    e.date_ecriture,
    e.societe_id,
    e.compte_bancaire_id,
    e.numero_compte,
    e.credit_mur,
    e.libelle,
    e.ref_folio,
    cb.devise,
    cb.numero_compte AS compte_numero,
    e.created_at
  FROM ecritures_comptables_v2 e
  LEFT JOIN comptes_bancaires cb ON e.compte_bancaire_id = cb.id
  WHERE e.numero_compte = '5800'
    AND e.credit_mur > 0  -- CR 5800 (entrée)
),

-- ── 3. MATCHER sorties ↔ entrées ──────────────────────────────────────────
-- Logique :
--   - Même societe_id
--   - Dates proches (±1 jour)
--   - Montants ≈ égaux (en MUR, donc pas besoin de taux de change ici)
--   - Devises différentes (EUR ↔ MUR)
paired AS (
  SELECT
    s.id          AS sortie_id,
    s.date_ecriture AS sortie_date,
    s.debit_mur   AS sortie_montant,
    s.devise      AS sortie_devise,
    s.compte_numero AS sortie_compte,
    e.id          AS entree_id,
    e.date_ecriture AS entree_date,
    e.credit_mur  AS entree_montant,
    e.devise      AS entree_devise,
    e.compte_numero AS entree_compte,
    ABS(s.debit_mur - e.credit_mur) AS diff_montant,
    ABS(EXTRACT(DAY FROM (s.date_ecriture - e.date_ecriture))) AS diff_jours
  FROM sorties_5800 s
  JOIN entrees_5800 e ON (
    s.societe_id = e.societe_id
    AND ABS(EXTRACT(DAY FROM (s.date_ecriture - e.date_ecriture))) <= 1
    AND ABS(s.debit_mur - e.credit_mur) < 1  -- tolerance 1 MUR
    AND s.devise <> e.devise  -- devises différentes
  )
),

-- ── 4. ORPHELINES : sorties sans contrepartie ───────────────────────────
orphelines_sorties AS (
  SELECT
    s.id,
    s.date_ecriture,
    s.societe_id,
    s.debit_mur,
    s.devise,
    s.compte_numero,
    s.libelle,
    s.ref_folio,
    'SORTIE (DR 5800 / CR 512)' AS type_ecriture,
    'MANQUE ENTRÉE (DR 512 / CR 5800)' AS probleme
  FROM sorties_5800 s
  LEFT JOIN paired p ON s.id = p.sortie_id
  WHERE p.sortie_id IS NULL
),

orphelines_entrees AS (
  SELECT
    e.id,
    e.date_ecriture,
    e.societe_id,
    e.credit_mur AS montant,
    e.devise,
    e.compte_numero,
    e.libelle,
    e.ref_folio,
    'ENTRÉE (DR 512 / CR 5800)' AS type_ecriture,
    'MANQUE SORTIE (DR 5800 / CR 512)' AS probleme
  FROM entrees_5800 e
  LEFT JOIN paired p ON e.id = p.entree_id
  WHERE p.entree_id IS NULL
)

-- ── 5. RÉSULTAT FINAL : toutes les orphelines ─────────────────────────────
SELECT
  'ORPHELINES' AS diagnostic,
  COUNT(*) FILTER (WHERE type_ecriture = 'SORTIE (DR 5800 / CR 512)') AS nb_sorties_orphelines,
  COUNT(*) FILTER (WHERE type_ecriture = 'ENTRÉE (DR 512 / CR 5800)') AS nb_entrees_orphelines,
  CASE
    WHEN COUNT(*) FILTER (WHERE type_ecriture = 'SORTIE (DR 5800 / CR 512)') > 0
      AND COUNT(*) FILTER (WHERE type_ecriture = 'ENTRÉE (DR 512 / CR 5800)') > 0
    THEN 'DÉSÉQUILIBRÉ'
    WHEN COUNT(*) = 0
    THEN '✓ ÉQUILIBRÉ'
    ELSE 'PARTIELLEMENT DÉSÉQUILIBRÉ'
  END AS status
FROM (
  SELECT * FROM orphelines_sorties
  UNION ALL
  SELECT * FROM orphelines_entrees
) AS all_orphelines;

-- ── DÉTAIL des orphelines ──────────────────────────────────────────────────
SELECT
  'DÉTAIL ORPHELINES' AS section,
  (SELECT societe_id FROM orphelines_sorties LIMIT 1) AS societe_id,
  o.*
FROM (
  SELECT * FROM orphelines_sorties
  UNION ALL
  SELECT * FROM orphelines_entrees
) AS o
ORDER BY o.societe_id, o.date_ecriture DESC, o.type_ecriture;

-- ── SUMMARY par société ────────────────────────────────────────────────────
SELECT
  'SUMMARY PAR SOCIÉTÉ' AS section,
  o.societe_id,
  (SELECT nom FROM societes WHERE id = o.societe_id LIMIT 1) AS societe_nom,
  COUNT(*) FILTER (WHERE o.type_ecriture = 'SORTIE (DR 5800 / CR 512)') AS nb_sorties_orphelines,
  COUNT(*) FILTER (WHERE o.type_ecriture = 'ENTRÉE (DR 512 / CR 5800)') AS nb_entrees_orphelines,
  COUNT(*) AS total_orphelines
FROM (
  SELECT * FROM orphelines_sorties
  UNION ALL
  SELECT * FROM orphelines_entrees
) AS o
GROUP BY o.societe_id
ORDER BY o.societe_id;
