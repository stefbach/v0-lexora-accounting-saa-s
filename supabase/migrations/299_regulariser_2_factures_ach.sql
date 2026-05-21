-- ============================================================================
-- Migration 299 — Régulariser 2 factures ACH (alignement sur paiement banque)
-- ============================================================================
-- CONTEXTE :
--   Reste 2 factures ACH déséquilibrées (total +1,514.72 MUR de DR) :
--     - FAC-7e224fc3 (Jean Daril Adriano) : DR 607=35,926.40 / CR 401=34,563.40 → +1,363.00
--     - FAC-3799d2f5 (Mauritius Telecom)  : DR 607=226.45    / CR 401=226.00    → +0.45
--
-- DÉCISION UTILISATEUR :
--   Le paiement bancaire est la source de vérité. Le CR 401 (montant
--   effectivement payé au fournisseur) est correct ; le DR 607 (charge)
--   a été sur-saisi dans la facture originale.
--
-- CORRECTIF :
--   Insérer une écriture CR 607 sur chaque folio pour rebooker la part
--   sur-saisie de la charge, alignant DR 607 sur CR 401.
--   Libellé explicite indiquant la raison.
-- ============================================================================

INSERT INTO ecritures_comptables_v2
  (societe_id, journal, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, ref_folio)
SELECT
  societe_id,
  'ACH',
  MAX(date_ecriture),
  '607',
  CASE ref_folio
    WHEN 'FAC-7e224fc3-8564-4c91-83af-0be1afcb4b0d'
      THEN 'Régularisation charge sur-saisie — alignement sur paiement bancaire (Jean Daril Adriano)'
    WHEN 'FAC-3799d2f5-c2db-4ec5-82fa-9cd9ac13316b'
      THEN 'Régularisation arrondi conversion — alignement sur paiement bancaire (Mauritius Telecom)'
  END,
  0,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2),
  ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'ACH'
  AND ref_folio IN (
    'FAC-7e224fc3-8564-4c91-83af-0be1afcb4b0d',
    'FAC-3799d2f5-c2db-4ec5-82fa-9cd9ac13316b'
  )
GROUP BY societe_id, ref_folio
HAVING SUM(debit_mur) - SUM(credit_mur) > 0.01;

-- ── VÉRIFICATION 1 : ACH doit être équilibré ────────────────────────────────
SELECT
  journal,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2
WHERE journal = 'ACH'
GROUP BY journal;

-- ── VÉRIFICATION 2 : équilibre global FINAL ─────────────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

-- ── VÉRIFICATION 3 : équilibre par journal — état FINAL ─────────────────────
SELECT
  journal,
  COUNT(*) nb,
  ROUND(SUM(debit_mur)::numeric, 2)  total_D,
  ROUND(SUM(credit_mur)::numeric, 2) total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) desequilibre
FROM ecritures_comptables_v2
GROUP BY journal
ORDER BY journal;
-- Tous les desequilibre attendus = 0.00

-- ROLLBACK : DELETE FROM ecritures_comptables_v2
--             WHERE journal = 'ACH'
--               AND numero_compte = '607'
--               AND libelle ILIKE 'Régularisation %sur-saisie%'
--               OR libelle ILIKE 'Régularisation arrondi%';
