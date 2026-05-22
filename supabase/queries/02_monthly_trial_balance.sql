-- ═══════════════════════════════════════════════════════════════════════════
-- Query 2: MONTHLY TRIAL BALANCE (12 months)
-- ═══════════════════════════════════════════════════════════════════════════
-- Extracts account balances for month-end close (last day of each month)
-- Format: CSV with columns: month_end_date, account_number, account_name, debit_balance, credit_balance
-- Includes: Opening balances, closing balances, movements
-- Validation: Each month should balance to 0.00 (SUM(debit_balance) = SUM(credit_balance))
--
-- Usage:
--   psql [connection] -c "COPY ($(cat 02_monthly_trial_balance.sql)) TO STDOUT CSV HEADER;"
-- ═══════════════════════════════════════════════════════════════════════════

WITH monthly_dates AS (
  -- Generate last day of each month for past 12 months
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day' AS month_end
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '10 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '9 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '8 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '7 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '4 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
),
account_list AS (
  -- Get all unique accounts from ecritures in past 12 months
  SELECT DISTINCT ec.numero_compte, pcm.nom_compte
  FROM public.ecritures_comptables_v2 ec
  LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  UNION
  -- Also include all accounts from chart of accounts
  SELECT code_compte, nom_compte FROM public.plan_comptable_mauricien
),
monthly_balances AS (
  SELECT
    md.month_end::DATE AS month_end_date,
    al.numero_compte AS account_number,
    al.nom_compte AS account_name,
    COALESCE(SUM(CASE WHEN ec.date_ecriture <= md.month_end AND ec.debit_mur > 0 THEN ec.debit_mur ELSE 0 END), 0) AS debit_balance,
    COALESCE(SUM(CASE WHEN ec.date_ecriture <= md.month_end AND ec.credit_mur > 0 THEN ec.credit_mur ELSE 0 END), 0) AS credit_balance
  FROM
    monthly_dates md
    CROSS JOIN account_list al
    LEFT JOIN public.ecritures_comptables_v2 ec ON al.numero_compte = ec.numero_compte
      AND ec.date_ecriture <= md.month_end
      AND ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY
    md.month_end,
    al.numero_compte,
    al.nom_compte
)
SELECT
  month_end_date,
  account_number,
  account_name,
  debit_balance,
  credit_balance,
  (debit_balance - credit_balance) AS balance
FROM
  monthly_balances
WHERE
  debit_balance > 0 OR credit_balance > 0
ORDER BY
  month_end_date ASC,
  account_number ASC;
