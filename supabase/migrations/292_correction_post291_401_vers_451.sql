-- ============================================================================
-- Migration 292 — Correction post-291 : déplacer virement_interne 401 → 451
-- ============================================================================
-- CONTEXTE :
--   La migration 291 (version initiale, défaut → 401) a été exécutée avant la
--   correction (défaut → 451). Résultat : les 10.18M de transferts inter-sociétés
--   DDS ↔ OCC se retrouvent en 401 Fournisseurs (D = 10,183,400.30) au lieu de
--   451 Comptes courants Groupe.
--
--   PCM actuel après 291 ancienne :
--     401 Fournisseurs : D 10.18M / C 1.21M = +8.97M  ← contient à tort les inter-sociétés
--     5800 Transit     : D 0      / C 3.93M = -3.93M
--     512 Banque       : D 5.25M  / C 21.66M = -16.41M
--
-- CORRECTION :
--   Déplacer les entrées BNQ au compte 401 dont le libellé contient
--   "virement_interne", "digital data", "obesity care" → compte 451.
--
--   PCM attendu après 292 :
--     401 Fournisseurs : D ~0     / C 1.21M = -1.21M       (cas normal, attend les vrais paiements)
--     451 Groupe       : D 10.18M / C 0     = +10.18M      (transferts inter-sociétés)
--     5800 Transit     : inchangé
--     512 Banque       : inchangé
-- ============================================================================

-- ── DIAGNOSTIC : Combien d'entrées 401 sont en réalité des inter-sociétés ? ──
SELECT
  COUNT(*)                                AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)      AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2)     AS total_credit
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '401%'
  AND (
       libelle ILIKE '%virement_interne%'
    OR libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%obesity care clinic%'
    OR libelle ILIKE '%inter-societ%'
    OR libelle ILIKE '%inter societ%'
  );

-- ── ÉCHANTILLON (top 20 pour vérification) ──
SELECT id, date_ecriture, numero_compte, debit_mur, credit_mur, libelle, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '401%'
  AND (
       libelle ILIKE '%virement_interne%'
    OR libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%obesity care clinic%'
  )
ORDER BY debit_mur DESC
LIMIT 20;

-- ============================================================================
-- CORRECTION — Exécutez après avoir vérifié le diagnostic ci-dessus
-- ============================================================================

BEGIN;

-- Sauvegarde avant modification
CREATE TEMP TABLE pcm292_avant AS
SELECT id, numero_compte, journal, libelle, debit_mur, credit_mur, date_ecriture, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '401%'
  AND (
       libelle ILIKE '%virement_interne%'
    OR libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%obesity care clinic%'
    OR libelle ILIKE '%inter-societ%'
    OR libelle ILIKE '%inter societ%'
  );

SELECT
  COUNT(*) AS nb_a_deplacer,
  ROUND(SUM(debit_mur)::numeric, 2) AS montant_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS montant_credit
FROM pcm292_avant;

-- Déplacer 401 → 451 pour ces entrées inter-sociétés
UPDATE ecritures_comptables_v2
SET numero_compte = '451'
WHERE id IN (SELECT id FROM pcm292_avant);

-- ── VÉRIFICATION POST-CORRECTION ─────────────────────────────────────────────
SELECT
  CASE
    WHEN numero_compte LIKE '512%'  THEN '512 Banque'
    WHEN numero_compte LIKE '5800%' THEN '5800 Transit'
    WHEN numero_compte LIKE '401%'  THEN '401 Fournisseurs'
    WHEN numero_compte LIKE '411%'  THEN '411 Clients'
    WHEN numero_compte LIKE '451%'  THEN '451 Groupe'
    WHEN numero_compte LIKE '455%'  THEN '455 CCA'
    WHEN numero_compte LIKE '421%'  THEN '421 Salaires'
    ELSE numero_compte
  END AS compte,
  COUNT(*)                                AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)      AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)     AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS net_D_minus_C
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY compte
ORDER BY (SUM(debit_mur) + SUM(credit_mur)) DESC;

COMMIT;

-- ── ROLLBACK (en cas de résultat inattendu) ─────────────────────────────────
-- UPDATE ecritures_comptables_v2 e SET numero_compte = p.numero_compte
-- FROM pcm292_avant p WHERE e.id = p.id;
