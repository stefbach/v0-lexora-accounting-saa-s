-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5 TASK 5A: PRE-AUDIT DATA INTEGRITY VERIFICATION
-- COMPREHENSIVE SQL AUDIT QUERIES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This file contains all SQL queries needed for pre-audit verification
-- Run queries individually or in sequence to generate audit evidence
--
-- Success Criteria:
-- ✓ GL balanced to ±0.01 MUR (all queries return 0 or pass)
-- ✓ 100% data completeness (completeness = 100%)
-- ✓ 0 orphaned records (all orphan queries return 0 rows)
-- ✓ All anomalies documented (review anomaly reports)
-- ✓ Data retention compliant (all periods covered)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 1: GL BALANCE VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Q1.1: OVERALL GL BALANCE CHECK
-- Expected: total_debits = total_credits (or ±0.01)
SELECT
  societe_id,
  COUNT(*) AS total_entries,
  SUM(debit_mur) AS total_debits,
  SUM(credit_mur) AS total_credits,
  ABS(SUM(debit_mur) - SUM(credit_mur)) AS difference,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) <= 0.01 THEN 'BALANCED'
    ELSE 'IMBALANCED - INVESTIGATE'
  END AS status,
  MIN(date_ecriture) AS first_entry,
  MAX(date_ecriture) AS last_entry
FROM public.ecritures_comptables_v2
GROUP BY societe_id
ORDER BY difference DESC;

-- Q1.2: IMBALANCED ACCOUNTS
-- Expected: empty result set (no imbalanced accounts)
SELECT
  societe_id,
  numero_compte,
  nom_compte,
  COUNT(*) AS entry_count,
  SUM(debit_mur) AS total_debits,
  SUM(credit_mur) AS total_credits,
  ABS(SUM(debit_mur) - SUM(credit_mur)) AS imbalance,
  CASE
    WHEN SUM(debit_mur) > SUM(credit_mur) THEN 'DEBIT EXCESS'
    WHEN SUM(credit_mur) > SUM(debit_mur) THEN 'CREDIT EXCESS'
  END AS imbalance_type
FROM public.ecritures_comptables_v2
GROUP BY societe_id, numero_compte, nom_compte
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
ORDER BY imbalance DESC;

-- Q1.3: GL ENTRIES BY JOURNAL
-- Verify all expected journals are present
SELECT
  societe_id,
  journal,
  COUNT(*) AS entry_count,
  SUM(debit_mur) AS total_debits,
  SUM(credit_mur) AS total_credits,
  MIN(date_ecriture) AS first_date,
  MAX(date_ecriture) AS last_date
FROM public.ecritures_comptables_v2
GROUP BY societe_id, journal
ORDER BY journal;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 2: DATA COMPLETENESS
-- ═══════════════════════════════════════════════════════════════════════════

-- Q2.1: ECRITURES COMPLETENESS
-- Expected: completeness = 100%
SELECT
  societe_id,
  'ecritures_comptables_v2' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN date_ecriture IS NOT NULL THEN 1 END) AS has_date,
  COUNT(CASE WHEN numero_compte IS NOT NULL THEN 1 END) AS has_account,
  COUNT(CASE WHEN journal IS NOT NULL THEN 1 END) AS has_journal,
  COUNT(CASE WHEN debit_mur > 0 OR credit_mur > 0 THEN 1 END) AS has_amount,
  COUNT(CASE WHEN date_ecriture IS NOT NULL AND numero_compte IS NOT NULL AND
             journal IS NOT NULL AND (debit_mur > 0 OR credit_mur > 0)
        THEN 1 END) AS complete_records,
  ROUND(100.0 * COUNT(CASE WHEN date_ecriture IS NOT NULL AND numero_compte IS NOT NULL AND
                            journal IS NOT NULL AND (debit_mur > 0 OR credit_mur > 0) THEN 1 END) /
                COUNT(*), 2) AS completeness_pct
FROM public.ecritures_comptables_v2
GROUP BY societe_id;

-- Q2.2: FACTURES COMPLETENESS
-- Expected: completeness = 100%
SELECT
  societe_id,
  'factures' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN numero IS NOT NULL THEN 1 END) AS has_number,
  COUNT(CASE WHEN date IS NOT NULL THEN 1 END) AS has_date,
  COUNT(CASE WHEN tiers_id IS NOT NULL THEN 1 END) AS has_customer,
  COUNT(CASE WHEN montant_ht > 0 THEN 1 END) AS has_amount,
  COUNT(CASE WHEN statut IS NOT NULL THEN 1 END) AS has_status,
  COUNT(CASE WHEN numero IS NOT NULL AND date IS NOT NULL AND tiers_id IS NOT NULL
             AND montant_ht > 0 AND statut IS NOT NULL THEN 1 END) AS complete_records,
  ROUND(100.0 * COUNT(CASE WHEN numero IS NOT NULL AND date IS NOT NULL AND tiers_id IS NOT NULL
                            AND montant_ht > 0 AND statut IS NOT NULL THEN 1 END) /
                COUNT(*), 2) AS completeness_pct
