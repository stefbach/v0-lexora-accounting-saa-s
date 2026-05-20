-- ============================================================================
-- Migration 291 — Correction PCM : reclasser paiements 5800 → compte réel
-- ============================================================================
-- CONTEXTE :
--   512 Banque   : D 5.25M  / C 21.66M = -16.41M  (sorties sans imputations)
--   5800 Transit : D 10.18M / C  3.93M = +6.25M   (devrait être ≈ 0)
--   401 Fourn.   : D 0.00   / C  1.21M             (aucun paiement débité)
--
-- CAUSE : Paiements classés 'virement_interne' au moment du rapprochement
--         → DR 5800 / CR 512 au lieu de DR 401 / CR 512
--         La 2ème jambe (DR destinataire / CR 5800) n'existe jamais.
--
-- STRATÉGIE :
--   1. Identifier les DR 5800 BNQ "orphelins" (pas de CR 5800 correspondant)
--      = ce sont des paiements mal classés, pas de vrais virements internes
--   2. Reclasser selon le libellé (401 fournisseur par défaut)
--   3. Vérifier l'équilibre PCM résultant
-- ============================================================================

-- ── DIAGNOSTIC 1 : Vue d'ensemble des comptes BNQ (avant correction) ────────
SELECT
  CASE
    WHEN numero_compte LIKE '512%'  THEN '512 Banque'
    WHEN numero_compte LIKE '5800%' THEN '5800 Transit'
    WHEN numero_compte LIKE '401%'  THEN '401 Fournisseurs'
    WHEN numero_compte LIKE '411%'  THEN '411 Clients'
    WHEN numero_compte LIKE '455%'  THEN '455 CCA'
    WHEN numero_compte LIKE '421%'  THEN '421 Salaires'
    ELSE numero_compte
  END AS compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)               AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)              AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS net_D_minus_C
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY compte
ORDER BY (SUM(debit_mur) + SUM(credit_mur)) DESC;

-- ── DIAGNOSTIC 2 : DR 5800 BNQ orphelins vs appariés ────────────────────────
-- Un "vrai" virement interne a TOUJOURS un CR 5800 correspondant quelque part
-- (même montant ± 0.01, dans les 30 jours).
-- Si DR 5800 sans CR 5800 correspondant → paiement mal classé.
WITH dr_5800 AS (
  SELECT
    id, societe_id, date_ecriture, debit_mur, libelle, ref_folio
  FROM ecritures_comptables_v2
  WHERE journal = 'BNQ'
    AND numero_compte LIKE '5800%'
    AND debit_mur > 0
),
cr_5800 AS (
  SELECT societe_id, date_ecriture, credit_mur
  FROM ecritures_comptables_v2
  WHERE numero_compte LIKE '5800%'
    AND credit_mur > 0
)
SELECT
  CASE WHEN c.societe_id IS NULL THEN 'ORPHELIN (paiement mal classé)' ELSE 'APPARIÉ (vrai virement interne)' END AS statut,
  COUNT(*)                                AS nb,
  ROUND(SUM(d.debit_mur)::numeric, 2)    AS montant_total
FROM dr_5800 d
LEFT JOIN cr_5800 c ON
  c.societe_id = d.societe_id
  AND ABS(c.credit_mur - d.debit_mur) < 0.01
  AND c.date_ecriture BETWEEN d.date_ecriture - INTERVAL '30 days'
                          AND d.date_ecriture + INTERVAL '30 days'
GROUP BY statut;

-- ── DIAGNOSTIC 3 : Top 30 DR 5800 BNQ orphelins + libellé ────────────────────
WITH dr_5800 AS (
  SELECT id, societe_id, date_ecriture, debit_mur, libelle, ref_folio
  FROM ecritures_comptables_v2
  WHERE journal = 'BNQ' AND numero_compte LIKE '5800%' AND debit_mur > 0
),
cr_5800 AS (
  SELECT societe_id, date_ecriture, credit_mur
  FROM ecritures_comptables_v2
  WHERE numero_compte LIKE '5800%' AND credit_mur > 0
)
SELECT
  d.id, d.date_ecriture, d.debit_mur, d.libelle, d.ref_folio
