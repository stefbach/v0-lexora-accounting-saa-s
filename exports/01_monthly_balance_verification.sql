-- ═════════════════════════════════════════════════════════════════════════════
-- MONTHLY BALANCE VERIFICATION TEST
-- ═════════════════════════════════════════════════════════════════════════════
-- Purpose: Verify SUM(debit) = SUM(credit) for each month in past 12 months
-- Expected Output: All months should show BALANCED status
-- Usage: psql [connection] -f 01_monthly_balance_verification.sql

-- Test 1: Monthly balance by journal type
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  ec.journal,
  COUNT(*) AS total_entries,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS balance_difference,
  CASE
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN 'BALANCED'
    ELSE 'UNBALANCED'
  END AS status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.journal
ORDER BY period_month DESC, ec.journal;

-- Test 2: Overall monthly balance (all journals combined)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(*) AS total_entries,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS balance_difference,
  CASE
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN 'BALANCED'
    ELSE 'UNBALANCED'
  END AS status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 3: Identify any unbalanced months
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(*) AS total_entries,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS balance_difference
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
HAVING ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
ORDER BY period_month DESC;
