# GL CLOSE PROCEDURES TESTING REPORT
**Lexora Accounting SaaS - Financial Close Verification**

**Report Date:** 2026-05-22
**Testing Period:** Past 12 Months
**Database:** ecritures_comptables_v2

---

## EXECUTIVE SUMMARY

This document verifies the General Ledger close procedures for all months in the past 12 months. Each month follows a standardized 6-step close process to ensure data integrity and balance verification.

**Status:** READY FOR TESTING

---

## GL CLOSE PROCESS OVERVIEW

### Standard 6-Step Monthly Close Procedure

1. **Lock GL Entries** - Prevent new postings to closed periods
2. **Run Trial Balance Report** - Generate SUM(debit) and SUM(credit) by account
3. **Verify Balance** - Confirm SUM(debit) = SUM(credit) for the month
4. **Review Suspense Accounts** - Identify and resolve unmatched items
5. **Create Closing Entry** - Generate period-end balancing entry (if needed)
6. **Archive Monthly GL Snapshot** - Store immutable copy of closed month

---

## MONTHLY CLOSE PROCEDURES

### Validation Criteria for Each Month:
- ✓ All GL entries are locked (no new postings allowed)
- ✓ Trial balance generated successfully
- ✓ SUM(debit_mur) = SUM(credit_mur) with tolerance of 0.01 MUR
- ✓ All suspense/clearing accounts reconciled
- ✓ Zero unreconciled GL accounts
- ✓ Monthly GL snapshot archived

---

## TESTING FRAMEWORK

### SQL Query 1: Extract Monthly GL Data with Balance Verification

```sql
-- Extract GL entries for each month with monthly balance check
SELECT 
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  ec.journal,
  COUNT(*) AS total_entries,
  SUM(COALESCE(ec.debit_mur, 0)) AS total_debit,
  SUM(COALESCE(ec.credit_mur, 0)) AS total_credit,
  ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) 
    AS balance_difference,
  CASE 
    WHEN ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) < 0.01 
    THEN 'BALANCED'
    ELSE 'UNBALANCED'
  END AS status
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.journal
ORDER BY period_month DESC, ec.journal;
```

### SQL Query 2: Verify Period Close Status

```sql
-- Check each period for lock status and suspense accounts
SELECT 
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  COUNT(DISTINCT ec.id) AS total_entries,
  COUNT(CASE WHEN ec.numero_compte LIKE '48%' THEN 1 END) AS suspense_entries,
  COUNT(CASE WHEN ec.numero_compte LIKE '47%' THEN 1 END) AS clearing_entries,
  MAX(ec.created_at) AS last_entry_date,
  DATE_TRUNC('month', ec.date_ecriture)::date != CURRENT_DATE::date 
    AND MAX(ec.created_at) < DATE_TRUNC('month', ec.date_ecriture)::date + INTERVAL '32 days'
    AS likely_closed
FROM public.ecritures_comptables_v2 ec
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture)
ORDER BY period_month DESC;
```

### SQL Query 3: Account-Level Reconciliation by Period

```sql
-- Trial balance by account and period for reconciliation
SELECT 
  DATE_TRUNC('month', ec.date_ecriture)::date AS period_month,
  ec.numero_compte,
  pcm.nom_compte,
  SUM(COALESCE(ec.debit_mur, 0)) AS debit_total,
  SUM(COALESCE(ec.credit_mur, 0)) AS credit_total,
  SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)) 
    AS account_balance,
  COUNT(*) AS entry_count
FROM public.ecritures_comptables_v2 ec
LEFT JOIN public.plan_comptable_mauricien pcm 
  ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', ec.date_ecriture), ec.numero_compte, pcm.nom_compte
HAVING ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) > 0.01
ORDER BY period_month DESC, ec.numero_compte;
```

---

## MONTHLY CLOSE CHECKLISTS

### Month: January 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: February 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: March 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: April 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: May 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: June 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: July 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: August 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: September 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: October 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: November 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

### Month: December 2025
- [ ] GL entries locked
- [ ] Trial balance extracted
- [ ] Balance verification: SUM(debit) = SUM(credit)
- [ ] Suspense accounts reviewed
- [ ] Closing entry created (if needed)
- [ ] Monthly snapshot archived
- **Status:** PENDING

---

## CLOSE PROCEDURE DOCUMENTATION

### Step 1: Lock GL Entries
**Objective:** Prevent new postings to closed periods

```sql
-- Before closing: Verify no entries exist after period end
-- After closing: Flag period as closed in metadata table
UPDATE period_close_status 
SET is_locked = true, locked_at = NOW()
WHERE period = '2025-01'
AND EXISTS (SELECT 1 FROM ecritures_comptables_v2 
            WHERE DATE_TRUNC('month', date_ecriture) = '2025-01-01'
            AND created_at < NOW() - INTERVAL '1 day');
```

### Step 2: Run Trial Balance Report
**Objective:** Generate balance verification report

