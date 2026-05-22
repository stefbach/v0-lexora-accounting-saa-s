# FINANCIAL CLOSE TESTING EXECUTION GUIDE
**Lexora Accounting SaaS - Phase 4, Task 4A**

**Prepared for:** Finance + Tech Team  
**Testing Period:** 12 Months (Past Year)  
**Database:** ecritures_comptables_v2  
**Tolerance:** 0.01 MUR

---

## OVERVIEW

This guide provides step-by-step instructions to execute comprehensive GL close testing across five testing modules:

1. **GL Close Walkthrough** (GL_CLOSE_PROCEDURES_TESTED.md)
2. **Double-Entry Verification** (01_monthly_balance_verification.sql)
3. **Account Reconciliation** (03_account_reconciliation.sql)
4. **Period Close Controls** (04_period_close_controls.sql)
5. **Year-End Procedures** (05_year_end_procedures.sql)

---

## TESTING MODULES

### Module 1: GL Close Walkthrough
**File:** GL_CLOSE_PROCEDURES_TESTED.md  
**Status:** FRAMEWORK CREATED  
**Action Items:**
1. Execute each of the SQL queries in the document
2. Complete the monthly close checklists
3. Document results in the corresponding section
4. Verify all 12 months passed the 6-step close process

**6-Step GL Close Process:**
```
Step 1: Lock GL entries → Prevent new postings
Step 2: Run trial balance → Extract period balances
Step 3: Verify balance → SUM(debit) = SUM(credit)
Step 4: Review suspense → Reconcile clearing accounts
Step 5: Create closing entry → If needed
Step 6: Archive snapshot → Immutable copy
```

---

### Module 2: Double-Entry Verification
**File:** 02_double_entry_verification.sql  
**Location:** /home/user/v0-lexora-accounting-saa-s/exports/

**How to Execute:**

```bash
# Run via psql directly
psql [connection_string] -f exports/02_double_entry_verification.sql -o exports/DOUBLE_ENTRY_VERIFICATION.csv

# Or save output to file
psql [connection_string] -f exports/02_double_entry_verification.sql > exports/DOUBLE_ENTRY_VERIFICATION.txt
```

**Expected Results:**
- Test 1: All entries should show equal debit and credit
- Test 2: Count of unbalanced entries should be 0
- Test 3: No unbalanced journals
- Test 4: Identify any mixed debit/credit entries
- Test 5: Total debits = Total credits

**Success Criteria:**
- PASS: 0 unbalanced entries
- FAIL: Any entries with debit != credit

---

### Module 3: Monthly Balance Verification
**File:** 01_monthly_balance_verification.sql  
**Location:** /home/user/v0-lexora-accounting-saa-s/exports/

**How to Execute:**

```bash
# Run with CSV output
psql [connection_string] -f exports/01_monthly_balance_verification.sql \
  -o exports/MONTHLY_BALANCE_VERIFICATION.csv

# Or with formatted output
psql [connection_string] -f exports/01_monthly_balance_verification.sql \
  -H -o exports/MONTHLY_BALANCE_VERIFICATION.html
```

**Expected Results:**
- Test 1: Each journal in each month should BALANCE
- Test 2: Monthly totals should BALANCE
- Test 3: No months should appear in results (if all balanced)

**Success Criteria:**
- PASS: All months show status = 'BALANCED'
- FAIL: Any month shows status = 'UNBALANCED'

---

### Module 4: Account Reconciliation
**File:** 03_account_reconciliation.sql  
**Location:** /home/user/v0-lexora-accounting-saa-s/exports/

**How to Execute:**

```bash
# Export to CSV for spreadsheet analysis
psql [connection_string] -f exports/03_account_reconciliation.sql \
  -o exports/ACCOUNT_RECONCILIATION_COMPLETE.csv

# View summary only
psql [connection_string] -c \
  "SELECT numero_compte, nom_compte, account_balance, reconciliation_status 
   FROM trial_balance_view WHERE reconciliation_status = 'UNRECONCILED';"
```

