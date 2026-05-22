# PHASE 5 TASK 5A: PRE-AUDIT DATA INTEGRITY VERIFICATION
## Execution Guide for Big 4 Auditor Handoff

**Timeline:** Weeks 9-10  
**Effort:** 15 hours  
**Owner:** Tech + Finance  
**Date:** 2026-05-22

---

## MISSION STATEMENT

Final verification of data integrity before Big 4 audit kickoff. This guide provides step-by-step instructions to generate 5 comprehensive audit reports that demonstrate data quality and readiness for auditor CAAT (Computer-Assisted Audit Techniques) import.

---

## DELIVERABLES (5 REPORTS)

| # | Deliverable | Format | Location | Purpose |
|---|---|---|---|---|
| 1 | GL Balance Verification | CSV | `/exports/GL_FINAL_BALANCE_VERIFICATION.csv` | GL debit/credit balance check |
| 2 | Data Completeness | MD | `/exports/DATA_COMPLETENESS_REPORT.md` | Required field coverage analysis |
| 3 | Data Accuracy | MD | `/exports/DATA_ACCURACY_REPORT.md` | Duplicate/orphaned record detection |
| 4 | Anomaly Detection | MD | `/exports/ANOMALY_DETECTION_REPORT.md` | Unusual transaction flagging |
| 5 | Data Retention | MD | `/exports/DATA_RETENTION_COMPLIANCE.md` | 12/24-month compliance verification |

---

## SUCCESS CRITERIA

- ✓ **GL Balanced:** SUM(debit_mur) = SUM(credit_mur) ± 0.01 MUR
- ✓ **100% Completeness:** All required fields populated
- ✓ **0 Orphaned Records:** No FK violations
- ✓ **Anomalies Documented:** All exceptions justified
- ✓ **Data Retention:** 12 months GL, 24 months payroll, 12 months invoices/bank statements

---

## PRE-EXECUTION CHECKLIST

Before running audits, verify:

- [ ] **Database Access:** Supabase credentials configured
  ```bash
  echo $NEXT_PUBLIC_SUPABASE_URL
  echo $SUPABASE_SERVICE_ROLE_KEY
  ```

- [ ] **Node.js Environment:** Dependencies installed
  ```bash
  npm list @supabase/supabase-js
  ```

- [ ] **Export Directory:** Writable `/exports` folder exists
  ```bash
  mkdir -p /home/user/v0-lexora-accounting-saa-s/exports
  ```

- [ ] **Data Snapshot:** Recent GL entries present
  ```sql
  SELECT COUNT(*) FROM public.ecritures_comptables_v2;
  ```

---

## EXECUTION STEPS

### OPTION A: Automated Execution (Recommended)

Run the Node.js script to generate all 5 reports automatically:

```bash
cd /home/user/v0-lexora-accounting-saa-s
node scripts/phase5-audit-integrity-check.mjs
```

**Output:** Console summary + 5 files in `/exports/`

**Typical Runtime:** 2-5 minutes depending on data volume

**Console Output Example:**
```
╔════════════════════════════════════════════════════════════════╗
║     PHASE 5 TASK 5A: PRE-AUDIT DATA INTEGRITY VERIFICATION      ║
║            Timeline: Weeks 9-10  |  Effort: 15 hours           ║
║                 Owner: Tech + Finance                           ║
╚════════════════════════════════════════════════════════════════╝

[1/5] Generating GL Balance Verification Report...
✓ GL Balance Report saved to: /exports/GL_FINAL_BALANCE_VERIFICATION.csv
  Status: PASSED
  Total Debits: 50,234,567.89 MUR
  Total Credits: 50,234,567.89 MUR
  Difference: 0.00 MUR
  Imbalanced Accounts: 0

[2/5] Generating Data Completeness Report...
✓ Data Completeness Report saved to: /exports/DATA_COMPLETENESS_REPORT.md
  ecritures_comptables_v2: 100%
  factures: 99.5%
  bulletins_paie: 100%
  comptes_bancaires: 100%

[3/5] Generating Data Accuracy Report...
✓ Data Accuracy Report saved to: /exports/DATA_ACCURACY_REPORT.md
  Duplicate GL Entries: 0
  Unmatched Invoices: 3

[4/5] Generating Anomaly Detection Report...
✓ Anomaly Detection Report saved to: /exports/ANOMALY_DETECTION_REPORT.md
  High-Value Entries: 5
  Missing Descriptions: 12

[5/5] Generating Data Retention Compliance Report...
✓ Data Retention Report saved to: /exports/DATA_RETENTION_COMPLIANCE.md
  GL: 24 months (PASS)
  Payroll: 36 months (PASS)
  Invoices: 18 months (PASS)
  Bank Statements: 14 months (PASS)

═══════════════════════════════════════════════════════════════
All reports generated and saved to: /exports/
═══════════════════════════════════════════════════════════════
```

