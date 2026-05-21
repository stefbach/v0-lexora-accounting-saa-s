-- ============================================================================
-- Diagnostic d'abord (SELECT) — exécuter et vérifier avant l'UPDATE
-- ============================================================================
-- Ce SELECT identifie les écritures BNQ créées par lettrer_manuel (ref MC-)
-- depuis un compte bancaire en EUR, mais stockées avec devise_origine='MUR'
-- (bug: tx.devise absent + pas de fallback compte bancaire).
-- ============================================================================

-- ETAPE 1 : Vérifier les lignes à corriger
SELECT
  e.id,
  e.numero_compte,
  e.date_ecriture,
  e.debit_mur  AS "debit_actuel_EUR_stocke_MUR",
  e.credit_mur AS "credit_actuel_EUR_stocke_MUR",
  e.debit_mur  * COALESCE(
    (SELECT h.taux_vers_mur FROM taux_change_historique h
     WHERE h.devise = 'EUR' AND h.date_taux <= e.date_ecriture
     ORDER BY h.date_taux DESC LIMIT 1),
    (SELECT t.taux FROM taux_change t WHERE t.devise = 'EUR' ORDER BY t.date_taux DESC LIMIT 1)
  ) AS "debit_corrige_MUR",
  e.ref_folio,
  cb.devise AS "devise_compte_bancaire",
  e.libelle
FROM ecritures_comptables_v2 e
JOIN releves_bancaires rb
  ON rb.id = CAST(SUBSTRING(e.ref_folio, 4, 36) AS UUID)
JOIN comptes_bancaires cb
  ON cb.id = rb.compte_bancaire_id
WHERE e.journal = 'BNQ'
  AND e.ref_folio LIKE 'MC-%'
  AND e.devise_origine = 'MUR'
  AND e.taux_change_applique = 1
  AND cb.devise != 'MUR'   -- le relevé source est en devise étrangère
ORDER BY e.date_ecriture DESC;

-- ============================================================================
-- ETAPE 2 : Correction — seulement si ETAPE 1 retourne des lignes correctes
-- ============================================================================
UPDATE ecritures_comptables_v2 e
SET
  debit_mur = CASE WHEN e.debit_mur > 0
    THEN ROUND((e.debit_mur * COALESCE(
      (SELECT h.taux_vers_mur FROM taux_change_historique h
       WHERE h.devise = cb.devise AND h.date_taux <= e.date_ecriture
       ORDER BY h.date_taux DESC LIMIT 1),
      (SELECT t.taux FROM taux_change t
       WHERE t.devise = cb.devise ORDER BY t.date_taux DESC LIMIT 1)
    ))::numeric, 2)
    ELSE 0 END,
  credit_mur = CASE WHEN e.credit_mur > 0
    THEN ROUND((e.credit_mur * COALESCE(
      (SELECT h.taux_vers_mur FROM taux_change_historique h
       WHERE h.devise = cb.devise AND h.date_taux <= e.date_ecriture
       ORDER BY h.date_taux DESC LIMIT 1),
      (SELECT t.taux FROM taux_change t
       WHERE t.devise = cb.devise ORDER BY t.date_taux DESC LIMIT 1)
    ))::numeric, 2)
    ELSE 0 END,
  montant_origine = CASE
    WHEN e.debit_mur > 0 THEN e.debit_mur
    ELSE e.credit_mur
  END,
  devise_origine = cb.devise,
  taux_change_applique = COALESCE(
    (SELECT h.taux_vers_mur FROM taux_change_historique h
     WHERE h.devise = cb.devise AND h.date_taux <= e.date_ecriture
     ORDER BY h.date_taux DESC LIMIT 1),
    (SELECT t.taux FROM taux_change t
     WHERE t.devise = cb.devise ORDER BY t.date_taux DESC LIMIT 1)
  )
FROM releves_bancaires rb
JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
WHERE e.journal = 'BNQ'
  AND e.ref_folio LIKE 'MC-%'
  AND e.devise_origine = 'MUR'
  AND e.taux_change_applique = 1
  AND cb.devise != 'MUR'
  AND rb.id = CAST(SUBSTRING(e.ref_folio, 4, 36) AS UUID);
