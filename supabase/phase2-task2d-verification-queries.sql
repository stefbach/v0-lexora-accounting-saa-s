-- ============================================================================
-- Phase 2, Task 2D — Payroll Extraction Agent — Verification Queries
--
-- These queries verify payroll data completeness, accuracy, and MRA compliance
-- ============================================================================

-- =============================================================================
-- PART 1: BULLETINS_PAIE DATA COMPLETENESS
-- =============================================================================

-- 1.1 Count bulletins by period (should show all 24 months)
SELECT
  b.periode,
  COUNT(*) as nb_bulletins,
  COUNT(DISTINCT b.employe_id) as nb_employes,
  SUM(b.salaire_brut) as total_brut_mur,
  SUM(b.salaire_net) as total_net_mur,
  SUM(b.paye) as total_paye_mur,
  MIN(b.date_paiement) as first_payment_date,
  MAX(b.date_paiement) as last_payment_date
FROM public.bulletins_paie b
GROUP BY b.periode
ORDER BY b.periode DESC;

-- 1.2 Identify missing months (gaps in 24-month coverage)
WITH month_range AS (
  SELECT DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '23 months' AS start_month
),
expected_months AS (
  SELECT
    TO_CHAR(DATE_TRUNC('month', start_month) + (i || ' months')::INTERVAL, 'YYYY-MM') as expected_periode
  FROM month_range
  CROSS JOIN GENERATE_SERIES(0, 23) AS i
),
actual_months AS (
  SELECT DISTINCT periode FROM public.bulletins_paie
)
SELECT expected_periode
FROM expected_months
WHERE expected_periode NOT IN (SELECT periode FROM actual_months)
ORDER BY expected_periode;

-- 1.3 Check for NULL values in critical columns
SELECT
  'employe_id' as column_name, COUNT(*) as null_count FROM public.bulletins_paie WHERE employe_id IS NULL
UNION ALL
SELECT 'periode', COUNT(*) FROM public.bulletins_paie WHERE periode IS NULL
UNION ALL
SELECT 'salaire_brut', COUNT(*) FROM public.bulletins_paie WHERE salaire_brut IS NULL
UNION ALL
SELECT 'salaire_net', COUNT(*) FROM public.bulletins_paie WHERE salaire_net IS NULL
UNION ALL
SELECT 'paye', COUNT(*) FROM public.bulletins_paie WHERE paye IS NULL
UNION ALL
SELECT 'csg_salarie', COUNT(*) FROM public.bulletins_paie WHERE csg_salarie IS NULL
UNION ALL
SELECT 'nsf_salarie', COUNT(*) FROM public.bulletins_paie WHERE nsf_salarie IS NULL
ORDER BY null_count DESC;

-- 1.4 Identify bulletins with missing employee data
SELECT DISTINCT
  b.id,
  b.employe_id,
  b.periode,
  CASE WHEN e.id IS NULL THEN 'MISSING' ELSE 'OK' END as employee_status
FROM public.bulletins_paie b
LEFT JOIN public.employes e ON b.employe_id = e.id
WHERE e.id IS NULL
LIMIT 20;

-- =============================================================================
-- PART 2: PAYROLL CALCULATION ACCURACY (MRA 2025 BARÈME)
-- =============================================================================

-- 2.1 PAYE Calculation Verification
-- Expected: 0% on 0-390k, 10% on 390k-700k, 15% above 700k
WITH paye_check AS (
  SELECT
    b.id,
    e.prenom || ' ' || e.nom as employee_name,
    b.periode,
    b.salaire_brut,
    b.paye as paye_in_bulletin,
    CASE
      WHEN b.salaire_brut <= 390000 THEN 0
      WHEN b.salaire_brut <= 700000 THEN (b.salaire_brut - 390000) * 0.10
      ELSE (700000 - 390000) * 0.10 + (b.salaire_brut - 700000) * 0.15
    END as paye_expected,
    ABS(b.paye - CASE
      WHEN b.salaire_brut <= 390000 THEN 0
      WHEN b.salaire_brut <= 700000 THEN (b.salaire_brut - 390000) * 0.10
      ELSE (700000 - 390000) * 0.10 + (b.salaire_brut - 700000) * 0.15
    END) as paye_variance
  FROM public.bulletins_paie b
  JOIN public.employes e ON b.employe_id = e.id
)
SELECT
  employee_name,
  periode,
  salaire_brut,
  paye_in_bulletin,
  paye_expected,
  paye_variance,
  CASE WHEN paye_variance > 1 THEN '❌ ERROR' ELSE '✅ OK' END as status
