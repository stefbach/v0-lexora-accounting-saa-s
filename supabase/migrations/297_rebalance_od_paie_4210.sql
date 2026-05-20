-- ============================================================================
-- Migration 297 — Rééquilibrage OD-PAIE : ajout CR 4210 sur folios incomplets
-- ============================================================================
-- CONTEXTE :
--   Le journal OD-PAIE affiche un déséquilibre de +6,015,134.84 MUR
--   réparti sur 156 ref_folio (BP-xxx = fiches de paie).
--
--   Diagnostic : ces 156 fiches contiennent uniquement la PARTIE DÉBIT
--   (charges salariales 6411/6412/6413/6414/6415) sans la contre-partie
--   nécessaire au CR 4210 "Personnel — Rémunérations dues".
--
--   Exemple Juliana HAGGOO (BP-641fc897-9684-...) :
--     6411 D 80,779.80  /  6412 D 200  /  6415 D 200  =  81,179.80 D
--     Aucun CR → la fiche n'est pas équilibrée.
--
-- STRATÉGIE (quick fix validé utilisateur) :
--   Pour chaque ref_folio OD-PAIE en déséquilibre D > C, insérer UNE ligne
--   CR 4210 = (SUM(D) − SUM(C)) avec :
--     - date = MAX(date_ecriture) du folio
--     - societe_id = celui du folio
--     - libellé explicite signalant l'origine + retenues manquantes
--
-- NB : Le 4210 contiendra le BRUT au lieu du NET pour ces 156 folios.
--      Les retenues NSF/CSG/PAYE devront être ventilées plus tard via une
--      régénération propre des bulletins de paie pour ces salariés/périodes.
-- ============================================================================

-- ── DIAGNOSTIC PRÉALABLE ────────────────────────────────────────────────────
SELECT
  COUNT(DISTINCT ref_folio)                  AS nb_folios,
  ROUND(SUM(deficit)::numeric, 2)            AS total_a_inserer_en_CR
FROM (
  SELECT ref_folio,
         SUM(debit_mur) - SUM(credit_mur) AS deficit
  FROM ecritures_comptables_v2
  WHERE journal = 'OD-PAIE' AND ref_folio IS NOT NULL
  GROUP BY ref_folio
  HAVING SUM(debit_mur) - SUM(credit_mur) > 0.01
) t;
-- Attendu : nb_folios ≈ 156, total ≈ 6,004,772.95

-- ============================================================================
-- CORRECTION — INSERT direct (sans TEMP TABLE ni BEGIN/COMMIT pour compat
-- Supabase SQL Editor qui ne maintient pas la session entre exécutions)
-- ============================================================================

INSERT INTO ecritures_comptables_v2
  (societe_id, journal, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, ref_folio)
SELECT
  societe_id,
  'OD-PAIE',
  MAX(date_ecriture),
  '4210',
  'Rééquilibrage net à payer — fiche de paie incomplète (retenues non ventilées, à régulariser)',
  0,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2),
  ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE' AND ref_folio IS NOT NULL
GROUP BY societe_id, ref_folio
HAVING SUM(debit_mur) - SUM(credit_mur) > 0.01;

-- ── VÉRIFICATION 1 : OD-PAIE doit maintenant être équilibré ─────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                      AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                     AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE';
-- Attendu : desequilibre = 0.00 (ou très proche)

-- ── VÉRIFICATION 2 : équilibre global de la compta ──────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;
-- Attendu : ~1,500 (= reliquat journal ACH à corriger plus tard)

-- ── VÉRIFICATION 3 : nouveau solde 4210 ─────────────────────────────────────
SELECT
  societe_id,
  CASE societe_id::text
    WHEN '1826dde7-7b41-4d14-bc75-d8d22dfc75fb' THEN 'DDS'
    WHEN 'b010d75c-62a2-4aae-a52b-8c18261047f7' THEN 'OCC'
    ELSE 'AUTRE'
  END AS societe,
  ROUND(SUM(debit_mur)::numeric, 2)                      AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                     AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS net
FROM ecritures_comptables_v2
WHERE numero_compte LIKE '421%'
GROUP BY societe_id
ORDER BY societe;

-- ============================================================================
-- ROLLBACK : DELETE FROM ecritures_comptables_v2
--             WHERE journal = 'OD-PAIE'
--               AND numero_compte = '4210'
--               AND libelle ILIKE 'Rééquilibrage net à payer%';
-- ============================================================================
