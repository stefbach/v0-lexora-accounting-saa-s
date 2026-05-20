-- ============================================================================
-- Migration 288 — Re-classer écritures CCA mal aiguillées + recalcul solde
-- ============================================================================
-- CONTEXTE :
-- La migration 287 a recalculé le solde depuis le compte 455, mais le solde
-- reste à 0. Probable raison : les écritures CCA ont été enregistrées sur
-- 471 (fallback "autre") quand la classification était 'cca' (inconnue) au
-- lieu de 'compte_courant_associe', ou avec un libellé contenant "CCA".
--
-- Stratégie :
--   1. Diagnostic large : 455 / 471 / 108 et libellés "CCA"/"compte courant"
--   2. Re-classifier les écritures CCA mal aiguillées de 471 → 455
--   3. Recalcul du solde
-- ============================================================================

-- ── ÉTAPE 1 : Diagnostic — où sont vraiment les écritures CCA ? ──────────
-- (a) Écritures avec libellé évocateur, peu importe le compte
SELECT
  e.numero_compte,
  e.journal,
  COUNT(*)                                              AS nb,
  ROUND(SUM(e.credit_mur)::numeric, 2)                  AS total_credit,
  ROUND(SUM(e.debit_mur)::numeric, 2)                   AS total_debit,
  MIN(e.date_ecriture)                                  AS min_date,
  MAX(e.date_ecriture)                                  AS max_date
FROM ecritures_comptables_v2 e
WHERE (
    e.libelle ILIKE '%cca%'
    OR e.libelle ILIKE '%compte courant%'
    OR e.libelle ILIKE '%associe%'
    OR e.libelle ILIKE '%avance associe%'
  )
GROUP BY e.numero_compte, e.journal
ORDER BY nb DESC;

-- (b) Échantillon des libellés concernés (utile pour décider du UPDATE)
SELECT
  e.id, e.societe_id, e.numero_compte, e.journal, e.date_ecriture,
  e.debit_mur, e.credit_mur, e.libelle
FROM ecritures_comptables_v2 e
WHERE (
    e.libelle ILIKE '%cca%'
    OR e.libelle ILIKE '%compte courant%'
    OR e.libelle ILIKE '%associe%'
  )
  AND e.numero_compte NOT LIKE '455%'
ORDER BY e.date_ecriture DESC
LIMIT 30;

-- (c) Quelles classifications transactions_json ont été utilisées ?
SELECT
  (tx->>'classification')                              AS classification,
  (tx->>'compte_comptable')                            AS compte_suggested,
  COUNT(*)                                             AS nb
FROM releves_bancaires rb,
     jsonb_array_elements(rb.transactions_json) AS tx
WHERE tx->>'classification' IS NOT NULL
GROUP BY classification, compte_suggested
ORDER BY nb DESC;

-- ============================================================================
-- ÉTAPE 2 : RE-CLASSIFIER — Vérifiez ÉTAPE 1 avant d'exécuter ce bloc
-- ============================================================================
-- Bascule de 471 (et autres comptes "autres") vers 455 les écritures dont
-- le libellé indique clairement un compte courant associé.
-- NB : journal='BNQ' uniquement pour limiter aux écritures issues du
--      rapprochement bancaire (pas les OD/AC qui sont déjà bien classés).

UPDATE ecritures_comptables_v2
SET numero_compte = '455'
WHERE journal = 'BNQ'
  AND numero_compte IN ('471', '4710', '4711')
  AND (
       libelle ILIKE 'CCA %'
    OR libelle ILIKE '%compte courant associ%'
    OR libelle ILIKE '%avance associ%'
    OR libelle ILIKE '%remboursement associ%'
    OR libelle ILIKE '%apport associ%'
  );

-- ============================================================================
-- ÉTAPE 3 : Re-recalculer solde CCA depuis le 455 (après re-classification)
-- ============================================================================
UPDATE comptes_courants_associes cca
SET solde = ROUND((
  SELECT COALESCE(SUM(e.credit_mur) - SUM(e.debit_mur), 0)
  FROM ecritures_comptables_v2 e
  WHERE e.societe_id = cca.societe_id
    AND e.numero_compte LIKE '455%'
)::numeric, 2);

-- ============================================================================
-- ÉTAPE 4 : Vérification finale
-- ============================================================================
SELECT
  cca.id, cca.societe_id, cca.nom, cca.solde,
  ROUND((
    SELECT COALESCE(SUM(e.credit_mur) - SUM(e.debit_mur), 0)
    FROM ecritures_comptables_v2 e
    WHERE e.societe_id = cca.societe_id AND e.numero_compte LIKE '455%'
  )::numeric, 2) AS solde_recalcule_du_455,
  (
    SELECT COUNT(*) FROM ecritures_comptables_v2 e
    WHERE e.societe_id = cca.societe_id AND e.numero_compte LIKE '455%'
  ) AS nb_ecritures_455
FROM comptes_courants_associes cca
ORDER BY cca.societe_id, cca.nom;