FROM dr_5800 d
LEFT JOIN cr_5800 c ON
  c.societe_id = d.societe_id
  AND ABS(c.credit_mur - d.debit_mur) < 0.01
  AND c.date_ecriture BETWEEN d.date_ecriture - INTERVAL '30 days'
                          AND d.date_ecriture + INTERVAL '30 days'
WHERE c.societe_id IS NULL
ORDER BY d.debit_mur DESC
LIMIT 30;

-- ============================================================================
-- CORRECTION — Exécutez ce bloc après avoir vérifié les diagnostics ci-dessus
-- ============================================================================

BEGIN;

-- Sauvegarder les entrées qui vont être modifiées
CREATE TEMP TABLE pcm291_avant AS
SELECT id, numero_compte, journal, libelle, debit_mur, credit_mur, date_ecriture, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '5800%'
  AND debit_mur > 0
  AND id NOT IN (
    -- Exclure les VRAIS virements internes (ont une contrepartie CR 5800)
    SELECT DISTINCT d.id
    FROM ecritures_comptables_v2 d
    JOIN ecritures_comptables_v2 c ON
      c.societe_id = d.societe_id
      AND c.numero_compte LIKE '5800%'
      AND c.credit_mur > 0
      AND ABS(c.credit_mur - d.debit_mur) < 0.01
      AND c.date_ecriture BETWEEN d.date_ecriture - INTERVAL '30 days'
                              AND d.date_ecriture + INTERVAL '30 days'
    WHERE d.journal = 'BNQ'
      AND d.numero_compte LIKE '5800%'
      AND d.debit_mur > 0
  );

-- Aperçu de ce qui sera modifié
SELECT
  COUNT(*) AS nb_entrees_a_reclasser,
  ROUND(SUM(debit_mur)::numeric, 2) AS montant_total_a_reclasser
FROM pcm291_avant;

-- Reclasser vers le bon compte selon le libellé
UPDATE ecritures_comptables_v2
SET numero_compte = CASE
  WHEN libelle ILIKE '%salaire%'
    OR libelle ILIKE '%paie%'
    OR libelle ILIKE '%remuneration%'              THEN '4210'
  WHEN libelle ILIKE '%cca%'
    OR libelle ILIKE '%compte courant%'
    OR libelle ILIKE '%associe%'
    OR libelle ILIKE '%apport%'                   THEN '455'
  WHEN libelle ILIKE '%client%'
    OR libelle ILIKE '%remboursement client%'     THEN '411'
  WHEN libelle ILIKE '%loyer%'
    OR libelle ILIKE '%bail%'
    OR libelle ILIKE '%electricite%'
    OR libelle ILIKE '%telephone%'
    OR libelle ILIKE '%assurance%'                THEN '401'
  ELSE '401'   -- Par défaut : fournisseurs (paiements sortants non identifiés)
END
WHERE id IN (SELECT id FROM pcm291_avant);

-- ── VÉRIFICATION POST-CORRECTION ─────────────────────────────────────────────
SELECT
  CASE
    WHEN numero_compte LIKE '512%'  THEN '512 Banque'
    WHEN numero_compte LIKE '5800%' THEN '5800 Transit'
    WHEN numero_compte LIKE '401%'  THEN '401 Fournisseurs'
    WHEN numero_compte LIKE '411%'  THEN '411 Clients'
    WHEN numero_compte LIKE '455%'  THEN '455 CCA'
    WHEN numero_compte LIKE '421%'  THEN '421 Salaires'
    ELSE numero_compte
  END AS compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS net_D_minus_C
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY compte
ORDER BY (SUM(debit_mur) + SUM(credit_mur)) DESC;

-- Équilibre global (doit toujours être 0 si la double-entrée est respectée)
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                        AS total_debit_global,
  ROUND(SUM(credit_mur)::numeric, 2)                       AS total_credit_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)   AS desequilibre_global
FROM ecritures_comptables_v2;

COMMIT;

-- ── ROLLBACK (si résultat inattendu — à exécuter AVANT de fermer la session) ──
-- UPDATE ecritures_comptables_v2 e
-- SET numero_compte = p.numero_compte
-- FROM pcm291_avant p WHERE e.id = p.id;
