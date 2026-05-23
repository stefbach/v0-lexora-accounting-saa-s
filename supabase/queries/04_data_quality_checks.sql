-- ═══════════════════════════════════════════════════════════════════════════
-- Query 4: DATA QUALITY AUDIT CHECKS
-- ═══════════════════════════════════════════════════════════════════════════
-- Validates:
--   - Completeness: % of transactions with all required fields
--   - Accuracy: % of transactions matching double-entry principle
--   - Reconciliation: GL balance vs. bank balances
--   - Exceptions: List any unmatched or suspicious entries
--
-- Returns diagnostic data for audit report generation
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. COMPLETENESS CHECK: Missing required fields
WITH completeness_check AS (
  SELECT
    COUNT(*) AS total_transactions,
    COUNT(CASE WHEN date_ecriture IS NULL THEN 1 END) AS missing_date,
    COUNT(CASE WHEN numero_compte IS NULL THEN 1 END) AS missing_account,
    COUNT(CASE WHEN description IS NULL THEN 1 END) AS missing_description,
    COUNT(CASE WHEN journal IS NULL THEN 1 END) AS missing_journal,
    COUNT(CASE WHEN created_by IS NULL THEN 1 END) AS missing_created_by,
    COUNT(CASE WHEN (debit_mur = 0 OR debit_mur IS NULL) AND (credit_mur = 0 OR credit_mur IS NULL) THEN 1 END) AS zero_amount_entries
  FROM public.ecritures_comptables_v2
  WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
),

-- 2. DOUBLE-ENTRY PRINCIPLE: Verify balanced entries
double_entry_check AS (
  SELECT
    COUNT(*) AS total_entries,
    COUNT(CASE WHEN debit_mur > 0 AND credit_mur > 0 THEN 1 END) AS debit_and_credit_both_nonzero,
    COUNT(CASE WHEN (debit_mur > 0 AND credit_mur IS NULL) OR (credit_mur > 0 AND debit_mur IS NULL) THEN 1 END) AS single_sided_entries,
    SUM(COALESCE(debit_mur, 0)) AS total_debits,
    SUM(COALESCE(credit_mur, 0)) AS total_credits,
    ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) AS balance_variance
  FROM public.ecritures_comptables_v2
  WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
),

-- 3. MONTHLY BALANCE CHECKS: Each month should balance
monthly_balance_check AS (
  SELECT
    DATE_TRUNC('month', date_ecriture)::DATE AS month,
    SUM(COALESCE(debit_mur, 0)) AS debits,
    SUM(COALESCE(credit_mur, 0)) AS credits,
    ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) AS variance
  FROM public.ecritures_comptables_v2
  WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', date_ecriture)
  HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
),

-- 4. UNMATCHED TRANSACTIONS: Entries without proper lettrage/matching
unmatched_transactions AS (
  SELECT
    ec.id,
    ec.date_ecriture,
    ec.numero_compte,
    ec.description,
    ec.journal,
    COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0) AS net_amount,
    CASE WHEN l.id IS NULL THEN 'UNMATCHED' ELSE 'MATCHED' END AS match_status,
    COUNT(*) OVER () AS total_unmatched
  FROM public.ecritures_comptables_v2 ec
  LEFT JOIN public.lettrages l ON (
    (ec.id = l.ecriture_1_id OR ec.id = l.ecriture_2_id)
    AND l.statut = 'lettres'
  )
  WHERE
    ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
    AND ec.numero_compte IN ('4210', '4220', '5121', '5122', '5130')
    AND l.id IS NULL
    AND ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) > 0.01
),

-- 5. SUSPICIOUS ENTRIES: Unusual patterns
suspicious_entries AS (
  SELECT
    ec.id,
    ec.date_ecriture,
    ec.numero_compte,
    ec.journal,
    ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) AS amount,
    CASE
      WHEN ec.description IS NULL OR TRIM(ec.description) = '' THEN 'MISSING_DESCRIPTION'
      WHEN ec.ref_folio IS NULL THEN 'MISSING_REF_FOLIO'
      WHEN ABS(COALESCE(ec.debit_mur, 0)) > 1000000 THEN 'LARGE_AMOUNT'
      WHEN ec.created_by IS NULL THEN 'MISSING_AUDIT_CREATOR'
      WHEN ec.created_at > CURRENT_TIMESTAMP - INTERVAL '1 day' AND ec.date_ecriture < CURRENT_DATE - INTERVAL '30 days' THEN 'LATE_ENTRY'
    END AS issue_type
  FROM public.ecritures_comptables_v2 ec
  WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
)

-- FINAL REPORT: Combine all checks
SELECT
  'COMPLETENESS' AS check_type,
  'Total Transactions' AS metric,
  total_transactions::TEXT AS value
FROM completeness_check
UNION ALL
SELECT 'COMPLETENESS', 'Missing Date', missing_date::TEXT FROM completeness_check
UNION ALL
SELECT 'COMPLETENESS', 'Missing Account', missing_account::TEXT FROM completeness_check
UNION ALL
SELECT 'COMPLETENESS', 'Missing Description', missing_description::TEXT FROM completeness_check
UNION ALL
SELECT 'COMPLETENESS', 'Missing Journal', missing_journal::TEXT FROM completeness_check
UNION ALL
SELECT 'COMPLETENESS', 'Zero Amount Entries', zero_amount_entries::TEXT FROM completeness_check
UNION ALL
SELECT 'ACCURACY', 'Total Entries', total_entries::TEXT FROM double_entry_check
UNION ALL
SELECT 'ACCURACY', 'Entries with Both Debit and Credit', debit_and_credit_both_nonzero::TEXT FROM double_entry_check
UNION ALL
SELECT 'ACCURACY', 'Single-Sided Entries', single_sided_entries::TEXT FROM double_entry_check
UNION ALL
SELECT 'ACCURACY', 'Total Debits', ROUND(total_debits::NUMERIC, 2)::TEXT FROM double_entry_check
UNION ALL
SELECT 'ACCURACY', 'Total Credits', ROUND(total_credits::NUMERIC, 2)::TEXT FROM double_entry_check
UNION ALL
SELECT 'ACCURACY', 'Balance Variance (should be 0)', ROUND(balance_variance::NUMERIC, 2)::TEXT FROM double_entry_check
UNION ALL
SELECT 'RECONCILIATION', 'Unbalanced Months', COUNT(*)::TEXT FROM monthly_balance_check
UNION ALL
SELECT 'RECONCILIATION', 'Total Unmatched Receivables/Payables', COUNT(*)::TEXT FROM unmatched_transactions
UNION ALL
SELECT 'EXCEPTIONS', 'Entries with Issues', COUNT(DISTINCT id)::TEXT FROM suspicious_entries
ORDER BY check_type, metric;
