-- ============================================================
-- PHASE 4, Task 4D: Payroll Verification SQL Queries
-- Hand-verification of 20 employees × 6 months (120 samples)
-- ============================================================

-- STEP 1: Fetch all bulletins for 6-month verification period
-- Run this to populate the Excel verification workbook

SELECT
  e.code AS employee_code,
  e.nom || ', ' || e.prenom AS employee_name,
  bp.periode AS period,
  e.poste,
  CASE
    WHEN e.salaire_base <= 30000 THEN 'Junior'
    WHEN e.salaire_base <= 45000 THEN 'Mid'
    WHEN e.salaire_base <= 60000 THEN 'Senior'
    ELSE 'Management'
  END AS salary_level,
  e.salaire_base,
  bp.salaire_brut,
  bp.paye,
  bp.csg_salarie,
  bp.nsf_salarie,
  bp.total_deductions,
  bp.salaire_net,
  bp.statut,
  bp.ia_valide,
  bp.anomalies
FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
ORDER BY e.code, bp.periode;


-- ============================================================
-- STEP 2: PAYE Calculation Verification
-- ============================================================

-- Calculate expected PAYE per barème for all samples
-- Barème: 0% (0-390k), 10% (390k-700k), 15% (700k+)

WITH paye_calc AS (
  SELECT
    e.code,
    e.nom || ', ' || e.prenom AS nom_complet,
    bp.periode,
    bp.salaire_brut,
    (bp.salaire_brut * 12) AS annual_gross,
    CASE
      WHEN (bp.salaire_brut * 12) <= 390000 THEN 0.00
      WHEN (bp.salaire_brut * 12) <= 700000 THEN
        ROUND(((bp.salaire_brut * 12) - 390000) * 0.10 / 12, 2)
      ELSE
        ROUND((310000 * 0.10 + ((bp.salaire_brut * 12) - 700000) * 0.15) / 12, 2)
    END AS paye_expected,
    bp.paye AS paye_system,
    ROUND(bp.paye - CASE
      WHEN (bp.salaire_brut * 12) <= 390000 THEN 0.00
      WHEN (bp.salaire_brut * 12) <= 700000 THEN
        ROUND(((bp.salaire_brut * 12) - 390000) * 0.10 / 12, 2)
      ELSE
        ROUND((310000 * 0.10 + ((bp.salaire_brut * 12) - 700000) * 0.15) / 12, 2)
    END, 2) AS paye_variance
  FROM employes e
  JOIN bulletins_paie bp ON e.id = bp.employe_id
  WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
    AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
)
SELECT
  code,
  nom_complet,
  periode,
  ROUND(salaire_brut, 2) AS monthly_gross,
  annual_gross,
  paye_expected,
  paye_system,
  paye_variance,
  CASE
    WHEN ABS(paye_variance) <= 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM paye_calc
ORDER BY code, periode;


-- ============================================================
-- STEP 3: CSG Calculation Verification
-- ============================================================

-- CSG: 1.5% if gross ≤ 50k, 3.0% if > 50k

WITH csg_calc AS (
  SELECT
    e.code,
    e.nom || ', ' || e.prenom AS nom_complet,
    bp.periode,
    bp.salaire_brut,
    CASE
      WHEN bp.salaire_brut <= 50000 THEN ROUND(bp.salaire_brut * 0.015, 2)
      ELSE ROUND(bp.salaire_brut * 0.03, 2)
    END AS csg_expected,
    bp.csg_salarie AS csg_system,
    ROUND(bp.csg_salarie - CASE
      WHEN bp.salaire_brut <= 50000 THEN ROUND(bp.salaire_brut * 0.015, 2)
      ELSE ROUND(bp.salaire_brut * 0.03, 2)
    END, 2) AS csg_variance
  FROM employes e
  JOIN bulletins_paie bp ON e.id = bp.employe_id
  WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
    AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
)
SELECT
  code,
  nom_complet,
  periode,
  ROUND(salaire_brut, 2) AS monthly_gross,
  CASE WHEN salaire_brut <= 50000 THEN '1.5%' ELSE '3.0%' END AS csg_rate,
  csg_expected,
  csg_system,
  csg_variance,
  CASE
    WHEN ABS(csg_variance) <= 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM csg_calc
ORDER BY code, periode;


-- ============================================================
-- STEP 4: NSF Calculation Verification
-- ============================================================

-- NSF: 1.0% of gross (subject to insurable earnings cap)
-- Cap from nsf_baremes table (typically ~228k MUR per month for 2025)

