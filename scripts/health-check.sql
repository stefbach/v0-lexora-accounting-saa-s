-- ============================================================================
-- LEXORA — Health Check Accounting (standalone)
-- ----------------------------------------------------------------------------
-- 10 read-only checks that mirror the /api/admin/health endpoint.
-- Run via `psql $DATABASE_URL -f scripts/health-check.sql`
-- or paste into the Supabase SQL Editor.
--
-- Each check SELECTs anomaly rows — an empty result set == OK.
-- No DML, no side effects, idempotent. Safe to run in production.
-- ============================================================================

\echo '================================================================'
\echo 'LEXORA — Accounting Health Check'
\echo '================================================================'

-- ----------------------------------------------------------------------------
-- 1) factures_sans_ecriture_vte
-- Factures clients (non-brouillon / non-annulé) sans écriture VTE 411.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [1/10] factures_sans_ecriture_vte ---'
SELECT
  f.id              AS facture_id,
  f.numero_facture,
  f.tiers,
  f.date_facture,
  f.montant_ttc,
  f.statut,
  f.societe_id
FROM public.factures f
WHERE f.type_facture = 'client'
  AND f.statut NOT IN ('brouillon', 'annule')
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e
     WHERE e.facture_id = f.id
       AND e.journal = 'VTE'
       AND e.numero_compte = '411'
  )
ORDER BY f.date_facture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 2) factures_sans_ecriture_ach
-- Factures fournisseurs (non-brouillon / non-annulé) sans écriture ACH 401.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [2/10] factures_sans_ecriture_ach ---'
SELECT
  f.id              AS facture_id,
  f.numero_facture,
  f.tiers,
  f.date_facture,
  f.montant_ttc,
  f.statut,
  f.societe_id
FROM public.factures f
WHERE f.type_facture = 'fournisseur'
  AND f.statut NOT IN ('brouillon', 'annule')
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e
     WHERE e.facture_id = f.id
       AND e.journal = 'ACH'
       AND e.numero_compte = '401'
  )
ORDER BY f.date_facture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 3) factures_paye_sans_bnq
-- Factures marquées payées sans aucune écriture BNQ liée.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [3/10] factures_paye_sans_bnq ---'
SELECT
  f.id              AS facture_id,
  f.numero_facture,
  f.tiers,
  f.type_facture,
  f.date_facture,
  f.montant_ttc,
  f.societe_id
FROM public.factures f
WHERE f.statut = 'paye'
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e
     WHERE e.facture_id = f.id
       AND e.journal = 'BNQ'
  )
ORDER BY f.date_facture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 4) ecritures_3digit_bare
-- Comptes legacy à 3 chiffres (421/431/432/433/444) — doivent être 6 chiffres.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [4/10] ecritures_3digit_bare ---'
SELECT
  id,
  societe_id,
  numero_compte,
  date_ecriture,
  journal,
  ref_folio,
  description,
  debit_mur,
  credit_mur
FROM public.ecritures_comptables_v2
WHERE numero_compte IN ('421', '431', '432', '433', '444')
ORDER BY date_ecriture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 5) ecritures_6digit_bare
-- Comptes à 6 chiffres ou plus — sous-comptes non standard.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [5/10] ecritures_6digit_bare ---'
SELECT
  id,
  societe_id,
  numero_compte,
  date_ecriture,
  journal,
  ref_folio,
  description,
  debit_mur,
  credit_mur