FROM paye_check
WHERE paye_variance > 1
ORDER BY paye_variance DESC
LIMIT 100;

-- 2.2 CSG Calculation Verification
-- Expected: 1.5% on gross < 50k, 3% on gross ≥ 50k
WITH csg_check AS (
  SELECT
    b.id,
    e.prenom || ' ' || e.nom as employee_name,
    b.periode,
    b.salaire_brut,
    b.csg_salarie as csg_in_bulletin,
    CASE
      WHEN b.salaire_brut < 50000 THEN b.salaire_brut * 0.015
      ELSE b.salaire_brut * 0.030
    END as csg_expected,
    ABS(b.csg_salarie - CASE
      WHEN b.salaire_brut < 50000 THEN b.salaire_brut * 0.015
      ELSE b.salaire_brut * 0.030
    END) as csg_variance
  FROM public.bulletins_paie b
  JOIN public.employes e ON b.employe_id = e.id
)
SELECT
  employee_name,
  periode,
  salaire_brut,
  csg_in_bulletin,
  csg_expected,
  csg_variance,
  CASE WHEN csg_variance > 1 THEN '❌ ERROR' ELSE '✅ OK' END as status
FROM csg_check
WHERE csg_variance > 1
ORDER BY csg_variance DESC
LIMIT 100;

-- 2.3 NSF Calculation Verification
-- Expected: 1% on gross salary (capped)
WITH nsf_check AS (
  SELECT
    b.id,
    e.prenom || ' ' || e.nom as employee_name,
    b.periode,
    b.salaire_brut,
    b.nsf_salarie as nsf_in_bulletin,
    b.salaire_brut * 0.01 as nsf_expected,
    ABS(b.nsf_salarie - (b.salaire_brut * 0.01)) as nsf_variance
  FROM public.bulletins_paie b
  JOIN public.employes e ON b.employe_id = e.id
)
SELECT
  employee_name,
  periode,
  salaire_brut,
  nsf_in_bulletin,
  nsf_expected,
  nsf_variance,
  CASE WHEN nsf_variance > 1 THEN '❌ ERROR' ELSE '✅ OK' END as status
FROM nsf_check
WHERE nsf_variance > 1
ORDER BY nsf_variance DESC
LIMIT 100;

-- 2.4 Net Salary Verification
-- Expected: salaire_net = salaire_brut - csg - nsf - paye - [montant_absence]
WITH net_check AS (
  SELECT
    b.id,
    e.prenom || ' ' || e.nom as employee_name,
    b.periode,
    b.salaire_brut,
    b.salaire_net as net_in_bulletin,
    (b.salaire_brut - b.csg_salarie - b.nsf_salarie - b.paye) as net_expected,
    ABS(b.salaire_net - (b.salaire_brut - b.csg_salarie - b.nsf_salarie - b.paye)) as net_variance
  FROM public.bulletins_paie b
  JOIN public.employes e ON b.employe_id = e.id
)
SELECT
  employee_name,
  periode,
  salaire_brut,
  net_in_bulletin,
  net_expected,
  net_variance,
  CASE WHEN net_variance > 1 THEN '❌ ERROR' ELSE '✅ OK' END as status
FROM net_check
WHERE net_variance > 1
ORDER BY net_variance DESC
LIMIT 100;

-- =============================================================================
-- PART 3: MRA COMPLIANCE VERIFICATION
-- =============================================================================

-- 3.1 PAYE Withholding Summary by Period
SELECT
  b.periode,
  COUNT(DISTINCT b.employe_id) as nb_employes,
  SUM(b.salaire_brut) as total_brut,
  SUM(b.paye) as total_paye_withheld,
  ROUND(SUM(b.paye) / NULLIF(SUM(b.salaire_brut), 0) * 100, 2) as paye_percentage,
  COUNT(CASE WHEN b.paye > 0 THEN 1 END) as employees_with_paye,
  MIN(b.date_paiement) as payment_date,
  SUM(CASE WHEN b.statut = 'declare_mra' THEN 1 ELSE 0 END) as declared_count
