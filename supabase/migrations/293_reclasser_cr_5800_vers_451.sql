-- ============================================================================
-- Migration 293 — Reclasser CR 5800 → CR 451 (encaissements inter-sociétés)
-- ============================================================================
-- CONTEXTE :
--   Après la 292, le 5800 affiche encore D 0 / C 5.57M (13 lignes).
--   Ce sont les encaissements miroir des virements inter-sociétés DDS↔OCC :
--   côté société qui REÇOIT l'argent, l'écriture est DR 512 / CR 5800
--   au lieu de DR 512 / CR 451.
--
--   Le solde 5800 = -5.57M doit passer à 0, et 451 doit accumuler -5.57M en
--   crédit (réduisant son net D de 11.09M à environ 5.52M = position nette
--   réelle du groupe).
-- ============================================================================

-- ── DIAGNOSTIC : Les 13 lignes CR 5800 BNQ ──────────────────────────────────
SELECT
  id, date_ecriture, debit_mur, credit_mur, libelle, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '5800%'
  AND credit_mur > 0
ORDER BY credit_mur DESC;

-- ── DIAGNOSTIC : Sont-ils tous des inter-sociétés ? ─────────────────────────
SELECT
  COUNT(*) AS nb,
  ROUND(SUM(credit_mur)::numeric, 2) AS total,
  ROUND(SUM(CASE WHEN libelle ILIKE '%virement_interne%'
                  OR libelle ILIKE '%digital data%'
                  OR libelle ILIKE '%obesity care%'
              THEN credit_mur ELSE 0 END)::numeric, 2) AS montant_inter_societes,
  ROUND(SUM(CASE WHEN libelle NOT ILIKE '%virement_interne%'
                  AND libelle NOT ILIKE '%digital data%'
                  AND libelle NOT ILIKE '%obesity care%'
              THEN credit_mur ELSE 0 END)::numeric, 2) AS montant_autres
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '5800%'
  AND credit_mur > 0;

-- ============================================================================
-- CORRECTION
-- ============================================================================

BEGIN;

CREATE TEMP TABLE pcm293_avant AS
SELECT id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '5800%'
  AND credit_mur > 0
  AND (
       libelle ILIKE '%virement_interne%'
    OR libelle ILIKE '%digital data%'
    OR libelle ILIKE '%obesity care%'
    OR libelle ILIKE '%inter-societ%'
    OR libelle ILIKE '%inter societ%'
  );

SELECT COUNT(*) AS nb_a_deplacer, ROUND(SUM(credit_mur)::numeric, 2) AS montant
FROM pcm293_avant;

UPDATE ecritures_comptables_v2
SET numero_compte = '451'
WHERE id IN (SELECT id FROM pcm293_avant);

-- ── VÉRIFICATION POST-CORRECTION ─────────────────────────────────────────────
SELECT
  CASE
    WHEN numero_compte LIKE '512%'  THEN '512 Banque'
    WHEN numero_compte LIKE '5800%' THEN '5800 Transit'
    WHEN numero_compte LIKE '401%'  THEN '401 Fournisseurs'
    WHEN numero_compte LIKE '411%'  THEN '411 Clients'
    WHEN numero_compte LIKE '421%'  THEN '421 Salaires'
    WHEN numero_compte LIKE '433%'  THEN '433 Sécurité Soc.'
    WHEN numero_compte LIKE '4471%' THEN '4471 TVA'
    WHEN numero_compte LIKE '451%'  THEN '451 Groupe'
    WHEN numero_compte LIKE '455%'  THEN '455 CCA'
    WHEN numero_compte LIKE '471%'  THEN '471 À classer'
    WHEN numero_compte LIKE '6271%' THEN '6271 Services banc.'
    ELSE numero_compte
  END AS compte,
  COUNT(*) nb,
  ROUND(SUM(debit_mur)::numeric, 2) total_D,
  ROUND(SUM(credit_mur)::numeric, 2) total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) net
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY compte
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC;

COMMIT;

-- ROLLBACK : UPDATE ecritures_comptables_v2 e SET numero_compte = p.numero_compte
--            FROM pcm293_avant p WHERE e.id = p.id;
