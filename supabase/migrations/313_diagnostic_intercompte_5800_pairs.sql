-- ============================================================================
-- Migration 313 — Diagnostic : paires manquantes virements intercompte (5800)
-- ============================================================================
-- CONTEXTE :
--   Compte 5800 "Virements internes (transit)" doit être équilibré pour chaque
--   société. Chaque virement intercompte (EUR ↔ MUR) crée 2 écritures :
--     - DR 5800 / CR 512xxx-source   (sortie de la devise source)
--     - DR 512yyy-dest / CR 5800     (entrée dans la devise dest)
--
--   Diagnostic : identifier les écritures DR 5800 / CR 512 qui N'ONT PAS leur
--   contrepartie DR 512 / CR 5800 du même jour (± 1 jour).
--
-- IMPORTANT :
--   - `ecritures_comptables_v2` n'a PAS de `compte_bancaire_id`.
--   - La devise du virement est dans `devise_origine` (cf mig 310).
--   - Le mapping (societe_id, devise) → compte_comptable se fait via
--     `comptes_bancaires.compte_comptable` (cf mig 310).
-- ============================================================================

-- ── 1. SOLDES 5800 PAR SOCIÉTÉ ─────────────────────────────────────────────
SELECT
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(e.debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 2. MATCHER sorties (DR 5800) ↔ entrées (CR 5800) ──────────────────────
-- Logique :
--   - Même societe_id
--   - Dates proches (±1 jour) : ABS(date1 - date2) <= 1
--   - Montants en MUR ≈ égaux (tolérance 1 MUR)
--   - devise_origine différente (EUR ↔ MUR)
WITH sorties AS (
  SELECT
    e.id,
    e.date_ecriture,
    e.societe_id,
    e.debit_mur AS montant,
    COALESCE(e.devise_origine, 'MUR') AS devise,
    e.libelle,
    e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800'
    AND e.debit_mur > 0
),
entrees AS (
  SELECT
    e.id,
    e.date_ecriture,
    e.societe_id,
    e.credit_mur AS montant,
    COALESCE(e.devise_origine, 'MUR') AS devise,
    e.libelle,
    e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800'
    AND e.credit_mur > 0
),
paires AS (
  SELECT
    s.id AS sortie_id,
    e.id AS entree_id,
    s.societe_id,
    s.date_ecriture AS sortie_date,
    e.date_ecriture AS entree_date,
    s.montant AS sortie_montant,
    e.montant AS entree_montant,
    s.devise AS sortie_devise,
    e.devise AS entree_devise,
    ABS(s.montant - e.montant) AS diff_montant,
    ABS(s.date_ecriture - e.date_ecriture) AS diff_jours
  FROM sorties s
  JOIN entrees e ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
)
SELECT
  'PAIRES TROUVÉES' AS section,
  societe_id,
  (SELECT nom FROM societes WHERE id = p.societe_id) AS societe_nom,
  COUNT(*) AS nb_paires,
  ROUND(SUM(sortie_montant)::numeric, 2) AS total_apparie
FROM paires p
GROUP BY societe_id
ORDER BY societe_id;

-- ── 3. ORPHELINES : sorties sans contrepartie ─────────────────────────────
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
  'ORPHELINES' AS section,
  o.societe_id,
  (SELECT nom FROM societes WHERE id = o.societe_id) AS societe_nom,
  o.type_ecriture,
  o.devise,
  COUNT(*) AS nb,
  ROUND(SUM(o.montant)::numeric, 2) AS total
FROM (
  SELECT s.*, 'SORTIE_ORPHELINE' AS type_ecriture FROM sorties s
  WHERE s.id NOT IN (SELECT id FROM sorties_appariees)
  UNION ALL
  SELECT e.*, 'ENTREE_ORPHELINE' AS type_ecriture FROM entrees e
  WHERE e.id NOT IN (SELECT id FROM entrees_appariees)
) o
GROUP BY o.societe_id, o.type_ecriture, o.devise
ORDER BY o.societe_id, o.type_ecriture, o.devise;

-- ── 4. DÉTAIL DES ORPHELINES (pour inspection) ─────────────────────────────
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
SELECT 'SORTIE_ORPHELINE' AS type, s.*
FROM sorties s
WHERE s.id NOT IN (SELECT id FROM sorties_appariees)
UNION ALL
SELECT 'ENTREE_ORPHELINE' AS type, e.*
FROM entrees e
WHERE e.id NOT IN (SELECT id FROM entrees_appariees)
ORDER BY 2, 3 DESC;  -- societe_id, date_ecriture DESC

-- ── 5. MAPPING comptes_bancaires (pour vérification) ──────────────────────
SELECT
  cb.societe_id,
  (SELECT nom FROM societes WHERE id = cb.societe_id) AS societe_nom,
  cb.devise,
  cb.numero_compte AS numero_bancaire,
  cb.compte_comptable AS compte_pcg
FROM comptes_bancaires cb
WHERE cb.societe_id IN (
  SELECT DISTINCT societe_id FROM ecritures_comptables_v2 WHERE numero_compte = '5800'
)
ORDER BY cb.societe_id, cb.devise;
