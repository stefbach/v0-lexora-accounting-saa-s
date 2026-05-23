-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 333 — FINANCE EXTRACTION FUNCTIONS FOR BIG 4 AUDIT
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates RPC functions for extracting 12 months of financial data
-- Used by: scripts/finance-extraction-agent.ts
--
-- Functions created:
-- 1. get_general_ledger_12months()
-- 2. get_monthly_trial_balance()
-- 3. get_monthly_summary_reports()
-- 4. get_data_quality_checks()
--
-- These functions are called via Supabase RPC by the extraction agent
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Compat view: plan_comptable_mauricien
-- ───────────────────────────────────────────────────────────────────────────
-- Cette migration a été écrite avant le refactor multi-juridictions (mig 400)
-- qui a remplacé `public.plan_comptable_mauricien` par le canonique
-- `public.chart_of_accounts` indexé par `framework` ('PCM' = Mauricien,
-- 'SYSCOHADA' = OHADA, etc.).
--
-- Pour éviter de réécrire les 6 JOIN ci-dessous (et pour garder les noms de
-- colonnes utilisés par les fonctions RPC), on expose une vue de
-- compatibilité qui redirige vers les comptes du framework PCM avec les
-- alias historiques (`code_compte` ← `account_number`,
-- `nom_compte` ← `label_fr`).
CREATE OR REPLACE VIEW public.plan_comptable_mauricien AS
SELECT
  account_number AS code_compte,
  label_fr       AS nom_compte,
  label_en,
  class_number,
  category,
  framework
FROM public.chart_of_accounts
WHERE framework = 'PCM';

-- ───────────────────────────────────────────────────────────────────────────
-- Function 1: Get General Ledger (12 months)
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_general_ledger_12months();

CREATE OR REPLACE FUNCTION public.get_general_ledger_12months()
RETURNS TABLE (
  date DATE,
  account TEXT,
  debit NUMERIC,
  credit NUMERIC,
  description TEXT,
  journal TEXT,
  ref_folio TEXT,
  created_by TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ,
  fiscal_year TEXT,
  societe_name TEXT,
  account_name TEXT
) AS $$
SELECT
  ec.date_ecriture AS date,
  ec.numero_compte AS account,
  COALESCE(ec.debit_mur, 0) AS debit,
  COALESCE(ec.credit_mur, 0) AS credit,
  ec.description AS description,
  ec.journal AS journal,
  ec.ref_folio AS ref_folio,
  COALESCE(au_creator.email, 'SYSTEM') AS created_by,
  COALESCE(au_approver.email, 'PENDING') AS approved_by,
  ec.created_at AS created_at,
  ec.exercice AS fiscal_year,
  s.nom AS societe_name,
  COALESCE(pcm.nom_compte, 'UNMAPPED') AS account_name
FROM
  public.ecritures_comptables_v2 ec
  LEFT JOIN public.societes s ON ec.societe_id = s.id
  LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  LEFT JOIN public.profiles au_creator ON ec.created_by = au_creator.id
  LEFT JOIN public.profiles au_approver ON ec.approved_by = au_approver.id
WHERE
  ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND ec.date_ecriture < CURRENT_DATE + INTERVAL '1 day'
ORDER BY
  ec.date_ecriture ASC,
  ec.numero_compte ASC,
  ec.id ASC;
$$ LANGUAGE SQL STABLE;

-- ───────────────────────────────────────────────────────────────────────────
-- Function 2: Get Monthly Trial Balance (12 months)
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_monthly_trial_balance();