---

### OPTION B: Manual SQL Audit (For Detailed Analysis)

Run SQL queries directly in Supabase for deeper investigation:

#### Step 1: GL Balance Check
```sql
-- Run this query to verify GL balance
SELECT
  societe_id,
  COUNT(*) AS total_entries,
  SUM(debit_mur) AS total_debits,
  SUM(credit_mur) AS total_credits,
  ABS(SUM(debit_mur) - SUM(credit_mur)) AS difference,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) <= 0.01 THEN 'BALANCED'
    ELSE 'IMBALANCED - INVESTIGATE'
  END AS status
FROM public.ecritures_comptables_v2
GROUP BY societe_id;
```

**Expected Result:**
- `status` = 'BALANCED'
- `difference` ≤ 0.01

**If IMBALANCED:** Run `Q1.2` in `phase5-audit-queries.sql` to identify problem accounts

#### Step 2: Data Completeness Check
```sql
-- Run for ecritures_comptables_v2
SELECT
  societe_id,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN date_ecriture IS NOT NULL AND numero_compte IS NOT NULL AND
             journal IS NOT NULL AND (debit_mur > 0 OR credit_mur > 0)
        THEN 1 END) AS complete_records,
  ROUND(100.0 * COUNT(CASE WHEN date_ecriture IS NOT NULL AND numero_compte IS NOT NULL AND
                            journal IS NOT NULL AND (debit_mur > 0 OR credit_mur > 0) THEN 1 END) /
                COUNT(*), 2) AS completeness_pct
FROM public.ecritures_comptables_v2
GROUP BY societe_id;
```

**Expected Result:** `completeness_pct` = 100%

**For Other Tables:** See queries Q2.2-Q2.5 in `phase5-audit-queries.sql`

#### Step 3: Duplicate Detection
```sql
-- Check for duplicate GL entries
SELECT
  date_ecriture,
  numero_compte,
  debit_mur,
  credit_mur,
  COUNT(*) AS duplicate_count
FROM public.ecritures_comptables_v2
GROUP BY date_ecriture, numero_compte, debit_mur, credit_mur
HAVING COUNT(*) > 1;
```

**Expected Result:** Empty (no duplicates)

**If Duplicates Found:** Investigate and consolidate

#### Step 4: Orphaned Records
```sql
-- Check for GL entries without documents (when they should have them)
SELECT COUNT(*) AS orphaned_count
FROM public.ecritures_comptables_v2
WHERE document_id IS NULL AND journal NOT IN ('OD', 'SAL');

-- Check for invoices without GL postings
SELECT COUNT(*) AS unmatched_invoices
FROM public.factures f
WHERE NOT EXISTS (
  SELECT 1 FROM public.ecritures_comptables_v2 e
  WHERE e.document_id = f.id
) AND f.statut NOT IN ('cancelled', 'draft');
```

**Expected Result:** 0 (no orphaned records)

