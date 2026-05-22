-- ═══════════════════════════════════════════════════════════════════════════
-- Query 3: MONTHLY SUMMARY REPORTS
-- ═══════════════════════════════════════════════════════════════════════════
-- Generates summary reports for:
--   - Revenue summary (706, 707, 708 accounts)
--   - Expense summary (6xxx accounts)
--   - Asset/liability summary
--
-- Returns data suitable for Excel workbook creation (12 sheets, one per month)
-- Each row includes: month, account, balance, movement, description
--
-- Usage: Run this query and export results, then pivot into Excel with 12 sheets
-- ═══════════════════════════════════════════════════════════════════════════

WITH monthly_dates AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY d) - 1 AS month_offset,
    DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE AS month_start,
    (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS month_end,
    TO_CHAR(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE, 'YYYY-MM') AS month_label
  FROM GENERATE_SERIES(0, 11) AS d
),
revenue_accounts AS (
  -- Revenue accounts: 706 (Sales), 707 (Services), 708 (Other Income)
  SELECT
    md.month_label,
    'REVENUE' AS category,
    ec.numero_compte,
    pcm.nom_compte,
    COALESCE(SUM(ec.credit_mur), 0) AS total_amount,
    COALESCE(SUM(ec.debit_mur), 0) AS contra_amount
  FROM
    monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= md.month_start
    AND ec.date_ecriture <= md.month_end
    AND ec.numero_compte IN ('7061', '7071', '7081', '7062', '7072', '7082')
  GROUP BY
    md.month_label,
    ec.numero_compte,
    pcm.nom_compte
),
expense_accounts AS (
  -- Expense accounts: 6xxx (all operating expenses)
  SELECT
    md.month_label,
    'EXPENSE' AS category,
    ec.numero_compte,
    pcm.nom_compte,
    COALESCE(SUM(ec.debit_mur), 0) AS total_amount,
    COALESCE(SUM(ec.credit_mur), 0) AS contra_amount
  FROM
    monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= md.month_start
    AND ec.date_ecriture <= md.month_end
    AND ec.numero_compte LIKE '6%'
  GROUP BY
    md.month_label,
    ec.numero_compte,
    pcm.nom_compte
),
asset_liability_accounts AS (
  -- Assets (1xxx-3xxx), Liabilities (4xxx), Equity (5xxx)
  SELECT
    md.month_label,
    CASE
      WHEN ec.numero_compte LIKE '1%' OR ec.numero_compte LIKE '2%' OR ec.numero_compte LIKE '3%' THEN 'ASSETS'
      WHEN ec.numero_compte LIKE '4%' THEN 'LIABILITIES'
      WHEN ec.numero_compte LIKE '5%' THEN 'EQUITY'
    END AS category,
    ec.numero_compte,
    pcm.nom_compte,
    COALESCE(SUM(ec.debit_mur), 0) - COALESCE(SUM(ec.credit_mur), 0) AS balance,
    0 AS contra_amount
  FROM
    monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
    AND ec.date_ecriture <= md.month_end
    AND (ec.numero_compte LIKE '1%' OR ec.numero_compte LIKE '2%' OR ec.numero_compte LIKE '3%' OR ec.numero_compte LIKE '4%' OR ec.numero_compte LIKE '5%')
  GROUP BY
    md.month_label,
    ec.numero_compte,
    pcm.nom_compte
)
SELECT
  month_label,
  category,
  numero_compte,
  nom_compte,
  total_amount,
  contra_amount,
  (total_amount - contra_amount) AS net_amount
FROM (
  SELECT month_label, category, numero_compte, nom_compte, total_amount, contra_amount FROM revenue_accounts
  UNION ALL
  SELECT month_label, category, numero_compte, nom_compte, total_amount, contra_amount FROM expense_accounts
  UNION ALL
  SELECT month_label, category, numero_compte, nom_compte, balance, 0 FROM asset_liability_accounts
) summary
ORDER BY
  month_label ASC,
  category ASC,
  numero_compte ASC;
