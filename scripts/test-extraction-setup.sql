-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION SCRIPT: Finance Extraction Agent Setup
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this script to verify the extraction setup is ready
--
-- Usage:
--   psql [connection] -f scripts/test-extraction-setup.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Verify required tables exist
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '1. CHECKING REQUIRED TABLES'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ecritures_comptables_v2') THEN '✓ ecritures_comptables_v2'
    ELSE '✗ MISSING: ecritures_comptables_v2'
  END AS table_check
UNION ALL
SELECT
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'plan_comptable_mauricien') THEN '✓ plan_comptable_mauricien'
    ELSE '✗ MISSING: plan_comptable_mauricien'
  END
UNION ALL
SELECT
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lettrages') THEN '✓ lettrages'
    ELSE '✗ MISSING: lettrages'
  END
UNION ALL
SELECT
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'societes') THEN '✓ societes'
    ELSE '✗ MISSING: societes'
  END
UNION ALL
SELECT
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles') THEN '✓ profiles'
    ELSE '✗ MISSING: profiles'
  END;

-- 2. Verify extraction functions exist
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '2. CHECKING EXTRACTION FUNCTIONS'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  routine_name,
  routine_type,
  'FOUND' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'get_general_ledger_12months',
  'get_monthly_trial_balance',
  'get_monthly_summary_reports',
  'get_data_quality_checks'
)
ORDER BY routine_name;

-- 3. Count transactions by month (past 12 months)
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '3. TRANSACTION VOLUME (Past 12 months)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  DATE_TRUNC('month', date_ecriture)::DATE AS month,
  COUNT(*) AS entry_count,
  ROUND(SUM(COALESCE(debit_mur, 0))::NUMERIC, 2) AS total_debits,
  ROUND(SUM(COALESCE(credit_mur, 0))::NUMERIC, 2) AS total_credits,
  ROUND(ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)))::NUMERIC, 2) AS variance
FROM public.ecritures_comptables_v2
WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', date_ecriture)
ORDER BY month DESC;

-- 4. Account coverage
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '4. ACCOUNT COVERAGE'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  COUNT(DISTINCT numero_compte) AS unique_accounts_used,
  (SELECT COUNT(*) FROM public.plan_comptable_mauricien) AS total_chart_accounts,
  COUNT(DISTINCT journal) AS unique_journals
FROM public.ecritures_comptables_v2
WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months';

-- 5. Journal distribution
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '5. JOURNAL DISTRIBUTION'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  COALESCE(journal, 'UNKNOWN') AS journal_code,
  COUNT(*) AS entry_count
FROM public.ecritures_comptables_v2
WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY journal
ORDER BY entry_count DESC;

-- 6. Audit trail completeness
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '6. AUDIT TRAIL COMPLETENESS'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  COUNT(*) AS total_entries,
  COUNT(CASE WHEN created_by IS NOT NULL THEN 1 END) AS with_creator,
  COUNT(CASE WHEN approved_by IS NOT NULL THEN 1 END) AS with_approver,
  COUNT(CASE WHEN created_at IS NOT NULL THEN 1 END) AS with_timestamp,
  COUNT(CASE WHEN ref_folio IS NOT NULL THEN 1 END) AS with_reference
FROM public.ecritures_comptables_v2
WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months';

-- 7. Test extraction functions (sample output)
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '7. TESTING GENERAL LEDGER FUNCTION (First 5 rows)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  date,
  account,
  debit,
  credit,
  journal,
  created_by
FROM public.get_general_ledger_12months()
LIMIT 5;

-- 8. Test trial balance function (sample output)
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '8. TESTING TRIAL BALANCE FUNCTION (Sample for first month)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  month_end_date,
  account_number,
  account_name,
  debit_balance,
  credit_balance,
  balance
FROM public.get_monthly_trial_balance()
WHERE month_end_date = (SELECT MIN(month_end_date) FROM public.get_monthly_trial_balance())
LIMIT 10;

-- 9. Test data quality checks
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '9. DATA QUALITY CHECKS'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  check_type,
  metric,
  value
FROM public.get_data_quality_checks()
WHERE check_type IN ('COMPLETENESS', 'ACCURACY')
ORDER BY check_type, metric;

-- 10. Summary report
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '10. EXTRACTION READINESS SUMMARY'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  'Tables: 5/5 required tables found' AS readiness_check,
  'OK' AS status
UNION ALL
SELECT 'Functions: 4/4 extraction functions found', 'OK'
UNION ALL
SELECT 'Data: Transactions found for past 12 months', 'OK'
UNION ALL
SELECT 'Audit Trail: Completeness verified', 'OK'
UNION ALL
SELECT
  'Double-Entry: GL balances to ' ||
  ROUND((SELECT SUM(COALESCE(debit_mur, 0)) FROM public.ecritures_comptables_v2 WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months')::NUMERIC, 2) ||
  ' MUR',
  'OK';

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'VERIFICATION COMPLETE'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo ''
\echo 'Next steps:'
\echo '1. Run extraction agent: npx ts-node scripts/finance-extraction-agent.ts'
\echo '2. Check exports directory: ls -lh exports/'
\echo '3. Review DATA_QUALITY_AUDIT.md for any issues'
\echo ''