FROM public.factures
GROUP BY societe_id;

-- Q2.3: BULLETINS_PAIE COMPLETENESS
-- Expected: completeness = 100%
SELECT
  societe_id,
  'bulletins_paie' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN employe_id IS NOT NULL THEN 1 END) AS has_employee,
  COUNT(CASE WHEN mois IS NOT NULL THEN 1 END) AS has_month,
  COUNT(CASE WHEN salaire_brut > 0 THEN 1 END) AS has_gross,
  COUNT(CASE WHEN salaire_net > 0 THEN 1 END) AS has_net,
  COUNT(CASE WHEN paye_employee IS NOT NULL THEN 1 END) AS has_paye,
  COUNT(CASE WHEN employe_id IS NOT NULL AND mois IS NOT NULL AND
             salaire_brut > 0 AND salaire_net > 0 THEN 1 END) AS complete_records,
  ROUND(100.0 * COUNT(CASE WHEN employe_id IS NOT NULL AND mois IS NOT NULL AND
                            salaire_brut > 0 AND salaire_net > 0 THEN 1 END) /
                COUNT(*), 2) AS completeness_pct
FROM public.bulletins_paie
GROUP BY societe_id;

-- Q2.4: COMPTES_BANCAIRES COMPLETENESS
-- Expected: completeness = 100%
SELECT
  societe_id,
  'comptes_bancaires' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN numero_compte IS NOT NULL THEN 1 END) AS has_number,
  COUNT(CASE WHEN compte_comptable IS NOT NULL THEN 1 END) AS has_gl_account,
  COUNT(CASE WHEN banque IS NOT NULL THEN 1 END) AS has_bank,
  COUNT(CASE WHEN devise IS NOT NULL THEN 1 END) AS has_currency,
  COUNT(CASE WHEN numero_compte IS NOT NULL AND compte_comptable IS NOT NULL AND
             banque IS NOT NULL AND devise IS NOT NULL THEN 1 END) AS complete_records,
  ROUND(100.0 * COUNT(CASE WHEN numero_compte IS NOT NULL AND compte_comptable IS NOT NULL AND
                            banque IS NOT NULL AND devise IS NOT NULL THEN 1 END) /
                COUNT(*), 2) AS completeness_pct
FROM public.comptes_bancaires
GROUP BY societe_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 3: DATA ACCURACY - DUPLICATE DETECTION
-- ═══════════════════════════════════════════════════════════════════════════

-- Q3.1: DUPLICATE GL ENTRIES
-- Expected: empty result set (no duplicates)
SELECT
  e1.societe_id,
  e1.date_ecriture,
  e1.numero_compte,
  e1.debit_mur,
  e1.credit_mur,
  COUNT(*) AS duplicate_count,
  STRING_AGG(e1.id::TEXT, ', ') AS entry_ids
FROM public.ecritures_comptables_v2 e1
GROUP BY e1.societe_id, e1.date_ecriture, e1.numero_compte, e1.debit_mur, e1.credit_mur
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Q3.2: DUPLICATE INVOICE NUMBERS (within same societe)
-- Expected: empty result set (no duplicate invoice numbers)
SELECT
  societe_id,
  numero,
  COUNT(*) AS duplicate_count,
  STRING_AGG(id::TEXT, ', ') AS invoice_ids
FROM public.factures
WHERE numero IS NOT NULL
GROUP BY societe_id, numero
HAVING COUNT(*) > 1;

-- Q3.3: DUPLICATE PAYROLL ENTRIES (same employee, same month)
-- Expected: empty result set
SELECT
  societe_id,
  employe_id,
  mois,
  COUNT(*) AS duplicate_count,
  STRING_AGG(id::TEXT, ', ') AS payroll_ids