#### Step 5: Anomaly Review
```sql
-- High-value transactions
SELECT id, date_ecriture, numero_compte, GREATEST(debit_mur, credit_mur) AS amount
FROM public.ecritures_comptables_v2
WHERE debit_mur > 1000000 OR credit_mur > 1000000
ORDER BY amount DESC;

-- Missing descriptions
SELECT COUNT(*) FROM public.ecritures_comptables_v2
WHERE description IS NULL OR TRIM(description) = '';
```

**Action:** Document business justification for each anomaly

#### Step 6: Data Retention
```sql
-- GL data range
SELECT
  MIN(date_ecriture) AS first_entry,
  MAX(date_ecriture) AS last_entry,
  ROUND((CURRENT_DATE - MIN(date_ecriture))::NUMERIC / 30.44, 1) AS months_covered
FROM public.ecritures_comptables_v2;

-- Payroll data range (24 months required)
SELECT
  MIN(mois) AS first_month,
  MAX(mois) AS last_month,
  COUNT(DISTINCT DATE_TRUNC('month', mois::DATE)) AS months_covered
FROM public.bulletins_paie;
```

**Expected Results:**
- GL: ≥ 12 months
- Payroll: ≥ 24 months
- Invoices: ≥ 12 months
- Bank Statements: ≥ 12 months

---

## REPORT REVIEW GUIDANCE

### Report 1: GL_FINAL_BALANCE_VERIFICATION.csv

**Review Checklist:**
- [ ] `Status` = `BALANCED`
- [ ] `Difference` = 0.00 or ≤ 0.01
- [ ] All accounts in GL are listed
- [ ] No accounts with "IMBALANCED" status

**If Issues Found:**
1. Identify the imbalanced account(s)
2. Run: `SELECT * FROM ecritures_comptables_v2 WHERE numero_compte = 'XXX' ORDER BY date_ecriture`
3. Review entries for data entry errors, corrections, or reversals
4. Document any manual corrections required

---

### Report 2: DATA_COMPLETENESS_REPORT.md

**Review Checklist:**
- [ ] All tables show 100% completeness
- [ ] No missing required fields

**If Issues Found (e.g., 99.5%):**
1. Identify which field is missing (see "Missing Field Breakdown")
2. Sample the incomplete records
3. Decide: Fix data or document as exception

**Example Fix:**
```sql
-- Add missing customer reference
UPDATE public.factures
SET tiers_id = (SELECT id FROM tiers WHERE nom = 'Default Customer')
WHERE tiers_id IS NULL;
```

---

### Report 3: DATA_ACCURACY_REPORT.md

**Review Checklist:**
- [ ] No duplicate GL entries
- [ ] No duplicate invoice numbers
- [ ] All invoices matched to GL
- [ ] Status = "PASSED"

**If Duplicates Found:**
1. Review the duplicate set (same date/account/amount = likely error)
2. Determine which entry is correct
3. Delete or consolidate duplicates

**Example Consolidation:**
```sql
-- Keep only the first occurrence, delete subsequent ones
WITH ranked_duplicates AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY date_ecriture, numero_compte, debit_mur, credit_mur ORDER BY created_at) AS rn
  FROM public.ecritures_comptables_v2
)
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (SELECT id FROM ranked_duplicates WHERE rn > 1);
```

**If Invoices Unmatched:**
1. Review each unmatched invoice
2. Either: Post to GL OR mark as cancelled

---

### Report 4: ANOMALY_DETECTION_REPORT.md

**Review Checklist:**
- [ ] All high-value transactions are documented
- [ ] Business justification provided for each anomaly
- [ ] Missing descriptions have been resolved

**For Each Anomaly:**
1. Note the transaction ID
2. Document business purpose
3. Create entry in `audit_anomalies` table:

```sql
INSERT INTO public.audit_anomalies (
  societe_id, table_name, record_id, anomaly_type, severity,
  amount_mur, created_by, description, justification, status
) VALUES (
  'societe_id',
  'ecritures_comptables_v2',
  'entry_id',
  'high_value',
  'high',
  1500000.00,
  'user_id',
  'Transfer to BNQ for capital injection',
  'Board resolution approved capital increase',
  'justified'
);
```

