-- ============================================================================
-- Migration 295 — Reclasser les 59 lignes BNQ du compte 471 'À classer'
-- ============================================================================
-- CONTEXTE :
--   Diagnostic 294 montre que le 471 BNQ (D 4.85M / C 2.28M, net +2.57M)
--   contient 59 lignes parfaitement identifiables par libellé.
--
-- RÈGLES (selon réponses utilisateur) :
--   - Inter-sociétés DDS↔OCC (26 l., 6.03M total) → 451 Groupe
--   - Salaires (13 l., 889k D)                    → 4210
--   - Charges sociales MRA (7 l., D 53k / C 71k)  → 4421 (PAYE)
--   - autre — M. SAMPOL JOSE (1 l., 72k C)        → 411 (Client)
--   - Client (2 l., 6.7k D)                       → 411
--   - Intérêts MCB Debit Interest (5 l., 80 D)    → 6611
--   - Agios MCB Penalty Interest (5 l., 49 D)     → 6271
--
--   Total couvert : 4.85M D + 2.28M C = 100% des 59 lignes
-- ============================================================================

BEGIN;

-- Sauvegarde
CREATE TEMP TABLE pcm295_avant AS
SELECT id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ' AND numero_compte LIKE '471%';

SELECT COUNT(*) AS nb_lignes_a_reclasser FROM pcm295_avant;

-- Reclassification selon libellé
UPDATE ecritures_comptables_v2
SET numero_compte = CASE
  -- Inter-sociétés (priorité haute : avant les autres règles génériques)
  WHEN libelle ILIKE '%virement_interne%'
    OR libelle ILIKE '%digital data%'
    OR libelle ILIKE '%obesity care%'
    OR libelle ILIKE '%inter-societ%'
    OR libelle ILIKE '%inter societ%'             THEN '451'

  -- Salaires
  WHEN libelle ILIKE '%salaire%'
    OR libelle ILIKE '%paie%'
    OR libelle ILIKE '%wage%'                     THEN '4210'

  -- Charges sociales MRA → PAYE
  WHEN libelle ILIKE '%charges_sociales%'
    AND (libelle ILIKE '%mra%' OR libelle ILIKE '%mauritius revenue%') THEN '4421'

  -- Cas spécifique SAMPOL JOSE → Client
  WHEN libelle ILIKE '%sampol%'                   THEN '411'

  -- Clients génériques
  WHEN libelle ILIKE '%client%'
    OR libelle ILIKE '%encaiss%'                  THEN '411'

  -- Intérêts bancaires débiteurs
  WHEN libelle ILIKE '%interet%'
    OR libelle ILIKE '%debit interest%'           THEN '6611'

  -- Agios (frais bancaires de pénalité)
  WHEN libelle ILIKE '%agios%'
    OR libelle ILIKE '%penalty%'                  THEN '6271'

  -- Filet de sécurité (devrait être vide ici, on garde le 471)
  ELSE numero_compte
END
WHERE id IN (SELECT id FROM pcm295_avant);

-- ── VÉRIFICATION 1 : Combien restent en 471 ? (doit être 0) ─────────────────
SELECT
  COUNT(*) AS nb_restant_en_471,
  ROUND(SUM(debit_mur)::numeric, 2)  AS D_residuel,
  ROUND(SUM(credit_mur)::numeric, 2) AS C_residuel
FROM ecritures_comptables_v2
WHERE journal = 'BNQ' AND numero_compte LIKE '471%';

-- ── VÉRIFICATION 2 : PCM BNQ après reclassification ─────────────────────────
SELECT
  CASE
    WHEN numero_compte LIKE '512%'  THEN '512 Banque'
    WHEN numero_compte LIKE '5800%' THEN '5800 Transit'
    WHEN numero_compte LIKE '401%'  THEN '401 Fournisseurs'
    WHEN numero_compte LIKE '411%'  THEN '411 Clients'
    WHEN numero_compte LIKE '421%'  THEN '421 Salaires'
    WHEN numero_compte LIKE '4421%' THEN '4421 PAYE'
    WHEN numero_compte LIKE '433%'  THEN '433 Sécurité Soc.'
    WHEN numero_compte LIKE '4471%' THEN '4471 TVA'
    WHEN numero_compte LIKE '451%'  THEN '451 Groupe'
    WHEN numero_compte LIKE '455%'  THEN '455 CCA'
    WHEN numero_compte LIKE '471%'  THEN '471 À classer'
    WHEN numero_compte LIKE '6271%' THEN '6271 Services banc.'
    WHEN numero_compte LIKE '6611%' THEN '6611 Intérêts'
    ELSE numero_compte
  END AS compte,
  COUNT(*)                                AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)      AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)     AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS net
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY compte
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC;

-- ── VÉRIFICATION 3 : Équilibre global BNQ (doit rester à 0) ─────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_BNQ,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_BNQ,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2
WHERE journal = 'BNQ';

COMMIT;

-- ROLLBACK : UPDATE ecritures_comptables_v2 e SET numero_compte = p.numero_compte
--            FROM pcm295_avant p WHERE e.id = p.id;
