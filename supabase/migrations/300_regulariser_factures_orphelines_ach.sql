-- ============================================================================
-- Migration 300 — Régulariser 2 factures ACH orphelines (sans ref_folio)
-- ============================================================================
-- CONTEXTE :
--   Reste 151.27 MUR de déséquilibre global, localisé sur 2 factures ACH
--   sans ref_folio (sur 4 factures orphelines au total, 2 sont équilibrées) :
--
--   1) Mauritius Telecom FINV02699083-2506M (juin 2025) — écart +0.23
--      • CR 401  = 4,687.00 (TTC fournisseur)
--      • DR 4456 = 568.50  (TVA)
--      • DR 626  = 4,118.73 (HT charges télécom)
--      → HT + TVA = 4,687.23 ≠ 4,687.00 TTC → arrondi
--      Fix : réduire DR 626 de 0.23
--
--   2) my.t mobile (janvier 2026) — écart +151.04
--      • CR 4011 = 1,157.00 (TTC fournisseur)
--      • DR 4456 = 151.04  (TVA)
--      • DR 6180 = 1,157.00 (saisi à tort en TTC au lieu de HT)
--      → HT correct = TTC − TVA = 1,157.00 − 151.04 = 1,005.96
--      Fix : réduire DR 6180 de 151.04
--
--   Total fix : 0.23 + 151.04 = 151.27 = déséquilibre global résiduel.
-- ============================================================================

-- Fix 1 — Mauritius Telecom (arrondi TVA)
UPDATE ecritures_comptables_v2
SET debit_mur = ROUND((debit_mur - 0.23)::numeric, 2),
    libelle  = libelle || ' (régul. arrondi TVA -0.23)'
WHERE id = 'a3db2b3e-7261-4c94-8b1d-74b4955736a2';

-- Fix 2 — my.t mobile (HT saisi à tort au TTC)
UPDATE ecritures_comptables_v2
SET debit_mur = ROUND((debit_mur - 151.04)::numeric, 2),
    libelle  = libelle || ' (régul. HT saisi au TTC -151.04, vrai HT = 1005.96)'
WHERE id = '5651056d-7ba1-4c55-af5d-77f3b2ca8c59';

-- ── VÉRIFICATION FINALE : tout doit être à 0.00 ─────────────────────────────
SELECT
  journal,
  COUNT(*) nb,
  ROUND(SUM(debit_mur)::numeric, 2)  total_D,
  ROUND(SUM(credit_mur)::numeric, 2) total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) desequilibre
FROM ecritures_comptables_v2
GROUP BY journal
ORDER BY journal;

SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

-- ROLLBACK (en cas de besoin) :
--   UPDATE ecritures_comptables_v2 SET debit_mur = debit_mur + 0.23
--     WHERE id = 'a3db2b3e-7261-4c94-8b1d-74b4955736a2';
--   UPDATE ecritures_comptables_v2 SET debit_mur = debit_mur + 151.04
--     WHERE id = '5651056d-7ba1-4c55-af5d-77f3b2ca8c59';
