-- ============================================================================
-- Migration 309 — Normaliser libellés écritures inter-sociétés (cosmétique)
-- ============================================================================
-- CONTEXTE :
--   Les écritures inter-sociétés DDS↔OCC sont déjà correctement classées
--   sur compte 451 (Comptes courants Groupe) suite aux migrations 291-293.
--   MAIS les libellés conservent l'ancienne nomenclature 'virement_interne —'
--   ou 'interco —' qui suggère à tort qu'il s'agit de virements intercompte
--   (transit 5800).
--
--   Diagnostic : 61 lignes sur compte 451 + 62 lignes sur compte 512 (BNQ)
--   ont un libellé contenant DIGITAL DATA SOL/SOLUTIONS ou OBESITY CARE CLINIC.
--   Total : 14.98M DR / 14.98M CR — données ÉQUILIBRÉES et bien classées.
--
-- STRATÉGIE :
--   Cosmétique pure : remplacer le préfixe libellé par 'inter_societe' pour
--   refléter la vraie nature comptable. AUCUNE modification de montant ni
--   de compte. Équilibre global garanti.
-- ============================================================================

UPDATE ecritures_comptables_v2
SET libelle = REGEXP_REPLACE(
  libelle,
  '^(virement_interne|virement interne|interco)\s*(--|—|-)',
  'inter_societe \2',
  'i'
)
WHERE journal = 'BNQ'
  AND (
       libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%digital data solutions%'
    OR libelle ILIKE '%obesity care clinic%'
  )
  AND (
       libelle ILIKE 'virement_interne%'
    OR libelle ILIKE 'virement interne%'
    OR libelle ILIKE 'interco%'
  );

-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
-- Distribution des préfixes après update
SELECT
  CASE
    WHEN libelle ILIKE 'inter_societe%'     THEN 'inter_societe (✅ normalisé)'
    WHEN libelle ILIKE 'virement_interne%'  THEN 'virement_interne (❌ non normalisé)'
    WHEN libelle ILIKE 'interco%'           THEN 'interco (❌ non normalisé)'
    ELSE 'autre'
  END AS prefixe_libelle,
  COUNT(*) AS nb
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND (
       libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%digital data solutions%'
    OR libelle ILIKE '%obesity care clinic%'
  )
GROUP BY prefixe_libelle
ORDER BY nb DESC;

-- Équilibre global : doit rester INCHANGÉ (UPDATE ne touche pas debit_mur/credit_mur)
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2;
