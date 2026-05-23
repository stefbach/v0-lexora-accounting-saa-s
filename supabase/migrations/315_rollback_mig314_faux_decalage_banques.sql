-- ============================================================================
-- Migration 315 — ROLLBACK de la mig 314 (faux décalage banques 512100/512101)
-- ============================================================================
-- CONTEXTE :
--   La mig 314 a créé pour chaque écriture orpheline sur 5800 une contrepartie
--   sur 512xxx + une ligne miroir sur 5800. RÉSULTAT :
--     - 5800 = 0 ✓
--     - MAIS 512100 (Banque MUR) gonflé à +16.8M (au lieu de ~10.5M réel)
--     - MAIS 512101 (intercompte) à -10.6M (au lieu de ~-4.3M réel)
--
--   CAUSE : on a supposé que TOUTES les écritures orphelines sur 5800
--   représentaient des virements bancaires réels sans contrepartie. En réalité
--   certaines sont des fausses écritures (erreurs, doublons, classifications
--   erronées) → créer des contreparties = inventer de l'argent.
--
-- ACTION : supprimer toutes les écritures créées par 314
--          (ref_folio LIKE 'MC-intercompte-fix314-%')
-- ============================================================================

BEGIN;

-- ── 1. AUDIT AVANT SUPPRESSION ────────────────────────────────────────────
SELECT
  'À SUPPRIMER (créées par mig 314)' AS section,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'MC-intercompte-fix314-%'
GROUP BY numero_compte
ORDER BY numero_compte;

-- ── 2. SUPPRESSION ────────────────────────────────────────────────────────
DELETE FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'MC-intercompte-fix314-%';

-- ── 3. VÉRIFICATION : retour à l'état pré-mig 314 ─────────────────────────
SELECT
  'APRÈS ROLLBACK' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  e.numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(e.debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2 e
WHERE e.numero_compte IN ('5800', '512100', '512101')
GROUP BY e.societe_id, e.numero_compte
ORDER BY e.societe_id, e.numero_compte;

-- ── 4. BALANCE GLOBALE ────────────────────────────────────────────────────
SELECT
  'BALANCE GLOBALE' AS section,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;

COMMIT;
