-- ============================================================================
-- Migration 312 — Split compte 451 : intercompte (5800) vs inter-sociétés (451)
-- ============================================================================
-- CONTEXTE :
--   La mig 308 avait déplacé toutes les écritures BNQ avec libellé contenant
--   DDS ou OCC du compte 5800 vers le compte 451, en supposant que c'étaient
--   toutes des inter-sociétés.
--
--   ERREUR : certaines de ces écritures sont en réalité des virements
--   INTERCOMPTE (DDS envoie/reçoit à/depuis lui-même = transfert entre 2
--   comptes bancaires de DDS, ex MUR → EUR). Ces virements doivent être sur
--   compte 5800 (transit), PAS sur 451 (inter-sociétés).
--
--   Règle de distinction :
--     - Écriture societe_id=DDS + libellé contient 'DIGITAL DATA SOL/SOLUTIONS'
--         → c'est DDS qui parle de DDS-lui-même = INTERCOMPTE → 5800
--     - Écriture societe_id=DDS + libellé contient 'OBESITY CARE CLINIC'
--         → DDS qui parle d'OCC = INTER-SOCIÉTÉS → 451 (garde)
--     - Vice versa pour OCC :
--         - societe_id=OCC + libellé contient 'OBESITY CARE CLINIC'
--             → INTERCOMPTE → 5800
--         - societe_id=OCC + libellé contient 'DIGITAL DATA SOL/SOLUTIONS'
--             → INTER-SOCIÉTÉS → 451 (garde)
-- ============================================================================

-- ── DIAGNOSTIC PRÉALABLE ────────────────────────────────────────────────────
-- Quelles écritures sur 451 vont être identifiées comme intercompte (= self) ?
SELECT
  CASE societe_id::text
    WHEN '1826dde7-7b41-4d14-bc75-d8d22dfc75fb' THEN 'DDS'
    WHEN 'b010d75c-62a2-4aae-a52b-8c18261047f7' THEN 'OCC'
    ELSE 'AUTRE'
  END AS societe,
  CASE
    WHEN (societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
          AND (libelle ILIKE '%digital data sol%' OR libelle ILIKE '%digital data solutions%'))
      OR (societe_id = 'b010d75c-62a2-4aae-a52b-8c18261047f7'
          AND libelle ILIKE '%obesity care clinic%')
    THEN 'INTERCOMPTE (self) → 5800'
    WHEN (societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
          AND libelle ILIKE '%obesity care clinic%')
      OR (societe_id = 'b010d75c-62a2-4aae-a52b-8c18261047f7'
          AND (libelle ILIKE '%digital data sol%' OR libelle ILIKE '%digital data solutions%'))
    THEN 'INTER-SOCIÉTÉS (sister) → garde 451'
    ELSE 'AUTRE → garde 451'
  END AS categorie,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE numero_compte = '451'
GROUP BY societe, categorie
ORDER BY societe, categorie;

-- ── MIGRATION ───────────────────────────────────────────────────────────────
UPDATE ecritures_comptables_v2
SET
  numero_compte = '5800',
  nom_compte = 'Virements internes (transit)',
  libelle = REGEXP_REPLACE(
    libelle,
    '^(inter_societe|virement_interne|virement interne|interco)\s*(--|—|-)',
    'intercompte \2',
    'i'
  )
WHERE numero_compte = '451'
  AND (
    -- DDS qui parle de DDS lui-même
    (societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
     AND (libelle ILIKE '%digital data sol%' OR libelle ILIKE '%digital data solutions%'))
    OR
    -- OCC qui parle d'OCC lui-même
    (societe_id = 'b010d75c-62a2-4aae-a52b-8c18261047f7'
     AND libelle ILIKE '%obesity care clinic%')
  );

-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
-- Distribution finale 451 vs 5800 par société
SELECT
  CASE societe_id::text
    WHEN '1826dde7-7b41-4d14-bc75-d8d22dfc75fb' THEN 'DDS'
    WHEN 'b010d75c-62a2-4aae-a52b-8c18261047f7' THEN 'OCC'
    ELSE 'AUTRE'
  END AS societe,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
WHERE numero_compte IN ('451', '5800')
GROUP BY societe, numero_compte
ORDER BY societe, numero_compte;

-- Équilibre global doit rester inchangé
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre
FROM ecritures_comptables_v2;
