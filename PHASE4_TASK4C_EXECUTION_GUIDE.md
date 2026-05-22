# PHASE 4, Task 4C - Execution Guide
## Invoice Traceability Testing (Weeks 7-8)

---

## QUICK START

### 1. Pre-flight Validation (5 minutes)

```bash
# Check prerequisites and data quality
npx ts-node scripts/validate_traceability_test.ts
```

**Expected Output:**
```
✓ Database Connectivity
✓ Invoice Data Present (X invoices found)
✓ Sufficient Sample Size (X/50)
✓ GL Integration (X invoices with GL entries)
✓ Required Fields Populated
✓ GL Table Structure

✓ ALL CHECKS PASSED - READY FOR TESTING
```

**If checks FAIL:**
- Review error message carefully
- Ensure database has sample invoices (at least 50)
- Verify GL entries exist for invoices
- Check that required fields are populated

### 2. Execute Traceability Tests (10-15 minutes)

```bash
# Generate all three reports automatically
npx ts-node scripts/invoice_traceability_report.ts
```

**Expected Output:**
```
✓ Retrieved 50 invoice records
✓ Traceability report completed
✓ Exception report completed
✓ MRA compliance report completed

=== TESTING COMPLETE ===

Outputs:
1. /exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx
2. /exports/TRACEABILITY_EXCEPTIONS.md
3. /exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md
```

### 3. Review Results (30 minutes)

1. **Open Excel Report**
   ```bash
   open exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx
   ```
   - Review Summary sheet for overall statistics
   - Check Traceability Details sheet for status
   - Filter for "FAIL" status to identify issues
   - Green = PASS, Red = FAIL

2. **Review Exception Report**
   ```bash
   cat exports/TRACEABILITY_EXCEPTIONS.md
   ```
   - Each exception documented with issue, root cause, action
   - Prioritize by root cause category
   - Assign corrective actions

3. **Review MRA Compliance**
   ```bash
   cat exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md
   ```
   - Check compliance rate (should be >= 98%)
   - Review any violations
   - Note requirements for Form 3/NSF/CSG filing

---

## DETAILED WORKFLOW

### Step 1: Understand Test Scope

**50-Invoice Sample:**
- Stratified by month (12 months = ~4 per month)
- Mixed document types (client & supplier)
- Multiple amount ranges ($50 → $50,000)
- Various tax treatments (19%, 8%, 0%, exempt)

**Traceability Chain:**
```
Invoice (factures table)
  ↓ facture_id FK
GL Entries (ecritures_comptables_v2 table)
  ├─ Account postings (411, 706, 441, etc.)
  ├─ Amount verification
  └─ Approval trail (created_by, created_at)
```

### Step 2: Validate Database State

```bash
# SQL query to check invoice/GL balance
psql -h YOUR_HOST -U YOUR_USER -d YOUR_DB -c \
  "SELECT COUNT(*) as total_invoices FROM factures 
   WHERE created_at >= NOW() - INTERVAL '12 months';"

# Check GL entries linked to invoices
psql -h YOUR_HOST -U YOUR_USER -d YOUR_DB -c \
  "SELECT COUNT(DISTINCT facture_id) as invoices_with_gl 
   FROM ecritures_comptables_v2 
   WHERE facture_id IS NOT NULL;"
```

### Step 3: Run Validation Script

```bash
# Test prerequisites
npx ts-node scripts/validate_traceability_test.ts 2>&1 | tee validation_log.txt

# Analyze output for any warnings/errors
grep "❌" validation_log.txt
```

**Common Issues & Fixes:**

| Issue | Fix |
|-------|-----|
| "No invoices found" | Insert test invoices via seed script |
| "GL table not found" | Run migration 120 (unify ecritures) |
| "Missing GL entries" | Run migration 133 (facture_id link) |
| "Missing required fields" | Populate numero_facture, date_facture, tiers |

### Step 4: Generate Reports

```bash
# Ensure environment variables set
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"

# Run full test suite
npx ts-node scripts/invoice_traceability_report.ts 2>&1 | tee testing_log.txt

# Monitor progress
tail -f testing_log.txt
```

### Step 5: Analyze Results