CREATE OR REPLACE FUNCTION public.get_monthly_trial_balance()
RETURNS TABLE (
  month_end_date DATE,
  account_number TEXT,
  account_name TEXT,
  debit_balance NUMERIC,
  credit_balance NUMERIC,
  balance NUMERIC
) AS $$
WITH monthly_dates AS (
  SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day' AS month_end
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '10 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '9 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '8 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '7 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '4 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
  UNION ALL SELECT DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
),
account_list AS (
  SELECT DISTINCT ec.numero_compte, pcm.nom_compte
  FROM public.ecritures_comptables_v2 ec
  LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  UNION
  SELECT code_compte, nom_compte FROM public.plan_comptable_mauricien
  WHERE code_compte IS NOT NULL
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
  WHERE al.numero_compte IS NOT NULL
  GROUP BY md.month_end, al.numero_compte, al.nom_compte
)
SELECT
  month_end_date,
  account_number,
  account_name,
  debit_balance,
  credit_balance,
  (debit_balance - credit_balance)::NUMERIC AS balance
FROM monthly_balances
WHERE debit_balance > 0 OR credit_balance > 0
ORDER BY month_end_date ASC, account_number ASC;
$$ LANGUAGE SQL STABLE;

-- ───────────────────────────────────────────────────────────────────────────
-- Function 3: Get Monthly Summary Reports
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_monthly_summary_reports();

