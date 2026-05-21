-- ============================================================================
-- Migration 294 — Diagnostic compte 471 "À classer"
-- ============================================================================
-- CONTEXTE :
--   Après la 292/293, le 471 affiche encore +2.57M (D 4.85M / C 2.28M)
--   réparti sur 59 lignes. C'est le compte fourre-tout : transactions sans
--   classification claire qui sont tombées en "autre" lors du rapprochement.
--
-- Ce script est UNIQUEMENT diagnostique — il ne modifie aucune donnée.
-- Le but : identifier les patterns de libellés pour écrire la 295 corrective.
-- ============================================================================

-- ── DIAGNOSTIC 1 : Vue d'ensemble par sens (D vs C) ─────────────────────────
SELECT
  CASE WHEN debit_mur > 0 THEN 'DR (sortie banque)' ELSE 'CR (entrée banque)' END AS sens,
  COUNT(*) AS nb,
  ROUND(SUM(GREATEST(debit_mur, credit_mur))::numeric, 2) AS total,
  ROUND(AVG(GREATEST(debit_mur, credit_mur))::numeric, 2) AS moyen,
  ROUND(MIN(GREATEST(debit_mur, credit_mur))::numeric, 2) AS min,
  ROUND(MAX(GREATEST(debit_mur, credit_mur))::numeric, 2) AS max
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '471%'
GROUP BY sens;

-- ── DIAGNOSTIC 2 : Top 30 lignes 471 par montant ─────────────────────────────
SELECT
  id, date_ecriture, debit_mur, credit_mur, libelle, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '471%'
ORDER BY GREATEST(debit_mur, credit_mur) DESC
LIMIT 30;

-- ── DIAGNOSTIC 3 : Regroupement par mot-clé du libellé ──────────────────────
-- Cherche des patterns récurrents pour décider d'une reclassification en masse
SELECT
  CASE
    WHEN libelle ILIKE '%mra%' OR libelle ILIKE '%paye%' OR libelle ILIKE '%tax%'    THEN 'MRA / impôt'
    WHEN libelle ILIKE '%nsf%' OR libelle ILIKE '%csg%' OR libelle ILIKE '%pension%' THEN 'NSF / CSG'
    WHEN libelle ILIKE '%salaire%' OR libelle ILIKE '%paie%' OR libelle ILIKE '%wage%' THEN 'Salaires'
    WHEN libelle ILIKE '%loyer%' OR libelle ILIKE '%rent%' OR libelle ILIKE '%bail%' THEN 'Loyer'
    WHEN libelle ILIKE '%electricite%' OR libelle ILIKE '%ceb%' OR libelle ILIKE '%cwa%' OR libelle ILIKE '%water%' THEN 'Utilities'
    WHEN libelle ILIKE '%telephone%' OR libelle ILIKE '%mauritius telecom%' OR libelle ILIKE '%emtel%' OR libelle ILIKE '%internet%' THEN 'Télécom'
    WHEN libelle ILIKE '%assurance%' OR libelle ILIKE '%insurance%' THEN 'Assurance'
    WHEN libelle ILIKE '%frais%bancaire%' OR libelle ILIKE '%commission%banc%' OR libelle ILIKE '%bank charge%' THEN 'Frais bancaires'
    WHEN libelle ILIKE '%virement_interne%' OR libelle ILIKE '%digital data%' OR libelle ILIKE '%obesity care%' THEN 'Inter-sociétés (à passer 451)'
    WHEN libelle ILIKE '%cca%' OR libelle ILIKE '%compte courant associ%' OR libelle ILIKE '%avance associ%' THEN 'CCA (à passer 455)'
    WHEN libelle ILIKE '%client%' OR libelle ILIKE '%encaiss%' THEN 'Client'
    WHEN libelle ILIKE '%fournisseur%' OR libelle ILIKE '%facture%' OR libelle ILIKE '%achat%' THEN 'Fournisseur'
    WHEN libelle ILIKE '%cash%' OR libelle ILIKE '%retrait%' OR libelle ILIKE '%depot%' THEN 'Cash / Caisse'
    WHEN libelle ILIKE '%cheque%' OR libelle ILIKE '%chq%' THEN 'Chèque (à identifier)'
    ELSE 'AUTRE / NON IDENTIFIÉ'
  END AS categorie_suggeree,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS net
FROM ecritures_comptables_v2
WHERE journal = 'BNQ' AND numero_compte LIKE '471%'
GROUP BY categorie_suggeree
ORDER BY (SUM(debit_mur) + SUM(credit_mur)) DESC;

-- ── DIAGNOSTIC 4 : 471 NON IDENTIFIÉ — échantillon ─────────────────────────
SELECT
  id, date_ecriture, debit_mur, credit_mur, libelle
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '471%'
  AND NOT (
       libelle ILIKE '%mra%' OR libelle ILIKE '%paye%' OR libelle ILIKE '%tax%'
    OR libelle ILIKE '%nsf%' OR libelle ILIKE '%csg%' OR libelle ILIKE '%pension%'
    OR libelle ILIKE '%salaire%' OR libelle ILIKE '%paie%' OR libelle ILIKE '%wage%'
    OR libelle ILIKE '%loyer%' OR libelle ILIKE '%rent%' OR libelle ILIKE '%bail%'
    OR libelle ILIKE '%electricite%' OR libelle ILIKE '%ceb%' OR libelle ILIKE '%cwa%' OR libelle ILIKE '%water%'
    OR libelle ILIKE '%telephone%' OR libelle ILIKE '%mauritius telecom%' OR libelle ILIKE '%emtel%' OR libelle ILIKE '%internet%'
    OR libelle ILIKE '%assurance%' OR libelle ILIKE '%insurance%'
    OR libelle ILIKE '%frais%bancaire%' OR libelle ILIKE '%commission%banc%' OR libelle ILIKE '%bank charge%'
    OR libelle ILIKE '%virement_interne%' OR libelle ILIKE '%digital data%' OR libelle ILIKE '%obesity care%'
    OR libelle ILIKE '%cca%' OR libelle ILIKE '%compte courant associ%' OR libelle ILIKE '%avance associ%'
    OR libelle ILIKE '%client%' OR libelle ILIKE '%encaiss%'
    OR libelle ILIKE '%fournisseur%' OR libelle ILIKE '%facture%' OR libelle ILIKE '%achat%'
    OR libelle ILIKE '%cash%' OR libelle ILIKE '%retrait%' OR libelle ILIKE '%depot%'
    OR libelle ILIKE '%cheque%' OR libelle ILIKE '%chq%'
  )
ORDER BY GREATEST(debit_mur, credit_mur) DESC
LIMIT 30;
