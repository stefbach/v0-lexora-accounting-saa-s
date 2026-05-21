-- ============================================================================
-- Migration 310 — Split compte 512 générique → compte_comptable réel par banque
-- ============================================================================
-- CONTEXTE :
--   DDS a 2 comptes bancaires distincts avec leurs propres codes PCG :
--     - MCB MUR 000447954555 → compte_comptable = '512100'
--     - MCB EUR 000447954587 → compte_comptable = '512101'
--   Mais le rapprochement créait des écritures sur le code générique '512'
--   (3 chiffres), mélangeant toutes les devises et toutes les banques sur le
--   même solde. Résultat : impossible de distinguer MUR vs EUR dans le Grand
--   Livre et le PCM.
--
--   Diagnostic DDS : 126 écritures sur '512', AUCUNE sur '512100' ou '512101'.
--   Pareil probablement pour OCC.
--
-- STRATÉGIE :
--   Utiliser la table comptes_bancaires comme source de vérité :
--   pour chaque écriture sur '512', regarder la devise_origine et trouver
--   le compte_comptable correspondant pour cette société.
--
--   Sécurité : ne migrer QUE quand le mapping (societe, devise) est unique
--   dans comptes_bancaires (pas d'ambiguïté). Les cas multi-banque-même-
--   devise restent sur '512' avec un warning.
-- ============================================================================

-- ── DIAGNOSTIC PRÉALABLE ────────────────────────────────────────────────────
-- 1) Mapping (société, devise) → compte_comptable (doit être unique pour
--    pouvoir migrer automatiquement)
SELECT
  societe_id,
  devise,
  COUNT(*) AS nb_comptes,
  STRING_AGG(DISTINCT compte_comptable, ', ') AS comptes_PCG,
  STRING_AGG(nom_compte, ', ') AS noms_bancaires
FROM comptes_bancaires
WHERE compte_comptable IS NOT NULL
GROUP BY societe_id, devise
ORDER BY societe_id, devise;

-- 2) Combien d'écritures '512' à migrer par société + devise
SELECT
  societe_id,
  COALESCE(devise_origine, 'MUR') AS devise_origine,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE numero_compte = '512'
GROUP BY societe_id, COALESCE(devise_origine, 'MUR')
ORDER BY societe_id, devise_origine;

-- ── MIGRATION ───────────────────────────────────────────────────────────────
-- Update écritures '512' → compte_comptable réel selon (societe_id, devise)
-- Skip les cas avec plusieurs comptes même devise pour éviter ambiguïté.

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
  AND m.nb_comptes = 1;  -- skip si ambiguïté

-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
-- Nouvelle distribution par compte 512xxx
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
-- Attendu DDS : 2 lignes (512100 MUR + 512101 EUR), plus de '512' générique
-- Attendu OCC : idem selon ses comptes_bancaires

-- Équilibre global doit rester inchangé (UPDATE ne change pas les montants)
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2;