FROM public.bulletins_paie b
GROUP BY b.periode
ORDER BY b.periode DESC;

-- 3.2 Check for outstanding PAYE payable (GL account 4330)
-- This should be checked against GL records if available
SELECT
  periode,
  SUM(paye) as paye_withheld,
  COUNT(*) as nb_records
FROM public.bulletins_paie
WHERE statut IN ('valide', 'paye', 'declare_mra')
GROUP BY periode
ORDER BY periode;

-- 3.3 Identify employees with no PAYE withheld (should be 0 for most)
SELECT
  e.prenom || ' ' || e.nom as employee_name,
  COUNT(*) as months_with_zero_paye,
  AVG(b.salaire_brut) as avg_salary
FROM public.bulletins_paie b
JOIN public.employes e ON b.employe_id = e.id
WHERE b.paye = 0 AND b.salaire_brut > 390000
GROUP BY b.employe_id, e.prenom, e.nom
HAVING COUNT(*) > 5  -- Flag if more than 5 months with no PAYE
ORDER BY COUNT(*) DESC;

-- 3.4 MRA Declarations Status (if table exists)
-- Requires: declarations_paye_mensuelle and declarations_csg_mensuelle tables
SELECT
  'PAYE' as declaration_type,
  COUNT(*) as total_declarations,
  SUM(CASE WHEN statut = 'paye' THEN 1 ELSE 0 END) as paid,
  SUM(CASE WHEN statut = 'declare' THEN 1 ELSE 0 END) as declared,
  SUM(CASE WHEN statut IN ('brouillon', 'calcule') THEN 1 ELSE 0 END) as pending
FROM public.declarations_paye_mensuelle
UNION ALL
SELECT
  'CSG/NSF',
  COUNT(*),
  SUM(CASE WHEN statut = 'paye' THEN 1 ELSE 0 END),
  SUM(CASE WHEN statut = 'declare' THEN 1 ELSE 0 END),
  SUM(CASE WHEN statut IN ('brouillon', 'calcule') THEN 1 ELSE 0 END)
FROM public.declarations_csg_mensuelle;

-- =============================================================================
-- PART 4: GL POSTING VERIFICATION
-- =============================================================================

-- 4.1 Monthly GL Posting Summary for Salary Accounts
-- This shows what SHOULD be posted based on bulletins
SELECT
  b.periode,
  'GL 6411 (Salaires)' as gl_account,
  SUM(b.salaire_brut) as debit_amount,
  0 as credit_amount
FROM public.bulletins_paie b
GROUP BY b.periode
UNION ALL
SELECT
  b.periode,
  'GL 4210 (Personnel Payable)',
  0,
  SUM(b.salaire_net)
FROM public.bulletins_paie b
GROUP BY b.periode
UNION ALL
SELECT
  b.periode,
  'GL 4330 (PAYE à payer)',
  0,
  SUM(b.paye)
FROM public.bulletins_paie b
GROUP BY b.periode
UNION ALL
SELECT
  b.periode,
  'GL 4311/4312 (CSG/NSF Employee)',
  0,
  SUM(b.csg_salarie + b.nsf_salarie)
FROM public.bulletins_paie b
GROUP BY b.periode
ORDER BY periode DESC, gl_account;

-- 4.2 Verify salary accounts balance
-- Debit (Salaries) = Credit (Payable + Deductions)
SELECT
  b.periode,
  SUM(b.salaire_brut) as total_debit_6411,
  SUM(b.salaire_net + b.paye + b.csg_salarie + b.nsf_salarie + b.csg_patronal + b.nsf_patronal) as total_credits,
  SUM(b.salaire_brut) - SUM(b.salaire_net + b.paye + b.csg_salarie + b.nsf_salarie + b.csg_patronal + b.nsf_patronal) as variance
FROM public.bulletins_paie b
GROUP BY b.periode
ORDER BY periode;

-- =============================================================================
-- PART 5: EMPLOYEE SAMPLE FOR HAND VERIFICATION
-- =============================================================================

