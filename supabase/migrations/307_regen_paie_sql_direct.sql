-- ============================================================================
-- Migration 307 — INSERT direct (pas de RPC) pour régénérer écritures paie
-- ============================================================================
-- CONTEXTE :
--   Migration 306 a échoué silencieusement : le DO loop a tourné mais la RPC
--   generer_ecritures_paie a erroré (probablement sur le DECLARE imbriqué).
--   Toutes les erreurs ont été swallowées par EXCEPTION WHEN OTHERS.
--   Résultat : retour à l'état pré-304 (16 lignes 6411 = 404k pour DDS).
--
--   Diagnostic confirmé via API /api/comptable/etats-financiers :
--   - charges_perso DDS = 600,935.40 MUR seulement
--   - bulletins_paie : 158 bulletins import_excel pour DDS, 6.6M brut
--
-- STRATÉGIE :
--   Bypass complet de la RPC. INSERT direct en SQL depuis bulletins_paie.
--   Simple, robuste, idempotent (DELETE puis INSERT).
-- ============================================================================

-- ── ÉTAPE 1 : Nettoyer les BP-xxx existants pour les import_excel ───────────
DELETE FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE'
  AND ref_folio LIKE 'BP-%'
  AND ref_folio IN (
    SELECT 'BP-' || bp.id::text
    FROM bulletins_paie bp
    WHERE bp.source = 'import_excel'
  );

-- ── ÉTAPE 2 : DR 6411 = salaire_brut ────────────────────────────────────────
INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id,
  'OD-PAIE',
  bp.periode::DATE,
  '6411',
  'Salaire brut - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  COALESCE(bp.salaire_brut, 0),
  0,
  'BP-' || bp.id::text,
  TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.salaire_brut, 0) > 0;

-- ── ÉTAPE 3 : CR 4210 = net à payer (ou brut - retenues si net=0) ───────────
INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id,
  'OD-PAIE',
  bp.periode::DATE,
  '4210',
  'Net a payer - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0,
  CASE WHEN COALESCE(bp.salaire_net, 0) > 0
    THEN bp.salaire_net
    ELSE GREATEST(0,
      COALESCE(bp.salaire_brut, 0)
      - COALESCE(bp.csg_salarie, 0)
      - COALESCE(bp.nsf_salarie, 0)
      - COALESCE(bp.paye, 0)
    )
  END,
  'BP-' || bp.id::text,
  TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.salaire_brut, 0) > 0;

-- ── ÉTAPE 4 : Retenues salariales ───────────────────────────────────────────
INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4311',
  'CSG salarie - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.csg_salarie, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.csg_salarie, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4312',
  'NSF salarie - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.nsf_salarie, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.nsf_salarie, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4330',
  'PAYE - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.paye, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.paye, 0) > 0;

-- ── ÉTAPE 5 : Charges patronales DR (6451-6454) ─────────────────────────────
INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '6451',
  'CSG patronal - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  bp.csg_patronal, 0, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.csg_patronal, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '6452',
  'NSF patronal - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  bp.nsf_patronal, 0, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.nsf_patronal, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '6453',
  'PRGF - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  bp.prgf, 0, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.prgf, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '6454',
  'Training Levy - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  bp.training_levy, 0, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.training_levy, 0) > 0;

-- ── ÉTAPE 6 : Contre-parties patronales CR (4321-4324) ──────────────────────
INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4321',
  'CSG patronal a payer - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.csg_patronal, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.csg_patronal, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4322',
  'NSF patronal a payer - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.nsf_patronal, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.nsf_patronal, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4323',
  'PRGF a payer - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.prgf, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.prgf, 0) > 0;

INSERT INTO ecritures_comptables_v2 (
  societe_id, journal, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, ref_folio, exercice
)
SELECT
  bp.societe_id, 'OD-PAIE', bp.periode::DATE, '4324',
  'Training Levy a payer - ' || COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''),
  0, bp.training_levy, 'BP-' || bp.id::text, TO_CHAR(bp.periode, 'YYYY')
FROM bulletins_paie bp
JOIN employes e ON e.id = bp.employe_id
WHERE bp.source = 'import_excel'
  AND COALESCE(bp.training_levy, 0) > 0;

-- ── ÉTAPE 7 : Re-équilibrer les folios déficitaires (UPDATE CR 4210) ────────
UPDATE ecritures_comptables_v2 cur
SET credit_mur = cur.credit_mur + folio.deficit
FROM (
  SELECT societe_id, ref_folio,
    SUM(debit_mur) - SUM(credit_mur) AS deficit
  FROM ecritures_comptables_v2
  WHERE journal = 'OD-PAIE' AND ref_folio LIKE 'BP-%'
  GROUP BY societe_id, ref_folio
  HAVING SUM(debit_mur) - SUM(credit_mur) > 0.01
) folio
WHERE cur.journal       = 'OD-PAIE'
  AND cur.societe_id    = folio.societe_id
  AND cur.ref_folio     = folio.ref_folio
  AND cur.numero_compte = '4210';

-- ── VÉRIFICATIONS ───────────────────────────────────────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

SELECT numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_C
FROM ecritures_comptables_v2
WHERE societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
  AND numero_compte LIKE '64%'
GROUP BY numero_compte
ORDER BY numero_compte;