FROM public.bulletins_paie
GROUP BY societe_id, employe_id, mois
HAVING COUNT(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 4: DATA ACCURACY - ORPHANED RECORDS
-- ═══════════════════════════════════════════════════════════════════════════

-- Q4.1: GL ENTRIES WITHOUT DOCUMENTS (when expected)
-- Expected: Review for validity
SELECT
  COUNT(*) AS count_missing_documents,
  COUNT(CASE WHEN journal NOT IN ('OD', 'SAL') THEN 1 END) AS count_should_have_document
FROM public.ecritures_comptables_v2
WHERE document_id IS NULL;

-- Q4.2: FACTURES WITHOUT GL ENTRIES
-- Expected: empty result set (all invoices posted to GL)
SELECT
  f.id,
  f.numero,
  f.date,
  f.montant_ht + COALESCE(f.montant_tva, 0) AS total_amount,
  f.statut
FROM public.factures f
WHERE f.societe_id = (SELECT id FROM societes LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e
    WHERE e.document_id = f.id
  )
  AND f.statut NOT IN ('cancelled', 'draft')
ORDER BY f.date DESC;

-- Q4.3: INVOICE LINES WITHOUT PARENT INVOICE
-- Expected: empty result set
SELECT
  COUNT(*) AS orphaned_lines
FROM public.factures_lignes fl
WHERE NOT EXISTS (
  SELECT 1 FROM public.factures f
  WHERE f.id = fl.facture_id
);

-- Q4.4: PAYROLL WITHOUT EMPLOYEES
-- Expected: empty result set
SELECT
  COUNT(*) AS orphaned_payroll
FROM public.bulletins_paie bp
WHERE NOT EXISTS (
  SELECT 1 FROM public.employes e
  WHERE e.id = bp.employe_id
);

-- Q4.5: BANK TRANSACTIONS WITHOUT ACCOUNTS
-- Expected: empty result set
SELECT
  COUNT(*) AS orphaned_transactions
FROM public.transactions_bancaires tb
WHERE NOT EXISTS (
  SELECT 1 FROM public.comptes_bancaires cb
  WHERE cb.id = tb.compte_bancaire_id
);

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 5: DATA ACCURACY - BALANCE RECONCILIATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Q5.1: INVOICE BALANCE TO GL POSTING
-- Expected: invoice_total ≈ gl_posting (within 0.01)
SELECT
  f.id,
  f.numero,
  f.montant_ht + COALESCE(f.montant_tva, 0) AS invoice_total,
  COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0) AS gl_posting,
  ABS((f.montant_ht + COALESCE(f.montant_tva, 0)) - COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0)) AS diff
FROM public.factures f
LEFT JOIN public.ecritures_comptables_v2 e ON e.document_id = f.id
GROUP BY f.id, f.numero, f.montant_ht, f.montant_tva
HAVING ABS((f.montant_ht + COALESCE(f.montant_tva, 0)) - COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0)) > 0.01
ORDER BY diff DESC
LIMIT 50;

-- Q5.2: PAYROLL TOTAL TO GL POSTING
-- Expected: payroll_net ≈ gl_posting
SELECT
  bp.id,
  bp.mois,
  bp.salaire_net,
  COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0) AS gl_posting,
  ABS(bp.salaire_net - COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0)) AS diff
FROM public.bulletins_paie bp
LEFT JOIN public.ecritures_comptables_v2 e ON e.document_id = bp.id
GROUP BY bp.id, bp.mois, bp.salaire_net
HAVING ABS(bp.salaire_net - COALESCE(SUM(ABS(e.debit_mur + e.credit_mur)), 0)) > 0.01
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 6: ANOMALY DETECTION
-- ═══════════════════════════════════════════════════════════════════════════

-- Q6.1: HIGH-VALUE GL ENTRIES (> 1,000,000 MUR)
-- Expected: Review for justification
SELECT
  id,
  date_ecriture,
  numero_compte,
  nom_compte,
  GREATEST(debit_mur, credit_mur) AS amount,
  CASE WHEN debit_mur > credit_mur THEN 'DEBIT' ELSE 'CREDIT' END AS type,
  journal,
  description,
  created_at
FROM public.ecritures_comptables_v2
WHERE debit_mur > 1000000 OR credit_mur > 1000000
ORDER BY GREATEST(debit_mur, credit_mur) DESC;

-- Q6.2: GL ENTRIES WITH MISSING DESCRIPTIONS
-- Expected: Review for clarity
SELECT
  societe_id,
  COUNT(*) AS count_missing_description
FROM public.ecritures_comptables_v2
WHERE description IS NULL OR TRIM(description) = ''
GROUP BY societe_id;

-- Q6.3: HIGH-VALUE INVOICES (> 1,000,000 MUR)
-- Expected: Review for justification
SELECT
  id,
  numero,
  date,
  montant_ht + COALESCE(montant_tva, 0) AS total_amount,
  statut,
  created_at
FROM public.factures
WHERE (montant_ht + COALESCE(montant_tva, 0)) > 1000000
ORDER BY total_amount DESC;

-- Q6.4: INVOICES WITH MISSING DESCRIPTIONS
-- Expected: Review for clarity
SELECT
  societe_id,
  COUNT(*) AS count_missing_description
FROM public.factures
WHERE description IS NULL OR TRIM(description) = ''
GROUP BY societe_id;