-- 5.1 Random sample of 20 employees with recent bulletins (last 6 months)
WITH recent_periods AS (
  SELECT DISTINCT periode
  FROM public.bulletins_paie
  ORDER BY periode DESC
  LIMIT 6
),
emp_sample AS (
  SELECT DISTINCT employe_id
  FROM public.bulletins_paie b
  WHERE periode IN (SELECT periode FROM recent_periods)
  ORDER BY RANDOM()
  LIMIT 20
)
SELECT
  e.code,
  e.prenom || ' ' || e.nom as employee_name,
  e.salaire_base as contract_salary,
  b.periode,
  b.salaire_brut,
  b.paye,
  b.csg_salarie,
  b.nsf_salarie,
  b.salaire_net,
  b.statut
FROM public.bulletins_paie b
JOIN public.employes e ON b.employe_id = e.id
JOIN emp_sample s ON e.id = s.employe_id
WHERE b.periode IN (SELECT periode FROM recent_periods)
ORDER BY e.nom, b.periode DESC;

-- 5.2 Employees with most recent bulletins (for quick spot check)
SELECT
  e.code,
  e.prenom || ' ' || e.nom as employee_name,
  MAX(b.periode) as latest_bulletin,
  COUNT(*) as total_bulletins,
  SUM(b.salaire_brut) as total_gross_24m,
  SUM(b.paye) as total_paye_24m,
  SUM(b.salaire_net) as total_net_24m
FROM public.bulletins_paie b
JOIN public.employes e ON b.employe_id = e.id
GROUP BY b.employe_id, e.code, e.prenom, e.nom
ORDER BY MAX(b.periode) DESC, e.nom;

-- =============================================================================
-- PART 6: DATA QUALITY SCORE
-- =============================================================================

-- 6.1 Overall data quality assessment
WITH quality_checks AS (
  SELECT
    'Total bulletins' as check_name,
    COUNT(*) as score,
    CASE WHEN COUNT(*) >= 500 THEN '✅' ELSE '❌' END as status
  FROM public.bulletins_paie
  UNION ALL
  SELECT
    'Months with data',
    COUNT(DISTINCT periode),
    CASE WHEN COUNT(DISTINCT periode) >= 24 THEN '✅' ELSE '❌' END
  FROM public.bulletins_paie
  UNION ALL
  SELECT
    'NULL values (critical columns)',
    COUNT(*),
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '❌' END
  FROM (
    SELECT 1 FROM public.bulletins_paie WHERE employe_id IS NULL
    UNION ALL SELECT 1 FROM public.bulletins_paie WHERE periode IS NULL
    UNION ALL SELECT 1 FROM public.bulletins_paie WHERE salaire_brut IS NULL
    UNION ALL SELECT 1 FROM public.bulletins_paie WHERE salaire_net IS NULL
  ) x
  UNION ALL
  SELECT
    'PAYE calculation errors',
    COUNT(*),
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '❌' END
  FROM (
    SELECT 1 FROM public.bulletins_paie b
    WHERE ABS(b.paye - CASE
      WHEN b.salaire_brut <= 390000 THEN 0
      WHEN b.salaire_brut <= 700000 THEN (b.salaire_brut - 390000) * 0.10
      ELSE (700000 - 390000) * 0.10 + (b.salaire_brut - 700000) * 0.15
    END) > 1
  ) x
  UNION ALL
  SELECT
    'Net salary coherence',
    COUNT(*),
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '❌' END
  FROM (
    SELECT 1 FROM public.bulletins_paie b
    WHERE ABS(b.salaire_net - (b.salaire_brut - b.csg_salarie - b.nsf_salarie - b.paye)) > 1
  ) x
)
SELECT * FROM quality_checks;

-- =============================================================================
-- PART 7: EXPORT VALIDATION (before creating CSV/Excel files)
-- =============================================================================

-- 7.1 Test CSV export format (first 100 records)
SELECT
  b.periode as "Month",
  e.code as "Employee Code",
  (e.prenom || ' ' || e.nom) as "Employee Name",
  ROUND(b.salaire_brut, 2) as "Gross Salary",
  ROUND(b.csg_salarie, 2) as "CSG Deduction",
  ROUND(b.nsf_salarie, 2) as "NSF Deduction",
  ROUND(b.paye, 2) as "PAYE Withheld",
  ROUND(b.salaire_net, 2) as "Net Salary",
  e.bank_account as "Bank Account",
  b.date_paiement as "Payment Date",
  b.statut as "Status"
FROM public.bulletins_paie b
LEFT JOIN public.employes e ON b.employe_id = e.id
ORDER BY b.periode DESC, e.nom
LIMIT 100;