FROM public.ecritures_comptables_v2
WHERE numero_compte LIKE '_____%'   -- au moins 6 caractères
ORDER BY numero_compte, date_ecriture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 6) soldes_411_anormaux
-- Par société : |solde 411| > max(10 × somme factures client non payées, 10000).
-- Un grand écart révèle des paiements non comptabilisés ou des doublons.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [6/10] soldes_411_anormaux ---'
WITH solde_411 AS (
  SELECT
    societe_id,
    COALESCE(SUM(debit_mur - credit_mur), 0) AS solde
  FROM public.ecritures_comptables_v2
  WHERE numero_compte = '411'
  GROUP BY societe_id
),
fact_open AS (
  SELECT
    societe_id,
    COALESCE(SUM(montant_mur), 0) AS total_non_paye
  FROM public.factures
  WHERE type_facture = 'client'
    AND statut NOT IN ('paye', 'annule', 'brouillon')
  GROUP BY societe_id
)
SELECT
  s.id                                            AS societe_id,
  s.nom                                           AS societe_nom,
  COALESCE(solde_411.solde, 0)                    AS solde_411,
  COALESCE(fact_open.total_non_paye, 0)           AS total_factures_non_payees_mur,
  GREATEST(COALESCE(fact_open.total_non_paye, 0) * 10, 10000) AS seuil_mur,
  CASE
    WHEN COALESCE(fact_open.total_non_paye, 0) > 0
      THEN ROUND(ABS(COALESCE(solde_411.solde, 0)) / fact_open.total_non_paye, 2)
    ELSE NULL
  END                                             AS ratio
FROM public.societes s
LEFT JOIN solde_411  ON solde_411.societe_id = s.id
LEFT JOIN fact_open  ON fact_open.societe_id = s.id
WHERE ABS(COALESCE(solde_411.solde, 0))
    > GREATEST(COALESCE(fact_open.total_non_paye, 0) * 10, 10000)
ORDER BY ABS(COALESCE(solde_411.solde, 0)) DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 7) ecritures_desequilibrees
-- ref_folios (hors BNQ) dont somme(debit) ≠ somme(credit).
-- BNQ est exclu : les paiements groupés y entraînent légitimement
-- plusieurs lignes 401/411 pour un même folio.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [7/10] ecritures_desequilibrees ---'
SELECT
  societe_id,
  ref_folio,
  MAX(journal)                        AS journal,
  ROUND(SUM(debit_mur)::numeric, 2)   AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2)  AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS ecart
FROM public.ecritures_comptables_v2
WHERE ref_folio IS NOT NULL
  AND (journal IS NULL OR journal <> 'BNQ')
GROUP BY societe_id, ref_folio
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 8) factures_devise_non_mur_sans_montant_mur
-- Factures en devise étrangère sans montant_mur (ou = 0) : conversion ratée.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [8/10] factures_devise_non_mur_sans_montant_mur ---'
SELECT
  id        AS facture_id,
  numero_facture,
  tiers,
  devise,
  montant_ttc,
  montant_mur,
  taux_change,
  statut,
  date_facture,
  societe_id
FROM public.factures
WHERE devise IS NOT NULL
  AND devise <> 'MUR'
  AND (montant_mur IS NULL OR montant_mur = 0)
ORDER BY date_facture DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 9) classifications_doublons
-- Écritures BNQ avec (societe_id, ref_folio, numero_compte) identiques
-- — régression des doublons R03/R04.
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [9/10] classifications_doublons ---'
SELECT
  societe_id,
  ref_folio,
  numero_compte,
  COUNT(*)                                  AS nb_occurrences,
  ARRAY_AGG(id ORDER BY created_at)         AS ecriture_ids,
  MIN(date_ecriture)                        AS premiere_date,
  MAX(date_ecriture)                        AS derniere_date,
  ROUND(SUM(debit_mur)::numeric, 2)         AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2)        AS total_credit
FROM public.ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND ref_folio IS NOT NULL
GROUP BY societe_id, ref_folio, numero_compte
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, MAX(date_ecriture) DESC NULLS LAST
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 10) comptes_resultat_lettres
-- Écritures sur classes 6 (charges) ou 7 (produits) avec lettrage — viole R7
-- (les comptes de résultat ne doivent jamais être lettrés).
-- ----------------------------------------------------------------------------
\echo ''
\echo '--- [10/10] comptes_resultat_lettres ---'
SELECT
  id,
  societe_id,
  numero_compte,
  lettre,
  date_ecriture,
  journal,
  ref_folio,
  description,
  debit_mur,
  credit_mur
FROM public.ecritures_comptables_v2
WHERE lettre IS NOT NULL
  AND lettre <> ''
  AND (numero_compte LIKE '6%' OR numero_compte LIKE '7%')
ORDER BY date_ecriture DESC NULLS LAST
LIMIT 50;

\echo ''
\echo '================================================================'
\echo 'Health check terminé. Chaque bloc vide == OK.'
\echo '================================================================'