```sql
-- Generate trial balance for the period
CREATE TEMP TABLE tb_period AS
SELECT 
  ec.numero_compte,
  pcm.nom_compte,
  SUM(COALESCE(ec.debit_mur, 0)) AS total_debit,
  SUM(COALESCE(ec.credit_mur, 0)) AS total_credit
FROM ecritures_comptables_v2 ec
LEFT JOIN plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE DATE_TRUNC('month', ec.date_ecriture) = '2025-01-01'
GROUP BY ec.numero_compte, pcm.nom_compte;
```

### Step 3: Verify SUM(debit) = SUM(credit)
**Objective:** Confirm balance with 0.01 MUR tolerance

```sql
-- Verify total balance
SELECT 
  SUM(total_debit) AS total_debit,
  SUM(total_credit) AS total_credit,
  ABS(SUM(total_debit) - SUM(total_credit)) AS difference,
  CASE WHEN ABS(SUM(total_debit) - SUM(total_credit)) < 0.01 
       THEN 'BALANCED' 
       ELSE 'UNBALANCED' 
  END AS status
FROM tb_period;
```

### Step 4: Review Suspense Accounts
**Objective:** Identify and resolve unmatched items

```sql
-- Check suspense (48xx) and clearing (47xx) accounts
SELECT 
  numero_compte,
  SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS balance,
  description
FROM ecritures_comptables_v2
WHERE DATE_TRUNC('month', date_ecriture) = '2025-01-01'
AND (numero_compte LIKE '48%' OR numero_compte LIKE '47%')
GROUP BY numero_compte, description
HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01;
```

### Step 5: Create Closing Entry (If Needed)
**Objective:** Generate period-end balancing entry

```sql
-- Insert closing entry if balance difference exists
-- Debit: Account 999 (Income Summary)
-- Credit: Account 998 (Retained Earnings) or vice versa
INSERT INTO ecritures_comptables_v2 
  (societe_id, date_ecriture, numero_compte, description, 
   debit_mur, credit_mur, journal, exercice)
VALUES 
  (?, DATE_TRUNC('month', ?) + INTERVAL '1 month' - INTERVAL '1 day',
   '999', 'Closing Entry - Income Summary', ?, 0, 'OD', '2024-2025')
ON CONFLICT DO NOTHING;
```

### Step 6: Archive Monthly GL Snapshot
**Objective:** Store immutable copy of closed month

```sql
-- Create monthly snapshot table
CREATE TABLE IF NOT EXISTS gl_monthly_snapshots (
  period_month DATE,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (period_month)
);

-- Archive monthly GL
INSERT INTO gl_monthly_snapshots (period_month, snapshot_data)
SELECT 
  DATE_TRUNC('month', ec.date_ecriture)::date,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'id', ec.id,
      'date', ec.date_ecriture,
      'account', ec.numero_compte,
      'debit', ec.debit_mur,
      'credit', ec.credit_mur,
      'journal', ec.journal,
      'description', ec.description
    )
  )
FROM ecritures_comptables_v2 ec
WHERE DATE_TRUNC('month', ec.date_ecriture) = '2025-01-01'
GROUP BY DATE_TRUNC('month', ec.date_ecriture);
```

---

## UNRECONCILED ACCOUNTS VERIFICATION

**Query to find unreconciled GL accounts:**

```sql
SELECT 
  ec.numero_compte,
  pcm.nom_compte,
  DATE_TRUNC('month', ec.date_ecriture)::date AS period,
  SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0)) 
    AS unreconciled_balance,
  COUNT(*) AS entry_count,
  MAX(ec.date_ecriture) AS last_entry_date
FROM ecritures_comptables_v2 ec
LEFT JOIN plan_comptable_mauricien pcm ON ec.numero_compte = pcm.code_compte
WHERE ec.date_ecriture >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ec.numero_compte, pcm.nom_compte, DATE_TRUNC('month', ec.date_ecriture)
HAVING ABS(SUM(COALESCE(ec.debit_mur, 0)) - SUM(COALESCE(ec.credit_mur, 0))) > 0.01
ORDER BY period DESC, unreconciled_balance DESC;
```

**Expected Result:** 0 rows (all accounts should be reconciled)

---

## SUCCESS CRITERIA

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All 12 months GL close documented | PENDING | Checklists completed above |
| Zero unbalanced GL entries | PENDING | Query 1 results |
| 100% account reconciliation | PENDING | Reconciliation query results |
| All period close controls working | PENDING | Query 2 results |
| Ready for auditor walkthrough | PENDING | Complete testing |

---

## NEXT STEPS

1. Execute all SQL queries against the production database
2. Document results in corresponding CSV/XLSX exports
3. Verify each month closes properly using 6-step procedure
4. Generate trial balance reports for all 12 months
5. Complete reconciliation for all GL accounts
6. Create final summary report for audit

---

**Report Prepared By:** Finance + Tech Team  
**Date:** 2026-05-22  
**Approval Status:** AWAITING EXECUTION  