---

### Report 5: DATA_RETENTION_COMPLIANCE.md

**Review Checklist:**
- [ ] GL: ≥ 12 months ✓
- [ ] Payroll: ≥ 24 months ✓
- [ ] Invoices: ≥ 12 months ✓
- [ ] Bank Statements: ≥ 12 months ✓
- [ ] All data compliant = YES

**If Non-Compliant:**
1. Identify missing period(s)
2. Determine if data was lost or period simply not yet accrued
3. Plan data recovery or document explanation

---

## HANDOFF TO AUDITOR

Once all reports show **PASSED** status:

### Step 1: Package Reports
```bash
cd /exports
tar -czf audit_reports_$(date +%Y%m%d).tar.gz *.csv *.md
```

### Step 2: Generate Audit Summary
Create a cover memo:

```
LEXORA PRE-AUDIT VERIFICATION SUMMARY
Date: 2026-05-22
Societe: [Company Name]
Audit Period: [Date Range from data]

RESULTS:
1. GL Balance Verification: PASSED (SUM debits = SUM credits)
2. Data Completeness: PASSED (100% required fields)
3. Data Accuracy: PASSED (0 duplicates, 0 orphaned records)
4. Anomaly Detection: [X anomalies documented and justified]
5. Data Retention: PASSED (All 12/24-month periods compliant)

DELIVERABLES FOR AUDITOR:
- GL transactions data (ecritures_comptables_v2 export)
- Invoice register (factures export)
- Payroll master (bulletins_paie export)
- Bank statement reconciliation (releves_bancaires export)
- Audit trail log (audit_trail table)
- SOD matrix (sod_matrix table)

CAAT IMPORT READY: YES
Verification completed by: [Your Name]
Tech Lead: [Tech Owner]
Finance Lead: [Finance Owner]
```

### Step 3: Export Data for Auditor Import

```bash
# Export GL data
psql $DATABASE_URL -c "COPY (SELECT * FROM public.ecritures_comptables_v2 ORDER BY date_ecriture) TO STDOUT WITH CSV HEADER" > GL_export_$(date +%Y%m%d).csv

# Export Invoices
psql $DATABASE_URL -c "COPY (SELECT * FROM public.factures ORDER BY date) TO STDOUT WITH CSV HEADER" > INVOICES_export_$(date +%Y%m%d).csv

# Export Payroll
psql $DATABASE_URL -c "COPY (SELECT * FROM public.bulletins_paie ORDER BY mois) TO STDOUT WITH CSV HEADER" > PAYROLL_export_$(date +%Y%m%d).csv

# Export Bank Statements
psql $DATABASE_URL -c "COPY (SELECT * FROM public.releves_bancaires ORDER BY date_fin) TO STDOUT WITH CSV HEADER" > BANKSTATEMENTS_export_$(date +%Y%m%d).csv
```

### Step 4: Deliver Package
Provide auditor with:
- [ ] 5 audit reports (CSV/MD files)
- [ ] Data exports (CSV format, ready for CAAT software)
- [ ] Audit summary memo
- [ ] Verification sign-off sheet
- [ ] Any exception documentation

---

## TROUBLESHOOTING

### Issue: GL Balance Fails (imbalanced by > 0.01)

**Investigation Steps:**
1. Identify imbalanced accounts
2. Review account-level debit/credit entries
3. Look for:
   - Data entry errors
   - Duplicate entries
   - Unposted corrections
   - System calculation errors

**Common Causes:**
- **Rounding errors:** Consolidate and recalculate
- **Duplicate reversal:** Remove one of pair
- **Missing correction entry:** Add balancing entry with description

**Fix Example:**
```sql
-- Add correction entry to balance account 4210 (Salaries)
INSERT INTO public.ecritures_comptables_v2 (
  societe_id, date_ecriture, numero_compte, nom_compte,
  description, debit_mur, credit_mur, journal, exercice
) VALUES (
  'societe_id',
  CURRENT_DATE,
  '4210',
  'Salaires',
  'Rounding correction per audit verification',
  0.15,  -- difference amount
  0,
  'OD',  -- Other entries journal
  '2025-2026'
);
```