-- Q6.5: PAYROLL ENTRIES FROM UNUSUAL TIMES (created outside business hours)
-- Expected: Identify unusual entries
SELECT
  id,
  mois,
  employe_id,
  EXTRACT(HOUR FROM created_at) AS created_hour,
  EXTRACT(DOW FROM created_at) AS day_of_week,
  created_at
FROM public.bulletins_paie
WHERE EXTRACT(HOUR FROM created_at) NOT BETWEEN 8 AND 18
   OR EXTRACT(DOW FROM created_at) IN (0, 6)  -- Weekend
ORDER BY created_at DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 7: DATA RETENTION COMPLIANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Q7.1: GL DATA RETENTION (12 months required)
-- Expected: >= 12 months of data
SELECT
  societe_id,
  MIN(date_ecriture) AS first_entry_date,
  MAX(date_ecriture) AS last_entry_date,
  ROUND((CURRENT_DATE - MIN(date_ecriture))::NUMERIC / 30.44, 1) AS months_covered,
  CASE
    WHEN ROUND((CURRENT_DATE - MIN(date_ecriture))::NUMERIC / 30.44, 1) >= 12 THEN 'COMPLIANT'
    ELSE 'NON-COMPLIANT'
  END AS status
FROM public.ecritures_comptables_v2
GROUP BY societe_id;

-- Q7.2: PAYROLL DATA RETENTION (24 months required)
-- Expected: >= 24 months of data
SELECT
  societe_id,
  MIN(mois) AS first_month,
  MAX(mois) AS last_month,
  COUNT(DISTINCT DATE_TRUNC('month', mois::DATE)) AS months_covered,
  CASE
    WHEN COUNT(DISTINCT DATE_TRUNC('month', mois::DATE)) >= 24 THEN 'COMPLIANT'
    ELSE 'NON-COMPLIANT'
  END AS status
FROM public.bulletins_paie
GROUP BY societe_id;

-- Q7.3: INVOICE DATA RETENTION (12 months required)
-- Expected: >= 12 months of data
SELECT
  societe_id,
  MIN(date) AS first_invoice_date,
  MAX(date) AS last_invoice_date,
  ROUND((CURRENT_DATE - MIN(date))::NUMERIC / 30.44, 1) AS months_covered,
  CASE
    WHEN ROUND((CURRENT_DATE - MIN(date))::NUMERIC / 30.44, 1) >= 12 THEN 'COMPLIANT'
    ELSE 'NON-COMPLIANT'
  END AS status
FROM public.factures
GROUP BY societe_id;

-- Q7.4: BANK STATEMENT DATA RETENTION (12 months required)
-- Expected: >= 12 months of data
SELECT
  societe_id,
  MIN(date_fin) AS first_statement_date,
  MAX(date_fin) AS last_statement_date,
  ROUND((CURRENT_DATE - MIN(date_fin))::NUMERIC / 30.44, 1) AS months_covered,
  CASE
    WHEN ROUND((CURRENT_DATE - MIN(date_fin))::NUMERIC / 30.44, 1) >= 12 THEN 'COMPLIANT'
    ELSE 'NON-COMPLIANT'
  END AS status
FROM public.releves_bancaires
GROUP BY societe_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY SET 8: AUDIT SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

-- Q8.1: COMPLETE AUDIT SUMMARY
-- This query provides a snapshot of all key metrics
WITH gl_balance AS (
  SELECT
    societe_id,
    COUNT(*) AS total_entries,
    SUM(debit_mur) AS total_debits,
    SUM(credit_mur) AS total_credits,
    ABS(SUM(debit_mur) - SUM(credit_mur)) AS difference,
    CASE WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) <= 0.01 THEN true ELSE false END AS is_balanced
  FROM public.ecritures_comptables_v2
  GROUP BY societe_id
),
data_quality AS (
  SELECT
    e.societe_id,
    COUNT(DISTINCT CASE WHEN e.date_ecriture IS NULL OR e.numero_compte IS NULL THEN 1 END) AS incomplete_entries,
    COUNT(DISTINCT CASE WHEN f.numero IS NULL OR f.date IS NULL THEN 1 END) AS incomplete_invoices,
    COUNT(DISTINCT CASE WHEN bp.employe_id IS NULL OR bp.mois IS NULL THEN 1 END) AS incomplete_payroll
  FROM public.ecritures_comptables_v2 e
  FULL OUTER JOIN public.factures f ON e.societe_id = f.societe_id
  FULL OUTER JOIN public.bulletins_paie bp ON e.societe_id = bp.societe_id
  GROUP BY e.societe_id
)
SELECT
  gl.societe_id,
  gl.total_entries,
  gl.is_balanced,
  gl.difference,
  dq.incomplete_entries,
  dq.incomplete_invoices,
  dq.incomplete_payroll
FROM gl_balance gl
LEFT JOIN data_quality dq ON gl.societe_id = dq.societe_id;
