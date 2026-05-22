-- ============================================================================
-- Migration 314 — Créer les écritures manquantes virements intercompte (5800)
-- ============================================================================
-- CONTEXTE :
--   Suite du diagnostic 313. Pour chaque virement intercompte orphelin sur
--   5800, créer la contrepartie manquante DR 512yyy / CR 5800 (ou inverse)
--   afin que 5800 = 0 pour chaque société.
--
-- LOGIQUE :
--   1. Matcher sorties (DR 5800) ↔ entrées (CR 5800) par (date ±1j, montant
--      MUR approx, devises différentes). Ces écritures sont déjà équilibrées
--      → on ne touche pas.
--   2. Pour chaque ÉCRITURE ORPHELINE :
--      - Sortie orpheline (DR 5800 / CR 512-source) en devise X
--        → créer DR 512-dest / CR 5800 dans la devise OPPOSÉE (Y)
--      - Entrée orpheline (DR 512-source / CR 5800) en devise X
--        → créer DR 5800 / CR 512-dest dans la devise OPPOSÉE (Y)
--   3. Mapping numero_compte cible = comptes_bancaires.compte_comptable
--      pour (societe_id, devise_opposée)
--
-- RÉSULTAT : 5800 ≈ 0 pour chaque société.
-- ============================================================================

BEGIN;

-- ── 1. IDENTIFIER LES PAIRES ET ORPHELINES ─────────────────────────────────
CREATE TEMP TABLE temp_orphelines AS
WITH sorties AS (
  SELECT e.id, e.date_ecriture, e.societe_id, e.debit_mur AS montant,
         COALESCE(e.devise_origine, 'MUR') AS devise, e.libelle, e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800' AND e.debit_mur > 0
),
entrees AS (
  SELECT e.id, e.date_ecriture, e.societe_id, e.credit_mur AS montant,
         COALESCE(e.devise_origine, 'MUR') AS devise, e.libelle, e.ref_folio
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte = '5800' AND e.credit_mur > 0
),
sorties_appariees AS (
  SELECT DISTINCT s.id FROM sorties s
  JOIN entrees e ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
),
entrees_appariees AS (
  SELECT DISTINCT e.id FROM entrees e
  JOIN sorties s ON (
    s.societe_id = e.societe_id
    AND ABS(s.date_ecriture - e.date_ecriture) <= 1
    AND ABS(s.montant - e.montant) < 1
    AND s.devise <> e.devise
  )
)
SELECT
  'SORTIE_ORPHELINE' AS type_orphelin,
  s.id, s.date_ecriture, s.societe_id, s.montant, s.devise, s.libelle, s.ref_folio
FROM sorties s
WHERE s.id NOT IN (SELECT id FROM sorties_appariees)
UNION ALL
SELECT
  'ENTREE_ORPHELINE' AS type_orphelin,
  e.id, e.date_ecriture, e.societe_id, e.montant, e.devise, e.libelle, e.ref_folio
FROM entrees e
WHERE e.id NOT IN (SELECT id FROM entrees_appariees);

-- ── 2. MAPPING (societe_id, devise) → compte 512xxx ────────────────────────
CREATE TEMP TABLE temp_mapping_devise_compte AS
SELECT
  cb.societe_id,
  cb.devise,
  cb.compte_comptable,
  cb.nom_compte
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL;

-- ── 3. CRÉER LES CONTREPARTIES MANQUANTES ──────────────────────────────────
-- Pour chaque orpheline, créer la contrepartie sur le compte 512 de l'AUTRE
-- devise de la même société.
INSERT INTO ecritures_comptables_v2 (
  id,
  societe_id,
  date_ecriture,
  ref_folio,
  numero_compte,
  nom_compte,
  description,
  libelle,
  debit_mur,
  credit_mur,
  journal,
  devise_origine,
  created_at
)
SELECT
  gen_random_uuid()                                              AS id,
  o.societe_id,
  o.date_ecriture,
  'MC-intercompte-fix314-' || o.id::TEXT                         AS ref_folio,
  m.compte_comptable                                             AS numero_compte,
  m.nom_compte                                                   AS nom_compte,
  'Contrepartie intercompte (mig 314) — ' ||
    COALESCE(o.libelle, 'virement interne')                      AS description,
  'intercompte — contrepartie auto (mig 314)'                    AS libelle,
  CASE WHEN o.type_orphelin = 'SORTIE_ORPHELINE' THEN o.montant ELSE 0 END AS debit_mur,
  CASE WHEN o.type_orphelin = 'ENTREE_ORPHELINE' THEN o.montant ELSE 0 END AS credit_mur,
  'BNQ'                                                          AS journal,
  -- La contrepartie est dans la DEVISE OPPOSÉE
  CASE WHEN o.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END           AS devise_origine,
  NOW()                                                          AS created_at