WITH nsf_calc AS (
  SELECT
    e.code,
    e.nom || ' ' || e.prenom AS nom_complet,
    bp.periode,
    bp.salaire_brut,
    COALESCE(nb.monthly_max, 228000) AS nsf_cap,
    CASE
      WHEN bp.salaire_brut >= COALESCE(nb.monthly_max, 228000) THEN
        ROUND(COALESCE(nb.monthly_max, 228000) * 0.01, 2)
      ELSE
        ROUND(bp.salaire_brut * 0.01, 2)
    END AS nsf_expected,
    bp.nsf_salarie AS nsf_system,
    ROUND(bp.nsf_salarie - CASE
      WHEN bp.salaire_brut >= COALESCE(nb.monthly_max, 228000) THEN
        ROUND(COALESCE(nb.monthly_max, 228000) * 0.01, 2)
      ELSE
        ROUND(bp.salaire_brut * 0.01, 2)
    END, 2) AS nsf_variance
  FROM employes e
  JOIN bulletins_paie bp ON e.id = bp.employe_id
  LEFT JOIN nsf_baremes nb ON bp.periode >= nb.date_debut
    AND (nb.date_fin IS NULL OR bp.periode <= nb.date_fin)
  WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
    AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
)
SELECT
  code,
  nom_complet,
  periode,
  ROUND(salaire_brut, 2) AS monthly_gross,
  nsf_cap,
  nsf_expected,
  nsf_system,
  nsf_variance,
  CASE
    WHEN ABS(nsf_variance) <= 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM nsf_calc
ORDER BY code, periode;


-- ============================================================
-- STEP 5: Net Salary Verification
-- ============================================================

WITH net_calc AS (
  SELECT
    e.code,
    e.nom || ', ' || e.prenom AS nom_complet,
    bp.periode,
    bp.salaire_brut,
    bp.paye,
    bp.csg_salarie,
    bp.nsf_salarie,
    COALESCE(bp.montant_absence, 0) AS montant_absence,
    (bp.paye + bp.csg_salarie + bp.nsf_salarie + COALESCE(bp.montant_absence, 0))
      AS total_deductions,
    (bp.salaire_brut - (bp.paye + bp.csg_salarie + bp.nsf_salarie + COALESCE(bp.montant_absence, 0)))
      AS net_expected,
    bp.salaire_net,
    ROUND(bp.salaire_net - (bp.salaire_brut - (bp.paye + bp.csg_salarie + bp.nsf_salarie + COALESCE(bp.montant_absence, 0))), 2)
      AS net_variance
  FROM employes e
  JOIN bulletins_paie bp ON e.id = bp.employe_id
  WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
    AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
)
SELECT
  code,
  nom_complet,
  periode,
  ROUND(salaire_brut, 2),
  ROUND(total_deductions, 2),
  ROUND(net_expected, 2),
  ROUND(salaire_net, 2),
  net_variance,
  CASE
    WHEN ABS(net_variance) <= 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END AS verification_status
FROM net_calc
ORDER BY code, periode;


-- ============================================================
-- STEP 6: GL Posting Verification
-- ============================================================

-- Verify that all bulletins have corresponding GL entries
-- and that GL amounts match bulletin amounts

SELECT
  e.code,
  e.nom,
  bp.periode,
  bp.salaire_brut,
  bp.salaire_net,
  bp.paye,
  bp.csg_salarie + bp.csg_patronal + bp.nsf_salarie + bp.nsf_patronal
    AS total_social_charges,

  -- Check GL entries
  COALESCE(SUM(CASE WHEN ec.compte = '6411' THEN ec.debit ELSE 0 END), 0)
    AS gl_6411_salaires,
  COALESCE(SUM(CASE WHEN ec.compte = '4210' THEN ec.credit ELSE 0 END), 0)
    AS gl_4210_net_payable,
  COALESCE(SUM(CASE WHEN ec.compte = '4330' THEN ec.credit ELSE 0 END), 0)
    AS gl_4330_paye,
  COALESCE(SUM(CASE WHEN ec.compte IN ('4311', '4312') THEN ec.credit ELSE 0 END), 0)
    AS gl_4311_csg_nsf_salarie,

  -- Reconciliation
  CASE
    WHEN COALESCE(SUM(CASE WHEN ec.compte = '6411' THEN ec.debit ELSE 0 END), 0) = bp.salaire_brut
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS gl_6411_status,

  CASE
    WHEN COALESCE(SUM(CASE WHEN ec.compte = '4210' THEN ec.credit ELSE 0 END), 0) = bp.salaire_net
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS gl_4210_status,

  CASE
    WHEN COALESCE(SUM(CASE WHEN ec.compte = '4330' THEN ec.credit ELSE 0 END), 0) = bp.paye
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS gl_4330_status

FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
LEFT JOIN ecritures_comptables_v2 ec ON ec.periode = bp.periode
  AND ec.journal = 'OD-PAIE'
  AND ec.societe_id = bp.societe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
GROUP BY e.code, e.nom, bp.id, bp.periode, bp.salaire_brut, bp.salaire_net, bp.paye,
         bp.csg_salarie, bp.csg_patronal, bp.nsf_salarie, bp.nsf_patronal