**Expected Results:**
- Test 1: Trial balance for all accounts
- Test 2: No rows (all accounts reconciled)
- Test 3: Monthly breakdown by account
- Test 4: Summary by account type
- Test 5: Zero unreconciled accounts
- Test 6: 100% reconciliation achieved

**Success Criteria:**
- PASS: Test 2 returns 0 rows
- PASS: Test 6 shows "100% Account Reconciliation Achieved"
- FAIL: Any account with unreconciled_balance != 0

---

### Module 5: Period Close Controls
**File:** 04_period_close_controls.sql  
**Location:** /home/user/v0-lexora-accounting-saa-s/exports/

**How to Execute:**

```bash
# Run all control tests
psql [connection_string] -f exports/04_period_close_controls.sql \
  -o exports/PERIOD_CLOSE_CONTROLS.csv

# Focus on failures only
psql [connection_string] -f exports/04_period_close_controls.sql | grep "FAIL"
```

**Expected Results:**
- Test 1: All periods show "PASS: Cutoff control verified"
- Test 2: All periods show "PASS: Zero or one closing entry"
- Test 3: All suspense accounts show "PASS: Suspense account cleared"
- Test 4: All periods show "PASS: Sequence integrity verified"
- Test 5: All closed periods show "PASS: Period appears locked"
- Test 6: All journals show "PASS: Journal balanced"
- Test 7: Approval percentages > 95%
- Test 8: Overall status = "PASS: All periods closed and balanced"

**Success Criteria:**
- PASS: Test 8 overall_status = PASS
- FAIL: Any FAIL status in tests 1-7

---

### Module 6: Year-End Procedures
**File:** 05_year_end_procedures.sql  
**Location:** /home/user/v0-lexora-accounting-saa-s/exports/

**How to Execute:**

```bash
# Run year-end verification
psql [connection_string] -f exports/05_year_end_procedures.sql \
  -o exports/YEAR_END_PROCEDURES.csv

# Check for mismatches
psql [connection_string] -f exports/05_year_end_procedures.sql | grep "MISMATCH"
```

**Expected Results:**
- Test 2: All accounts show "MATCH" status
- Test 3: No rows returned (no double-posting)
- Test 4: Minimal opening entries
- Test 5: Reasonable variance or match
- Test 6: Fiscal year transition is complete
- Test 7: All checks passed

**Success Criteria:**
- PASS: Test 2 shows all accounts with "MATCH"
- PASS: Test 3 returns 0 rows (no duplicates)
- FAIL: Test 2 shows "MISMATCH" for any account

---

## EXECUTION STEPS

### Step 1: Prepare Testing Environment

```bash
# Create exports directory if not exists
mkdir -p /home/user/v0-lexora-accounting-saa-s/exports

# Verify SQL test files exist
ls -lh /home/user/v0-lexora-accounting-saa-s/exports/*.sql

# Expected files:
# - 01_monthly_balance_verification.sql
# - 02_double_entry_verification.sql
# - 03_account_reconciliation.sql
# - 04_period_close_controls.sql
# - 05_year_end_procedures.sql
```

### Step 2: Gather Connection Details

```bash
# Get Supabase project URL and API key
# From: supabase/config.toml or environment variables
# Format: postgresql://[user]:[password]@[host]:[port]/[database]
```

### Step 3: Execute Tests in Order

```bash
# Test 1: Monthly Balance Verification
echo "=== TEST 1: Monthly Balance Verification ==="
psql [connection] -f exports/01_monthly_balance_verification.sql | tee exports/test_1_results.txt

# Test 2: Double-Entry Verification
echo "=== TEST 2: Double-Entry Verification ==="
psql [connection] -f exports/02_double_entry_verification.sql | tee exports/test_2_results.txt

# Test 3: Account Reconciliation
echo "=== TEST 3: Account Reconciliation ==="
psql [connection] -f exports/03_account_reconciliation.sql | tee exports/test_3_results.txt

# Test 4: Period Close Controls
echo "=== TEST 4: Period Close Controls ==="
psql [connection] -f exports/04_period_close_controls.sql | tee exports/test_4_results.txt

# Test 5: Year-End Procedures
echo "=== TEST 5: Year-End Procedures ==="
psql [connection] -f exports/05_year_end_procedures.sql | tee exports/test_5_results.txt
```

