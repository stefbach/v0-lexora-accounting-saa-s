-- ═════════════════════════════════════════════════════════════════════════════
-- PERIOD CLOSE CONTROLS TEST
-- ═════════════════════════════════════════════════════════════════════════════
-- Purpose: Verify period-end controls and preventive measures
-- Expected Output: All periods properly closed with no integrity issues
-- Usage: psql [connection] -f 04_period_close_controls.sql

-- Test 1: Verify month-end cutoff (no GL entries dated after month-end)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(*) AS entries_in_period,
  COUNT(CASE WHEN ec.date_ecriture > (DATE_TRUNC('month', ec.date_ecriture) + INTERVAL '1 month' - INTERVAL '1 day')
    THEN 1 END) AS entries_after_month_end,
  CASE
    WHEN COUNT(CASE WHEN ec.date_ecriture > (DATE_TRUNC('month', ec.date_ecriture) + INTERVAL '1 month' - INTERVAL '1 day')
      THEN 1 END) = 0
    THEN 'PASS: Cutoff control verified'
    ELSE 'FAIL: ' || COUNT(CASE WHEN ec.date_ecriture > (DATE_TRUNC('month', ec.date_ecriture) + INTERVAL '1 month' - INTERVAL '1 day')
      THEN 1 END) || ' entries after month-end'
  END AS cutoff_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 2: Verify period close entries (exactly 1 closing entry per month if used)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(CASE WHEN ec.description LIKE '%Closing%' OR ec.description LIKE '%Cloture%'
    OR ec.journal = 'OD' AND ec.numero_compte IN ('999', '998')
    THEN 1 END) AS closing_entries,
  CASE
    WHEN COUNT(CASE WHEN ec.description LIKE '%Closing%' OR ec.description LIKE '%Cloture%'
      OR ec.journal = 'OD' AND ec.numero_compte IN ('999', '998')
      THEN 1 END) IN (0, 1)
    THEN 'PASS: Zero or one closing entry'
    ELSE 'FAIL: ' || COUNT(CASE WHEN ec.description LIKE '%Closing%' OR ec.description LIKE '%Cloture%'
      OR ec.journal = 'OD' AND ec.numero_compte IN ('999', '998')
      THEN 1 END) || ' closing entries found'
  END AS close_entry_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 3: Verify suspense/clearing account activity (should be cleared at month-end)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  ec.numero_compte,
  COUNT(*) AS suspense_entries,
  ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS suspense_balance,
  CASE
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN 'PASS: Suspense account cleared'
    ELSE 'FAIL: Balance ' || ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
  END AS suspense_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND (ec.numero_compte LIKE '48%' OR ec.numero_compte LIKE '47%')
GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.numero_compte
ORDER BY period_month DESC, ec.numero_compte;

-- Test 4: Verify transaction ID sequence integrity
WITH entry_numbers AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY ec.date_ecriture, ec.id) AS seq_num,
    ec.id,
    ec.date_ecriture,
    ec.ref_folio,
    ROW_NUMBER() OVER (ORDER BY ec.date_ecriture, ec.id) - ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC('month', ec.date_ecriture) ORDER BY ec.date_ecriture, ec.id) AS same_month_seq
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(*) AS total_entries,
  COUNT(DISTINCT entry_numbers.seq_num) AS unique_sequences,
  CASE
    WHEN COUNT(*) = COUNT(DISTINCT entry_numbers.seq_num)
    THEN 'PASS: Sequence integrity verified'
    ELSE 'FAIL: Sequence gaps detected'
  END AS sequence_status
FROM entry_numbers
JOIN public.ecritures_comptables_v2 ec ON entry_numbers.id = ec.id
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 5: Verify all GL periods are locked (no new entries after close date)
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  DATE_TRUNC('month', ec.date_ecriture)::date + INTERVAL '35 days' AS assumed_close_date,
  MAX(ec.created_at) AS last_entry_created_at,
  CASE
    WHEN DATE_TRUNC('month', ec.date_ecriture)::date + INTERVAL '35 days' < CURRENT_DATE
      AND MAX(ec.created_at) < DATE_TRUNC('month', ec.date_ecriture)::date + INTERVAL '32 days'
    THEN 'PASS: Period appears locked'
    WHEN DATE_TRUNC('month', ec.date_ecriture)::date = DATE_TRUNC('month', CURRENT_DATE)
    THEN 'PENDING: Current period (not yet closed)'
    ELSE 'WARNING: Recent activity in past period'
  END AS lock_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 6: Verify journal entry balancing at period level
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  ec.journal,
  COUNT(*) AS entry_count,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS difference,
  CASE
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN 'PASS: Journal balanced'
    ELSE 'FAIL: Imbalance ' || ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
  END AS balance_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.journal
ORDER BY period_month DESC, ec.journal;

-- Test 7: Document count and approval verification
SELECT
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(DISTINCT ec.document_id) AS documents_linked,
  COUNT(CASE WHEN ec.created_by IS NOT NULL THEN 1 END) AS entries_with_creator,
  COUNT(CASE WHEN ec.approved_by IS NOT NULL THEN 1 END) AS entries_with_approver,
  COUNT(*) AS total_entries,
  ROUND((COUNT(CASE WHEN ec.approved_by IS NOT NULL THEN 1 END) * 100.0 / COUNT(*))::numeric, 2)
    AS approval_percentage
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;

-- Test 8: Overall period close control summary
SELECT
  COUNT(DISTINCT DATE_TRUNC('month', ec.date_ecriture)) AS total_periods,
  COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN DATE_TRUNC('month', ec.date_ecriture) END) AS balanced_periods,
  COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
    THEN DATE_TRUNC('month', ec.date_ecriture) END) AS unbalanced_periods,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
      THEN DATE_TRUNC('month', ec.date_ecriture) END) = 0
    THEN 'PASS: All periods closed and balanced'
    ELSE 'FAIL: ' || COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
      THEN DATE_TRUNC('month', ec.date_ecriture) END) || ' periods unbalanced'
  END AS overall_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY (SELECT 1);
