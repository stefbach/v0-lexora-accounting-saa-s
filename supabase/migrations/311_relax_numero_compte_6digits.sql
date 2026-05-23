-- ============================================================================
-- Migration 311 — Élargir contrainte numero_compte à 6 chiffres
-- ============================================================================
-- CONTEXTE :
--   La migration 202 avait posé une contrainte CHECK sur numero_compte :
--     ^[1-8][0-9]{2,4}$  → 3 à 5 chiffres
--   Mais Lexora utilise des codes 6 chiffres pour les sub-comptes bancaires
--   (ex : 512100 MUR, 512101 EUR). Ces codes existent déjà dans
--   comptes_bancaires.compte_comptable mais sont rejetés par le CHECK quand
--   on essaie de les écrire dans ecritures_comptables_v2.
--
--   Cas observé : mig 310 a fait UPDATE en rollback à cause de '512100'.
--
-- FIX :
--   Relâcher la regex à 3-6 chiffres : ^[1-8][0-9]{2,5}$
--   Puis re-runner le UPDATE de la mig 310.
-- ============================================================================

ALTER TABLE public.ecritures_comptables_v2
  DROP CONSTRAINT IF EXISTS chk_ecritures_v2_numero_compte_format;

ALTER TABLE public.ecritures_comptables_v2
  ADD CONSTRAINT chk_ecritures_v2_numero_compte_format
  CHECK (numero_compte IS NULL OR numero_compte ~ '^[1-8][0-9]{2,5}$')
  NOT VALID;

COMMENT ON CONSTRAINT chk_ecritures_v2_numero_compte_format ON public.ecritures_comptables_v2 IS
  'Format PCM : 3 à 6 chiffres, commençant par 1-8. Étendu en mig 311 pour les sub-comptes bancaires (512100 / 512101).';

-- ── Re-run UPDATE de la mig 310 (split 512 par devise) ──────────────────────
WITH mapping AS (
  SELECT
    societe_id,
    COALESCE(devise, 'MUR') AS devise,
    MIN(compte_comptable) AS compte_pcg,
    COUNT(*) AS nb_comptes
  FROM comptes_bancaires
  WHERE compte_comptable IS NOT NULL
  GROUP BY societe_id, COALESCE(devise, 'MUR')
)
UPDATE ecritures_comptables_v2 e
SET numero_compte = m.compte_pcg
FROM mapping m
WHERE e.numero_compte = '512'
  AND e.societe_id = m.societe_id
  AND COALESCE(e.devise_origine, 'MUR') = m.devise
  AND m.nb_comptes = 1;

-- ── VÉRIFICATIONS ───────────────────────────────────────────────────────────
SELECT
  societe_id,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte LIKE '512%'
GROUP BY societe_id, numero_compte
ORDER BY societe_id, numero_compte;

-- Équilibre global doit rester inchangé
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2;