### Step 4: Analyze Results

For each test, check for:
- PASS/FAIL status
- Expected vs. Actual values
- Exception cases and outliers

```bash
# Quick check for failures
grep -i "fail\|error\|mismatch" exports/test_*.txt

# Count balanced vs unbalanced periods
grep "BALANCED\|UNBALANCED" exports/test_1_results.txt | sort | uniq -c
```

### Step 5: Generate Summary Report

```bash
# Compile results into TESTING_RESULTS_SUMMARY.md
cat > exports/TESTING_RESULTS_SUMMARY.md << 'EOF'
# TESTING RESULTS SUMMARY

## Test 1: Monthly Balance Verification
- Status: [PASS/FAIL]
- Balanced Months: [X]/12
- Issues: [List any issues]

## Test 2: Double-Entry Verification
- Status: [PASS/FAIL]
- Unbalanced Entries: [0]
- Issues: [List any issues]

## Test 3: Account Reconciliation
- Status: [PASS/FAIL]
- Unreconciled Accounts: [0]
- Reconciliation Rate: [100%]
- Issues: [List any issues]

## Test 4: Period Close Controls
- Status: [PASS/FAIL]
- Locked Periods: [12]/12
- Issues: [List any issues]

## Test 5: Year-End Procedures
- Status: [PASS/FAIL]
- Opening Balance Matches: [100%]
- Issues: [List any issues]

## OVERALL STATUS: READY FOR AUDIT
EOF
```

---

## INTERPRETATION GUIDE

### Key Metrics

| Metric | Target | Acceptable Range | Action if Missed |
|--------|--------|------------------|------------------|
| Monthly Balance | 100% | 99-100% | Investigate imbalances |
| Unbalanced Entries | 0 | 0 | Correct individual entries |
| Account Reconciliation | 100% | 99-100% | Reconcile accounts |
| Period Locks | 100% | 100% | Lock closed periods |
| Year-End Matches | 100% | 100% | Verify opening balances |

### Common Issues and Solutions

**Issue 1: Unbalanced Month**
```
Symptom: Month shows SUM(debit) != SUM(credit)
Root Cause: Missing or incorrect entries
Solution: 
  1. Query for entries with imbalance
  2. Identify source journal
  3. Create correcting entry
```

**Issue 2: Unreconciled Account**
```
Symptom: Account has balance but should be zero
Root Cause: Unmatched or uncleaned entries
Solution:
  1. Identify account type (bank, AP, AR, etc.)
  2. Reconcile against subledger
  3. Create clearing entry if needed
```

**Issue 3: Period Not Locked**
```
Symptom: Entries found in closed period
Root Cause: Lack of period-end controls
Solution:
  1. Implement period lock mechanism
  2. Prevent late entries
  3. Create audit trail
```

---

## DELIVERABLES CHECKLIST

- [ ] GL_CLOSE_PROCEDURES_TESTED.md - Updated with monthly results
- [ ] DOUBLE_ENTRY_VERIFICATION.csv - Test results exported
- [ ] ACCOUNT_RECONCILIATION_COMPLETE.xlsx - All accounts verified
- [ ] PERIOD_CLOSE_CONTROLS.md - All controls verified
- [ ] YEAR_END_PROCEDURES.md - Opening balances verified
- [ ] TESTING_RESULTS_SUMMARY.md - Executive summary
- [ ] test_1_results.txt through test_5_results.txt - Raw outputs

---

## NEXT STEPS

1. **Execute all tests** - Run SQL queries against production
2. **Analyze results** - Review PASS/FAIL status
3. **Document findings** - Update markdown files with results
4. **Remediate issues** - Create correcting entries if needed
5. **Re-test** - Re-run failed tests
6. **Sign off** - Approval from Finance and Tech leads
7. **Archive** - Store results for audit trail

---

## CONTACTS

- **Finance Lead:** [Finance Team Email]
- **Tech Lead:** [Tech Team Email]
- **Auditor:** [Auditor Contact]

---

**Last Updated:** 2026-05-22  
**Version:** 1.0  
**Status:** READY FOR EXECUTION  