CREATE OR REPLACE FUNCTION public.get_monthly_summary_reports()
RETURNS TABLE (
  month_label TEXT,
  category TEXT,
  numero_compte TEXT,
  nom_compte TEXT,
  total_amount NUMERIC,
  contra_amount NUMERIC,
  net_amount NUMERIC
) AS $$
WITH monthly_dates AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY d) - 1 AS month_offset,
    DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE AS month_start,
    (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS month_end,
    TO_CHAR(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months' + d * INTERVAL '1 month')::DATE, 'YYYY-MM') AS month_label
  FROM GENERATE_SERIES(0, 11) AS d
),
revenue_accounts AS (
  SELECT
    md.month_label,
    'REVENUE'::TEXT AS category,
    ec.numero_compte,
    pcm.nom_compte,
    COALESCE(SUM(ec.credit_mur), 0) AS total_amount,
    COALESCE(SUM(ec.debit_mur), 0) AS contra_amount
  FROM monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= md.month_start
    AND ec.date_ecriture <= md.month_end
    AND (ec.numero_compte LIKE '706%' OR ec.numero_compte LIKE '707%' OR ec.numero_compte LIKE '708%')
  GROUP BY md.month_label, ec.numero_compte, pcm.nom_compte
),
expense_accounts AS (
  SELECT
    md.month_label,
    'EXPENSE'::TEXT AS category,
    ec.numero_compte,
    pcm.nom_compte,
    COALESCE(SUM(ec.debit_mur), 0) AS total_amount,
    COALESCE(SUM(ec.credit_mur), 0) AS contra_amount
  FROM monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= md.month_start
    AND ec.date_ecriture <= md.month_end
    AND ec.numero_compte LIKE '6%'
  GROUP BY md.month_label, ec.numero_compte, pcm.nom_compte
),
asset_liability_accounts AS (
  SELECT
    md.month_label,
    CASE
      WHEN ec.numero_compte LIKE '1%' OR ec.numero_compte LIKE '2%' OR ec.numero_compte LIKE '3%' THEN 'ASSETS'
      WHEN ec.numero_compte LIKE '4%' THEN 'LIABILITIES'
      WHEN ec.numero_compte LIKE '5%' THEN 'EQUITY'
      ELSE 'OTHER'
    END AS category,
    ec.numero_compte,
    pcm.nom_compte,
    (COALESCE(SUM(ec.debit_mur), 0) - COALESCE(SUM(ec.credit_mur), 0))::NUMERIC AS balance,
    0::NUMERIC AS contra_amount
  FROM monthly_dates md
    CROSS JOIN public.ecritures_comptables_v2 ec
    LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
  WHERE
    ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
    AND ec.date_ecriture <= md.month_end
    AND (ec.numero_compte LIKE '1%' OR ec.numero_compte LIKE '2%' OR ec.numero_compte LIKE '3%' OR ec.numero_compte LIKE '4%' OR ec.numero_compte LIKE '5%')
  GROUP BY md.month_label, ec.numero_compte, pcm.nom_compte
)
SELECT
  month_label,
  category,
  numero_compte,
  nom_compte,
  total_amount,
  contra_amount,
  (total_amount - contra_amount)::NUMERIC AS net_amount
FROM (
  SELECT month_label, category, numero_compte, nom_compte, total_amount, contra_amount FROM revenue_accounts
  UNION ALL
  SELECT month_label, category, numero_compte, nom_compte, total_amount, contra_amount FROM expense_accounts
  UNION ALL
  SELECT month_label, category, numero_compte, nom_compte, balance, 0 FROM asset_liability_accounts
) summary
ORDER BY month_label ASC, category ASC, numero_compte ASC;
$$ LANGUAGE SQL STABLE;

-- ───────────────────────────────────────────────────────────────────────────
-- Function 4: Get Data Quality Checks
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_data_quality_checks();

CREATE OR REPLACE FUNCTION public.get_data_quality_checks()
RETURNS TABLE (
  check_type TEXT,
  metric TEXT,
  value TEXT
) AS $$
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
monthly_balance_check AS (
  SELECT COUNT(*) AS unbalanced_count
  FROM (
    SELECT DATE_TRUNC('month', date_ecriture)::DATE AS month
    FROM public.ecritures_comptables_v2
    WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', date_ecriture)
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  ) t
),
unmatched_count AS (
  SELECT COUNT(*) AS total_unmatched
  FROM (
    SELECT ec.id
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
  ) t
),
suspicious_count AS (
  SELECT COUNT(DISTINCT id) AS total_suspicious
  FROM (
    SELECT ec.id
    FROM public.ecritures_comptables_v2 ec
    WHERE date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
    AND (
      ec.description IS NULL
      OR TRIM(ec.description) = ''
      OR ec.ref_folio IS NULL
      OR ABS(COALESCE(ec.debit_mur, 0)) > 1000000
      OR ec.created_by IS NULL
    )
  ) t
)
SELECT 'COMPLETENESS'::TEXT, 'Total Transactions'::TEXT, cc.total_transactions::TEXT
FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Missing Date', cc.missing_date::TEXT FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Missing Account', cc.missing_account::TEXT FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Missing Description', cc.missing_description::TEXT FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Missing Journal', cc.missing_journal::TEXT FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Missing Created By', cc.missing_created_by::TEXT FROM completeness_check cc
UNION ALL SELECT 'COMPLETENESS', 'Zero Amount Entries', cc.zero_amount_entries::TEXT FROM completeness_check cc
UNION ALL SELECT 'ACCURACY', 'Total Entries', dec.total_entries::TEXT FROM double_entry_check dec
UNION ALL SELECT 'ACCURACY', 'Debit and Credit Both Nonzero', dec.debit_and_credit_both_nonzero::TEXT FROM double_entry_check dec
UNION ALL SELECT 'ACCURACY', 'Single-Sided Entries', dec.single_sided_entries::TEXT FROM double_entry_check dec
UNION ALL SELECT 'ACCURACY', 'Total Debits', ROUND(dec.total_debits::NUMERIC, 2)::TEXT FROM double_entry_check dec
UNION ALL SELECT 'ACCURACY', 'Total Credits', ROUND(dec.total_credits::NUMERIC, 2)::TEXT FROM double_entry_check dec
UNION ALL SELECT 'ACCURACY', 'Balance Variance (should be 0)', ROUND(dec.balance_variance::NUMERIC, 2)::TEXT FROM double_entry_check dec
UNION ALL SELECT 'RECONCILIATION', 'Unbalanced Months', mbc.unbalanced_count::TEXT FROM monthly_balance_check mbc
UNION ALL SELECT 'RECONCILIATION', 'Unmatched Receivables/Payables', uc.total_unmatched::TEXT FROM unmatched_count uc
UNION ALL SELECT 'EXCEPTIONS', 'Entries with Issues', sc.total_suspicious::TEXT FROM suspicious_count sc;
$$ LANGUAGE SQL STABLE;

COMMIT;