FROM temp_orphelines o
JOIN temp_mapping_devise_compte m ON (
  m.societe_id = o.societe_id
  -- Compte de la devise OPPOSÉE
  AND m.devise = CASE WHEN o.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END
);

-- Pour les SORTIE_ORPHELINE on a créé DR 512-dest, mais il faut aussi CR 5800
-- Pour les ENTREE_ORPHELINE on a créé CR 5800, mais il faut aussi DR 512-dest
-- En fait NON : une seule écriture INSERT créée par orpheline est suffisante
-- car chaque orpheline représente UNE LIGNE manquante du virement complet.
--
-- Vérifions : si on a DR 5800 / CR 512-EUR (sortie EUR orpheline), il manque
-- l'autre jambe : DR 512-MUR / CR 5800 (entrée MUR).
-- → La contrepartie est : un seul INSERT avec debit_mur sur 512-MUR ET credit sur 5800
-- → MAIS l'INSERT ci-dessus ne crée QU'UNE écriture sur 512-MUR (pas sur 5800).
--
-- En double-entry, chaque opération comptable = 2 lignes. L'INSERT ci-dessus
-- ne crée qu'1 ligne. Il faut donc aussi créer la 2e ligne sur 5800.

-- ── 4. CRÉER LA 2E LIGNE (sur 5800) POUR ÉQUILIBRER ───────────────────────
-- Pour chaque orpheline, il manquait 2 lignes :
--   - 1 sur 512xxx (créée à l'étape 3)
--   - 1 sur 5800 (à créer ici, en sens inverse)
INSERT INTO ecritures_comptables_v2 (
  id,
  societe_id,
  date_ecriture,
  ref_folio,
  numero_compte,
  nom_compte,
  description,
  libelle,
  debit_mur,
  credit_mur,
  journal,
  devise_origine,
  created_at
)
SELECT
  gen_random_uuid()                                              AS id,
  o.societe_id,
  o.date_ecriture,
  'MC-intercompte-fix314-5800-' || o.id::TEXT                    AS ref_folio,
  '5800'                                                         AS numero_compte,
  'Virements internes (transit)'                                 AS nom_compte,
  'Contrepartie 5800 intercompte (mig 314) — ' ||
    COALESCE(o.libelle, 'virement interne')                      AS description,
  'intercompte — contrepartie 5800 (mig 314)'                    AS libelle,
  -- Sens INVERSE de la nouvelle ligne 512xxx
  CASE WHEN o.type_orphelin = 'SORTIE_ORPHELINE' THEN 0 ELSE o.montant END AS debit_mur,
  CASE WHEN o.type_orphelin = 'SORTIE_ORPHELINE' THEN o.montant ELSE 0 END AS credit_mur,
  'BNQ'                                                          AS journal,
  CASE WHEN o.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END           AS devise_origine,
  NOW()                                                          AS created_at
FROM temp_orphelines o
JOIN temp_mapping_devise_compte m ON (
  m.societe_id = o.societe_id
  AND m.devise = CASE WHEN o.devise = 'MUR' THEN 'EUR' ELSE 'MUR' END
);

-- ── 5. VÉRIFICATION : solde 5800 après création ────────────────────────────
SELECT
  '5800 APRÈS MIG 314' AS section,
  e.societe_id,
  (SELECT nom FROM societes WHERE id = e.societe_id) AS societe_nom,
  ROUND(SUM(e.debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(e.credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(e.debit_mur) - SUM(e.credit_mur))::numeric, 2) AS solde,
  CASE
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 1 THEN '✓ ÉQUILIBRÉ'
    WHEN ABS(SUM(e.debit_mur) - SUM(e.credit_mur)) < 100 THEN '⚠ QUASI'
    ELSE '✗ DÉSÉQUILIBRÉ'
  END AS status
FROM ecritures_comptables_v2 e
WHERE e.numero_compte = '5800'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── 6. VÉRIFICATION : balance globale toujours équilibrée ──────────────────
SELECT
  'BALANCE GLOBALE' AS section,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;

COMMIT;