---

### Issue: Data Completeness < 100%

**Investigation Steps:**
1. Identify which field is missing
2. Count how many records lack the field
3. Assess: Critical or informational?

**Resolution Options:**
1. **Populate:** Run UPDATE to fill missing data
2. **Accept:** Document as minor exception if non-critical
3. **Delete:** Remove problematic records if invalid

**Example:**
```sql
-- Find invoices with missing customer
SELECT id, numero, date FROM public.factures WHERE tiers_id IS NULL;

-- Map to correct customer and update
UPDATE public.factures SET tiers_id = 'customer_id' WHERE id = 'invoice_id';
```

---

### Issue: Duplicate Entries Found

**Investigation Steps:**
1. Review the duplicate set
2. Check dates and descriptions for clues
3. Verify if it's a legitimate reversal pair or true duplicate

**Resolution:**
```sql
-- Delete clear duplicates (keep earliest)
DELETE FROM public.ecritures_comptables_v2
WHERE id NOT IN (
  SELECT MIN(id) FROM public.ecritures_comptables_v2
  GROUP BY date_ecriture, numero_compte, debit_mur, credit_mur
);
```

---

### Issue: Orphaned Records

**Investigation Steps:**
1. Determine if orphan is a true orphan or expected
2. For GL entries without documents: acceptable for OD/SAL journals
3. For invoice lines without parent: needs correction

**Resolution:**
```sql
-- Delete truly orphaned invoice lines
DELETE FROM public.factures_lignes fl
WHERE NOT EXISTS (
  SELECT 1 FROM public.factures f WHERE f.id = fl.facture_id
);
```

---

## VALIDATION CHECKLIST FOR FINAL SIGN-OFF

Before declaring audit ready:

### Data Quality
- [ ] GL balanced to ±0.01 MUR
- [ ] 100% data completeness in required fields
- [ ] 0 duplicate entries
- [ ] 0 orphaned records
- [ ] 0 foreign key violations

### Data Retention
- [ ] 12+ months GL entries
- [ ] 24+ months payroll records
- [ ] 12+ months invoice history
- [ ] 12+ months bank statements

### Anomalies
- [ ] All high-value transactions justified
- [ ] All missing descriptions resolved
- [ ] Unusual entries documented

### Audit Trail
- [ ] SOD matrix populated
- [ ] Audit trail events logged
- [ ] User roles properly assigned

### Documentation
- [ ] 5 audit reports generated
- [ ] Exceptions documented
- [ ] Sign-off memos prepared

### Auditor Readiness
- [ ] CAAT-format data exports prepared
- [ ] Data dictionary provided
- [ ] Integration testing scheduled

---

## SUPPORT CONTACTS

| Role | Contact | Responsibility |
|---|---|---|
| Tech Lead | [Name] | Database, script execution |
| Finance Lead | [Name] | Data review, exception justification |
| Audit Lead | [Name] | Auditor coordination, sign-off |

---

## APPENDIX: QUICK REFERENCE COMMANDS

```bash
# Run all audits
node /home/user/v0-lexora-accounting-saa-s/scripts/phase5-audit-integrity-check.mjs

# Check GL balance only (SQL)
psql $DATABASE_URL < /home/user/v0-lexora-accounting-saa-s/scripts/phase5-audit-queries.sql | grep -A20 "OVERALL GL BALANCE"

# View audit reports
ls -lh /exports/*.csv /exports/*.md

# Archive for delivery
tar -czf audit_reports_$(date +%Y%m%d).tar.gz /exports/

# Verify Supabase connectivity
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" | jq .
```

---

## DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-22 | Tech Team | Initial version |

---

**Status:** READY FOR EXECUTION  
**Last Updated:** 2026-05-22  
**Next Review:** Post-audit handoff
