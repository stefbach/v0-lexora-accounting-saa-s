-- ═════════════════════════════════════════════════════════════════════════════
-- YEAR-END PROCEDURES TEST
-- ═════════════════════════════════════════════════════════════════════════════
-- Purpose: Verify opening balances for new year match closing from prior year
-- Expected Output: Opening balances = Prior year closing balances
-- Usage: psql [connection] -f 05_year_end_procedures.sql

-- Test 1: Verify opening balances for current fiscal year
SELECT
  ec.exercice AS fiscal_year,
  ec.numero_compte,
  pcm.nom_compte,
  MIN(ec.date_ecriture) AS first_entry_date,
  ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS opening_balance_implied
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.exercice = (SELECT DISTINCT exercice FROM public.ecritures_comptables_v2 ORDER BY exercice DESC LIMIT 1)
GROUP BY ec.exercice, ec.numero_compte, pcm.nom_compte
ORDER BY ec.numero_compte;

-- Test 2: Compare opening balances (new year) to prior year closing balances
WITH prior_year_closing AS (
  SELECT
    ec.numero_compte,
    ec.exercice,
    ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
      AS closing_balance
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.exercice = (
    SELECT DISTINCT exercice FROM public.ecritures_comptables_v2
    WHERE exercice < (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
    ORDER BY exercice DESC LIMIT 1
  )
  GROUP BY ec.numero_compte, ec.exercice
),
current_year_opening AS (
  SELECT
    ec.numero_compte,
    ec.exercice,
    ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
      AS opening_balance,
    MIN(ec.date_ecriture) AS first_entry_date
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
  GROUP BY ec.numero_compte, ec.exercice
)
SELECT
  cyo.numero_compte,
  cyo.exercice AS current_year,
  (SELECT exercice FROM prior_year_closing LIMIT 1) AS prior_year,
  COALESCE(pyc.closing_balance, 0) AS prior_year_closing,
  COALESCE(cyo.opening_balance, 0) AS current_year_opening,
  ABS(COALESCE(cyo.opening_balance, 0) - COALESCE(pyc.closing_balance, 0)) AS difference,
  CASE
    WHEN ABS(COALESCE(cyo.opening_balance, 0) - COALESCE(pyc.closing_balance, 0)) < 0.01
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS status
FROM current_year_opening cyo
LEFT JOIN prior_year_closing pyc ON cyo.numero_compte = pyc.numero_compte
ORDER BY cyo.numero_compte;

-- Test 3: Verify no double-posting of opening balances
SELECT
  ec.numero_compte,
  COUNT(CASE WHEN ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%'
    OR ec.description LIKE '%Beginning%' THEN 1 END) AS opening_entries,
  CASE
    WHEN COUNT(CASE WHEN ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%'
      OR ec.description LIKE '%Beginning%' THEN 1 END) <= 1
    THEN 'PASS: No double-posting'
    ELSE 'FAIL: ' || COUNT(CASE WHEN ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%'
      OR ec.description LIKE '%Beginning%' THEN 1 END) || ' opening entries'
  END AS double_post_status
FROM public.ecritures_comptables_v2 ec
WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
GROUP BY ec.numero_compte
HAVING COUNT(CASE WHEN ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%'
  OR ec.description LIKE '%Beginning%' THEN 1 END) > 1
ORDER BY ec.numero_compte;

-- Test 4: Verify opening entry journal and date
SELECT
  ec.id,
  ec.date_ecriture,
  ec.journal,
  ec.numero_compte,
  ec.description,
  COALESCE(ec.debit_mur, 0) AS debit,
  COALESCE(ec.credit_mur, 0) AS credit,
  ec.created_at
FROM public.ecritures_comptables_v2 ec
WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
  AND (ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%'
    OR ec.description LIKE '%Beginning%')
ORDER BY ec.date_ecriture, ec.numero_compte;

-- Test 5: Verify balance brought forward reconciliation
WITH opening_balance_summary AS (
  SELECT
    ec.numero_compte,
    ec.exercice,
    ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
      AS account_balance
  FROM public.ecritures_comptables_v2 ec
  GROUP BY ec.numero_compte, ec.exercice
)
SELECT
  COALESCE(cy.numero_compte, py.numero_compte) AS numero_compte,
  cy.exercice AS current_year,
  py.exercice AS prior_year,
  COALESCE(py.account_balance, 0) AS prior_year_balance,
  COALESCE(cy.account_balance, 0) AS current_year_total_balance,
  CASE
    WHEN py.account_balance IS NULL THEN 'New account in current year'
    WHEN ABS(cy.account_balance - py.account_balance) < 100 THEN 'Reasonable variance'
    ELSE 'Significant change from prior year'
  END AS change_assessment
FROM opening_balance_summary cy
FULL OUTER JOIN opening_balance_summary py
  ON cy.numero_compte = py.numero_compte
WHERE cy.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
  AND py.exercice = (
    SELECT DISTINCT exercice FROM public.ecritures_comptables_v2
    WHERE exercice < (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
    ORDER BY exercice DESC LIMIT 1
  )
ORDER BY COALESCE(cy.numero_compte, py.numero_compte);

-- Test 6: Fiscal year transition verification
SELECT
  (SELECT MAX(exercice) FROM public.ecritures_comptables_v2) AS current_fiscal_year,
  (SELECT MIN(date_ecriture) FROM public.ecritures_comptables_v2
   WHERE exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)) AS first_entry_current_year,
  (SELECT MAX(date_ecriture) FROM public.ecritures_comptables_v2
   WHERE exercice != (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)) AS last_entry_prior_year,
  COUNT(*) AS total_entries_current_year,
  COUNT(DISTINCT ec.numero_compte) AS accounts_in_current_year
FROM public.ecritures_comptables_v2 ec
WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2);

-- Test 7: Year-end reconciliation checklist
SELECT
  'Opening Balances Match' AS check_item,
  COUNT(DISTINCT CASE WHEN ABS(cyo.opening_balance - pyc.closing_balance) < 0.01
    THEN cyo.numero_compte END) AS passed_accounts
FROM (
  SELECT ec.numero_compte, ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2) AS opening_balance
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
  GROUP BY ec.numero_compte
) cyo
LEFT JOIN (
  SELECT ec.numero_compte, ROUND((SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2) AS closing_balance
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.exercice = (SELECT DISTINCT exercice FROM public.ecritures_comptables_v2
    WHERE exercice < (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
    ORDER BY exercice DESC LIMIT 1)
  GROUP BY ec.numero_compte
) pyc ON cyo.numero_compte = pyc.numero_compte

UNION ALL

SELECT
  'No Double Posting',
  COUNT(DISTINCT CASE WHEN opening_count <= 1 THEN numero_compte END)
FROM (
  SELECT
    ec.numero_compte,
    COUNT(CASE WHEN ec.description LIKE '%Opening%' OR ec.description LIKE '%Ouverture%' THEN 1 END) AS opening_count
  FROM public.ecritures_comptables_v2 ec
  WHERE ec.exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2)
  GROUP BY ec.numero_compte
) opening_check

UNION ALL

SELECT
  'Fiscal Year Transition Complete',
  CASE WHEN (SELECT MAX(date_ecriture) FROM public.ecritures_comptables_v2
    WHERE exercice != (SELECT MAX(exercice) FROM public.ecritures_comptables_v2))
    < (SELECT MIN(date_ecriture) FROM public.ecritures_comptables_v2
    WHERE exercice = (SELECT MAX(exercice) FROM public.ecritures_comptables_v2))
    THEN 1 ELSE 0 END
ORDER BY check_item;