ORDER BY e.code, bp.periode;


-- ============================================================
-- STEP 7: MRA Compliance — PAYE Withholding vs. Declarations
-- ============================================================

-- Verify total PAYE withheld matches MRA monthly declarations

SELECT
  bp.periode,
  COUNT(DISTINCT bp.employe_id) AS nb_employees,
  ROUND(SUM(bp.paye), 2) AS total_paye_withheld,
  COALESCE(dpm.total_paye_retenu, 0) AS total_paye_declared,
  ROUND(SUM(bp.paye) - COALESCE(dpm.total_paye_retenu, 0), 2) AS variance,
  CASE
    WHEN ABS(SUM(bp.paye) - COALESCE(dpm.total_paye_retenu, 0)) <= 0.01
    THEN 'COMPLIANT'
    ELSE 'VARIANCE'
  END AS compliance_status
FROM bulletins_paie bp
LEFT JOIN declarations_paye_mensuelle dpm ON bp.periode = dpm.periode
  AND bp.societe_id = dpm.societe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND bp.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
GROUP BY bp.periode, dpm.total_paye_retenu
ORDER BY bp.periode;


-- ============================================================
-- STEP 8: MRA Compliance — CSG/NSF Withholding vs. Declarations
-- ============================================================

-- Verify CSG/NSF withheld matches MRA declarations

SELECT
  bp.periode,
  COUNT(DISTINCT bp.employe_id) AS nb_employees,
  ROUND(SUM(bp.csg_salarie), 2) AS total_csg_withheld,
  ROUND(SUM(bp.nsf_salarie), 2) AS total_nsf_withheld,
  ROUND(SUM(bp.csg_salarie) + SUM(bp.nsf_salarie), 2) AS total_social_withheld,
  COALESCE(dcm.total_csg_salarie, 0) AS csg_declared,
  COALESCE(dcm.total_nsf_salarie, 0) AS nsf_declared,
  CASE
    WHEN ABS(SUM(bp.csg_salarie) - COALESCE(dcm.total_csg_salarie, 0)) <= 0.01
      AND ABS(SUM(bp.nsf_salarie) - COALESCE(dcm.total_nsf_salarie, 0)) <= 0.01
    THEN 'COMPLIANT'
    ELSE 'VARIANCE'
  END AS compliance_status
FROM bulletins_paie bp
LEFT JOIN declarations_csg_mensuelle dcm ON bp.periode = dcm.periode
  AND bp.societe_id = dcm.societe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND bp.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
GROUP BY bp.periode, dcm.total_csg_salarie, dcm.total_nsf_salarie
ORDER BY bp.periode;


-- ============================================================
-- DATA QUALITY CHECKS
-- ============================================================

-- CHECK 1: All bulletins have GL postings
SELECT
  COUNT(*) AS bulletins_without_gl
FROM bulletins_paie bp
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND bp.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_comptables_v2 ec
    WHERE ec.periode = bp.periode
      AND ec.journal = 'OD-PAIE'
      AND ec.societe_id = bp.societe_id
  );
-- Expected result: 0


-- CHECK 2: No missing employee deductions
SELECT
  e.code,
  bp.periode,
  CASE WHEN bp.paye IS NULL THEN 'PAYE' WHEN bp.csg_salarie IS NULL THEN 'CSG'
       WHEN bp.nsf_salarie IS NULL THEN 'NSF' END AS missing_deduction
FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
  AND (bp.paye IS NULL OR bp.csg_salarie IS NULL OR bp.nsf_salarie IS NULL);
-- Expected result: 0 rows


-- CHECK 3: GL entries balanced (debits = credits) per period
SELECT
  periode,
  SUM(debit) AS total_debit,
  SUM(credit) AS total_credit,
  ROUND(SUM(debit) - SUM(credit), 2) AS imbalance
FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE'
  AND periode BETWEEN '2025-07-31' AND '2025-12-31'
  AND societe_id = (SELECT id FROM societes WHERE code = 'OCC')
GROUP BY periode
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;
-- Expected result: 0 rows (all balanced)


-- CHECK 4: Salary changes during 6-month period (core staff should have no changes)
SELECT
  e.code,
  e.nom,
  COUNT(DISTINCT bp.salaire_base) AS salary_changes,
  MIN(bp.salaire_base) AS min_salary,
  MAX(bp.salaire_base) AS max_salary
FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
WHERE bp.periode BETWEEN '2025-07-01' AND '2025-12-31'
  AND e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
  AND e.code IN ('000001', '000002', '000003', '000004', '000008', '000009')
GROUP BY e.id, e.code, e.nom
HAVING COUNT(DISTINCT bp.salaire_base) > 1;
-- Expected result: 0 rows (no changes for core staff)
