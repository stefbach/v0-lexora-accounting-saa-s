-- ═════════════════════════════════════════════════════════════════════════════
-- ACCOUNT RECONCILIATION TEST
-- ═════════════════════════════════════════════════════════════════════════════
-- Purpose: Verify all GL accounts reconcile with opening and closing balances
-- Expected Output: 100% reconciliation (0 unreconciled accounts)
-- Usage: psql [connection] -f 03_account_reconciliation.sql

-- Test 1: Trial Balance with Opening/Closing balances by account
SELECT
  ec.numero_compte,
  pcm.nom_compte,
  pcm.type_compte,
  COUNT(*) AS transaction_count,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS account_balance,
  MIN(ec.date_ecriture) AS first_entry_date,
  MAX(ec.date_ecriture) AS last_entry_date,
  CASE
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN 'RECONCILED'
    ELSE 'UNRECONCILED'
  END AS reconciliation_status
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ec.numero_compte, pcm.nom_compte, pcm.type_compte
ORDER BY ec.numero_compte;

-- Test 2: Find unreconciled accounts (tolerance = 0.01 MUR)
SELECT
  ec.numero_compte,
  pcm.nom_compte,
  pcm.type_compte,
  COUNT(*) AS transaction_count,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debit,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credit,
  ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS unreconciled_balance
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ec.numero_compte, pcm.nom_compte, pcm.type_compte
HAVING ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) > 0.01
ORDER BY ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) DESC;

-- Test 3: Monthly reconciliation by account (opening balance, movements, closing balance)
WITH monthly_summary AS (
  SELECT
    DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
    ec.numero_compte,
    pcm.nom_comte,
    SUM(COALESCE(ec.debit_mur, 0)) AS month_debit,
    SUM(COALESCE(ec.credit_mur, 0)) AS month_credit,
    SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)) AS month_movement
  FROM public.ecritures_comptables_v2 ec
  LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.numero_compte, pcm.nom_compte
)
SELECT
  periodo_month,
  numero_compte,
  nom_compte,
  ROUND(month_debit::numeric, 2) AS month_debit,
  ROUND(month_credit::numeric, 2) AS month_credit,
  ROUND(month_movement::numeric, 2) AS month_movement
FROM monthly_summary
ORDER BY periodo_month DESC, numero_compte;

-- Test 4: Account reconciliation summary by account type
SELECT
  pcm.type_compte,
  COUNT(DISTINCT ec.numero_compte) AS account_count,
  COUNT(CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
       THEN 1 END) AS reconciled_accounts,
  COUNT(CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
       THEN 1 END) AS unreconciled_accounts,
  ROUND((COUNT(CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
       THEN 1 END) * 100.0 / COUNT(DISTINCT ec.numero_compte))::numeric, 2) AS pct_reconciled
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY pcm.type_compte
ORDER BY pct_reconciled DESC;

-- Test 5: Account balance reconciliation with ledger subledger accounts
SELECT
  ec.numero_compte,
  pcm.nom_compte,
  ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS gl_balance,
  -- This would connect to bank balances, AP subledgers, AR subledgers, etc.
  -- Add specific reconciliations for key accounts:
  CASE
    WHEN ec.numero_compte LIKE '51%' THEN 'BANK ACCOUNT - Requires bank statement reconciliation'
    WHEN ec.numero_compte LIKE '40%' THEN 'SUPPLIER PAYABLE - Requires AP subledger reconciliation'
    WHEN ec.numero_compte LIKE '41%' THEN 'CUSTOMER RECEIVABLE - Requires AR subledger reconciliation'
    WHEN ec.numero_compte LIKE '42%' THEN 'PERSONNEL PAYABLE - Requires payroll reconciliation'
    WHEN ec.numero_compte LIKE '48%' THEN 'SUSPENSE ACCOUNT - Requires clearing'
    ELSE 'GENERAL LEDGER - Requires verification'
  END AS reconciliation_type
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ec.numero_compte, pcm.nom_compte
HAVING ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) > 0.01
ORDER BY ec.numero_compte;

-- Test 6: Overall reconciliation status
SELECT
  COUNT(DISTINCT ec.numero_compte) AS total_accounts,
  COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN ec.numero_compte END) AS reconciled_accounts,
  COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
    THEN ec.numero_compte END) AS unreconciled_accounts,
  ROUND((COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01
    THEN ec.numero_compte END) * 100.0 / COUNT(DISTINCT ec.numero_compte))::numeric, 2)
    AS pct_reconciled,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
      THEN ec.numero_compte END) = 0
    THEN 'PASS: 100% Account Reconciliation Achieved'
    ELSE 'FAIL: ' || COUNT(DISTINCT CASE WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) >= 0.01
      THEN ec.numero_compte END) || ' accounts unreconciled'
  END AS reconciliation_result
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY (SELECT 1);
