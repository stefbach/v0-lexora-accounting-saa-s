-- ============================================================================
-- Migration 285 — Diagnostic + correctif des écritures EUR avec taux=1
-- ============================================================================
-- CONTEXTE :
-- Un bug dans lettrer_manuel (rapprochement) ne passait pas les taux live
-- en fallback à resolveHistoricalRateSafe. Résultat : si le taux historique
-- était absent pour une date, taux_change_applique=1 était stocké au lieu
-- du taux réel EUR/MUR (~52-54). Les montants debit_mur/credit_mur étaient
-- donc en EUR brut (ex: 100 EUR → 100 MUR au lieu de ~5200 MUR).
--
-- FIX CODE : lib/rapprochement/route.ts — ajout live rates comme fallback.
-- Ce script CORRIGE les écritures existantes erronées en utilisant le taux
-- historique le plus proche ou le taux live EUR disponible.
-- ============================================================================

-- ── ÉTAPE 1 : Diagnostic — afficher les écritures suspectes ──
-- Décommenter et exécuter pour vérifier avant d'appliquer le fix :
--
-- SELECT e.id, e.numero_compte, e.date_ecriture, e.journal,
--        e.debit_mur, e.credit_mur,
--        e.devise_origine, e.montant_origine, e.taux_change_applique,
--        e.libelle, e.ref_folio
-- FROM ecritures_comptables_v2 e
-- WHERE e.devise_origine = 'EUR'
--   AND e.taux_change_applique <= 1.5  -- taux réel EUR/MUR est ~52-54
--   AND e.montant_origine IS NOT NULL
-- ORDER BY e.date_ecriture DESC;

-- ── ÉTAPE 2 : Correction — utiliser le taux historique le plus proche ──
-- Met à jour debit_mur/credit_mur et taux_change_applique pour toutes les
-- écritures EUR où le taux stocké est ≤ 1.5 (clairement erroné).
WITH rates AS (
  SELECT DISTINCT ON (h.devise)
    h.devise,
    h.taux_vers_mur,
    h.date_taux
  FROM taux_change_historique h
  WHERE h.devise = 'EUR'
  ORDER BY h.devise, h.date_taux DESC
)
UPDATE ecritures_comptables_v2 e
SET
  debit_mur  = CASE WHEN e.debit_mur  > 0 THEN ROUND((e.montant_origine * r.taux_vers_mur)::numeric, 2) ELSE 0 END,
  credit_mur = CASE WHEN e.credit_mur > 0 THEN ROUND((e.montant_origine * r.taux_vers_mur)::numeric, 2) ELSE 0 END,
  taux_change_applique = r.taux_vers_mur
FROM rates r
WHERE e.devise_origine = 'EUR'
  AND e.taux_change_applique <= 1.5
  AND e.montant_origine IS NOT NULL
  AND r.devise = 'EUR';

-- Fallback : si taux_change_historique est vide, utiliser taux_change (live)
WITH rates_live AS (
  SELECT DISTINCT ON (devise)
    devise,
    taux AS taux_vers_mur
  FROM taux_change
  WHERE devise = 'EUR'
  ORDER BY devise, date_taux DESC
)
UPDATE ecritures_comptables_v2 e
SET
  debit_mur  = CASE WHEN e.debit_mur  > 0 THEN ROUND((e.montant_origine * r.taux_vers_mur)::numeric, 2) ELSE 0 END,
  credit_mur = CASE WHEN e.credit_mur > 0 THEN ROUND((e.montant_origine * r.taux_vers_mur)::numeric, 2) ELSE 0 END,
  taux_change_applique = r.taux_vers_mur
FROM rates_live r
WHERE e.devise_origine = 'EUR'
  AND e.taux_change_applique <= 1.5
  AND e.montant_origine IS NOT NULL
  AND r.devise = 'EUR';
