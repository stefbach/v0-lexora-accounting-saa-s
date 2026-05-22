-- ═════════════════════════════════════════════════════════════════════════════
-- DOUBLE-ENTRY VERIFICATION TEST
-- ═════════════════════════════════════════════════════════════════════════════
-- Purpose: Verify all GL entries are balanced (debit + credit sum to zero)
-- Expected Output: Count = 0 (zero unbalanced entries)
-- Usage: psql [connection] -f 02_double_entry_verification.sql -o DOUBLE_ENTRY_VERIFICATION.csv

-- Test 1: Find all unbalanced GL entries
SELECT
  ec.id,
  ec.date_ecriture,
  ec.numero_compte,
  pcm.nom_compte,
  ec.description,
  ROUND(COALESCE(ec.debit_mur, 0)::numeric, 2) AS debit,
  ROUND(COALESCE(ec.credit_mur, 0)::numeric, 2) AS credit,
  ROUND(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0), 2) AS imbalance,
  ec.journal,
  ec.ref_folio,
  ec.created_at
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) > 0.01
ORDER BY ec.date_ecriture DESC, ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) DESC;

-- Test 2: Count of unbalanced entries (should be 0)
SELECT
  COUNT(*) AS unbalanced_entry_count,
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: All entries are balanced'
    WHEN COUNT(*) > 0 THEN 'FAIL: ' || COUNT(*) || ' unbalanced entries found'
  END AS test_result
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) > 0.01;

-- Test 3: Detailed analysis by journal
SELECT
  ec.journal,
  COUNT(*) AS unbalanced_count,
  ROUND(SUM(ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS total_imbalance,
  MIN(ec.date_ecriture) AS earliest_date,
  MAX(ec.date_ecriture) AS latest_date
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND ABS(COALESCE(ec.debit_mur, 0) - COALESCE(ec.credit_mur, 0)) > 0.01
GROUP BY ec.journal
ORDER BY unbalanced_count DESC;

-- Test 4: Entries where both debit and credit are non-zero (should have equal amounts)
SELECT
  ec.id,
  ec.date_ecriture,
  ec.numero_compte,
  ec.description,
  ROUND(COALESCE(ec.debit_mur, 0)::numeric, 2) AS debit,
  ROUND(COALESCE(ec.credit_mur, 0)::numeric, 2) AS credit,
  ec.journal
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
  AND COALESCE(ec.debit_mur, 0) > 0
  AND COALESCE(ec.credit_mur, 0) > 0
ORDER BY ec.date_ecriture DESC;

-- Test 5: Summary statistics
SELECT
  COUNT(*) AS total_entries,
  ROUND(SUM(COALESCE(ec.debit_mur, 0))::numeric, 2) AS total_debits,
  ROUND(SUM(COALESCE(ec.credit_mur, 0))::numeric, 2) AS total_credits,
  ROUND(ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)))::numeric, 2)
    AS net_imbalance,
  COUNT(CASE WHEN COALESCE(ec.debit_mur, 0) > 0 AND COALESCE(ec.credit_mur, 0) = 0 THEN 1 END)
    AS debit_only_entries,
  COUNT(CASE WHEN COALESCE(ec.debit_mur, 0) = 0 AND COALESCE(ec.credit_mur, 0) > 0 THEN 1 END)
    AS credit_only_entries,
  COUNT(CASE WHEN COALESCE(ec.debit_mur, 0) > 0 AND COALESCE(ec.credit_mur, 0) > 0 THEN 1 END)
    AS both_debit_credit_entries
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months';