**Excel Report Analysis:**

```bash
# Quick statistics using Python/pandas (optional)
python3 << 'EOF'
import pandas as pd

df = pd.read_excel(
  'exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx',
  sheet_name='Traceability Details'
)

# Summary stats
print(f"Total Tested: {len(df)}")
print(f"Passed: {(df['Status'] == 'PASS').sum()}")
print(f"Failed: {(df['Status'] == 'FAIL').sum()}")
print(f"Pass Rate: {(df['Status'] == 'PASS').sum() / len(df) * 100:.2f}%")

# Exception breakdown
print("\nExceptions by Type:")
print(df[df['Exception'] != 'OK']['Exception'].value_counts())

# Problem invoices
print("\nProblem Invoices:")
failures = df[df['Status'] == 'FAIL'][['Invoice #', 'Amount (TTC)', 'Status', 'Exception']]
print(failures.to_string())
EOF
```

**Exception Report Analysis:**

```bash
# Count exceptions by severity
grep "^### Exception" exports/TRACEABILITY_EXCEPTIONS.md | wc -l

# Extract root causes
grep "Root Cause" exports/TRACEABILITY_EXCEPTIONS.md | sort | uniq -c | sort -rn

# Find recommended actions
grep -A2 "Corrective Action" exports/TRACEABILITY_EXCEPTIONS.md | grep -v "^--"
```

### Step 6: Document Findings

**Create Summary Document:**

```markdown
# Phase 4, Task 4C - Test Results Summary

**Test Date:** YYYY-MM-DD
**Tester:** Name
**Duration:** X hours

## Results

- **Invoices Tested:** 50
- **Pass Rate:** XX%
- **Exceptions:** X
- **MRA Compliance:** XX%

## Key Findings

[Document top issues, patterns, systemic problems]

## Corrective Actions Required

[List items to fix, assign owners, target dates]

## Sign-Off

[Finance Manager, Tech Lead, Auditor sign-off]
```

### Step 7: Address Exceptions (if any)

**For each exception:**

1. **Verify the Issue**
   ```sql
   -- Example: Check GL entries for specific invoice
   SELECT * FROM ecritures_comptables_v2 
   WHERE facture_id = 'INVOICE_ID' OR ref_folio = 'INVOICE_NUMBER';
   ```

2. **Root Cause Analysis**
   - No GL entries? Check posting logic
   - Amount mismatch? Review GL account postings
   - GL imbalance? Verify debit/credit equality
   - Missing audit trail? Check created_by field

3. **Corrective Action**
   - Create missing GL entries manually (with approval)
   - Correct GL amounts and rebalance
   - Update audit trail metadata
   - Document changes in audit log

4. **Validation**
   - Rerun specific invoice through test
   - Verify exception resolved
   - Document corrective action taken

### Step 8: Generate Final Report for Auditor

```bash
# Package all results
mkdir -p exports/PHASE4_TASK4C_FINAL_REPORT
cp exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx exports/PHASE4_TASK4C_FINAL_REPORT/
cp exports/TRACEABILITY_EXCEPTIONS.md exports/PHASE4_TASK4C_FINAL_REPORT/
cp exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md exports/PHASE4_TASK4C_FINAL_REPORT/
cp PHASE4_TASK4C_EXECUTION_GUIDE.md exports/PHASE4_TASK4C_FINAL_REPORT/
cp exports/PHASE4_TASK4C_TEST_PLAN.md exports/PHASE4_TASK4C_FINAL_REPORT/

# Add metadata
cat > exports/PHASE4_TASK4C_FINAL_REPORT/README.md << 'EOF'
# Phase 4, Task 4C - Invoice Traceability Testing

## Contents
- INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx — Main test results
- TRACEABILITY_EXCEPTIONS.md — Exception analysis & corrective actions
- INVOICE_MRA_COMPLIANCE_50_SAMPLE.md — MRA compliance validation
- PHASE4_TASK4C_TEST_PLAN.md — Test methodology & criteria
- PHASE4_TASK4C_EXECUTION_GUIDE.md — How to run tests

## Key Metrics
[Add actual metrics from test execution]

## Sign-Off
[Add approval sign-off]
EOF

# Create archive
tar -czf PHASE4_TASK4C_TEST_RESULTS.tar.gz exports/PHASE4_TASK4C_FINAL_REPORT/
ls -lh PHASE4_TASK4C_TEST_RESULTS.tar.gz
```

