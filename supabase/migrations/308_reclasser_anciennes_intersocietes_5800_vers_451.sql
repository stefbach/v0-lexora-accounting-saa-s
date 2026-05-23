-- ============================================================================
-- Migration 308 — Reclasser anciennes écritures BNQ inter-sociétés vers 451
-- ============================================================================
-- CONTEXTE :
--   Les écritures historiques créées par le rapprochement avant les fixes
--   PR #221/222/223/224 sont étiquetées 'virement_interne — DIGITAL DATA
--   SOL LTD', 'virement_interne — DIGITAL DATA SOLUTIONS LTD', 'interco
--   — Obesity Care Clinic Ltd', etc. — elles désignent des transferts
--   ENTRE deux sociétés du groupe (DDS↔OCC) mais sont sur le compte 5800
--   (transit intercompte) au lieu du compte 451 (Comptes courants Groupe,
--   IAS 24 related parties).
--
--   Les migrations 291-293 avaient déjà fait ce travail pour certaines
--   écritures. Cette mig 308 nettoie les restantes basées sur les patterns
--   de libellé observés dans le Grand Livre du 21/05/2026.
--
-- STRATÉGIE :
--   1. Trouver toutes les écritures BNQ sur 5800/5800x/5811 dont le libellé
--      contient un des noms de société sœur du groupe.
--   2. UPDATE numero_compte = '451'.
--   3. Normaliser le préfixe libellé 'virement_interne' / 'interco' →
--      'inter_societe' pour cohérence.
-- ============================================================================

-- ── DIAGNOSTIC PRÉALABLE ────────────────────────────────────────────────────
SELECT
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND (
       libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%digital data solutions%'
    OR libelle ILIKE '%obesity care clinic%'
  )
  AND numero_compte LIKE '58%'  -- 5800, 5811, etc.
GROUP BY numero_compte
ORDER BY numero_compte;

-- ── CORRECTION ──────────────────────────────────────────────────────────────
UPDATE ecritures_comptables_v2
SET
  numero_compte = '451',
  nom_compte = 'Comptes courants Groupe',
  libelle = REGEXP_REPLACE(
    libelle,
    '^(virement_interne|virement interne|interco|virement_intercompte) (--|—|-)',
    'inter_societe \2',
    'i'
  )
WHERE journal = 'BNQ'
  AND (
       libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%digital data solutions%'
    OR libelle ILIKE '%obesity care clinic%'
  )
  AND numero_compte LIKE '58%';

-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
SELECT
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND (
       libelle ILIKE '%digital data sol%'
    OR libelle ILIKE '%digital data solutions%'
    OR libelle ILIKE '%obesity care clinic%'
  )
GROUP BY numero_compte
ORDER BY numero_compte;
-- Attendu : numero_compte = '451' uniquement, 5800/5811 vidés.

-- Équilibre global doit rester intact
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2;
-- Attendu : desequilibre inchangé (le UPDATE ne change pas les montants)