---

## TROUBLESHOOTING

### Issue: "No invoices found"

```bash
# Check if factures table exists and has data
psql -c "SELECT COUNT(*) FROM factures;"

# If empty, load test data
psql -f scripts/seed_demo.sql
```

### Issue: "GL entries not found"

```bash
# Verify ecritures_comptables_v2 exists
psql -c "SELECT COUNT(*) FROM ecritures_comptables_v2;"

# Check if facture_id FK is populated
psql -c "SELECT COUNT(DISTINCT facture_id) FROM ecritures_comptables_v2 WHERE facture_id IS NOT NULL;"

# If low, run migration 133 backfill
psql -f supabase/migrations/133_ecritures_facture_id_link.sql
```

### Issue: "Missing required fields"

```bash
# Identify which invoices missing fields
psql -c "SELECT numero_facture, CASE 
  WHEN date_facture IS NULL THEN 'missing_date'
  WHEN tiers IS NULL THEN 'missing_tiers'
  WHEN montant_ht IS NULL THEN 'missing_ht'
  END as missing_field
FROM factures WHERE date_facture IS NULL OR tiers IS NULL OR montant_ht IS NULL;"

# Populate missing data
UPDATE factures SET date_facture = NOW() WHERE date_facture IS NULL;
UPDATE factures SET tiers = 'Unknown' WHERE tiers IS NULL;
UPDATE factures SET montant_ht = 0 WHERE montant_ht IS NULL;
```

### Issue: "Test script hangs or times out"

```bash
# Increase timeout in invoice_traceability_report.ts
// Change: new SQL query timeout (in ms)
const query = await client.rpc(...);
// Add: .timeout(60000) // 60 seconds

# Or run SQL directly
psql -f scripts/invoice_traceability_testing.sql > /tmp/results.json

# Import results into Excel manually if needed
```

---

## SUCCESS CRITERIA

| Criterion | Target | Result |
|-----------|--------|--------|
| 50 invoices traced | 100% | ✓/✗ |
| Amount matching | 100% | ✓/✗ |
| GL balance | 100% | ✓/✗ |
| Approval trail | 100% | ✓/✗ |
| Exceptions | 0-3 | ? |
| MRA compliance | >= 98% | ? |

**PASS:** All criteria met + exceptions documented & addressed

---

## TIME ESTIMATES

| Step | Time |
|------|------|
| 1. Pre-flight validation | 5 min |
| 2. Execute tests | 10-15 min |
| 3. Review results | 30 min |
| 4. Address exceptions (if any) | 1-2 hours |
| 5. Final sign-off | 15 min |
| **Total** | **2-3 hours** |

---

## FILES & LOCATIONS

```
/exports/
├── PHASE4_TASK4C_TEST_PLAN.md                          ← Test methodology
├── INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx     ← Main report
├── TRACEABILITY_EXCEPTIONS.md                           ← Exceptions
└── INVOICE_MRA_COMPLIANCE_50_SAMPLE.md                 ← MRA check

/scripts/
├── invoice_traceability_testing.sql                     ← SQL test logic
├── invoice_traceability_report.ts                       ← Report generator
└── validate_traceability_test.ts                        ← Pre-flight check
```

---

## CONTACTS & ESCALATION

- **Finance Lead:** For invoice data issues
- **Tech Lead:** For GL posting/system issues
- **Auditor:** For compliance questions
- **DBA:** For database issues

---

## NEXT STEPS (Post-Testing)

1. ✓ Review all three reports
2. ✓ Address any exceptions (root cause → corrective action)
3. ✓ Verify corrections with retest
4. ✓ Sign-off from Finance + Tech
5. ✓ Submit for external audit review
6. ✓ Archive reports for SOX compliance

---

**Status:** Ready for Execution  
**Version:** 1.0  
**Last Updated:** 2025-05-22  
**Owner:** Finance + Tech Team
