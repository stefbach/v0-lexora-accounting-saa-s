#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
# FINANCIAL CLOSE TESTING - MASTER EXECUTION SCRIPT
# ═════════════════════════════════════════════════════════════════════════════
# Purpose: Execute all GL close verification tests
# Usage: ./run_all_tests.sh [database_url]
# ═════════════════════════════════════════════════════════════════════════════

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_DIR="${SCRIPT_DIR}/test_results_${TIMESTAMP}"
DB_URL="${1:-$DATABASE_URL}"

# Create report directory
mkdir -p "${REPORT_DIR}"

echo "════════════════════════════════════════════════════════════════════════"
echo "FINANCIAL CLOSE TESTING SUITE"
echo "════════════════════════════════════════════════════════════════════════"
echo "Database: $DB_URL"
echo "Report Directory: $REPORT_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# Verify connection
echo "Step 0: Verifying database connection..."
if psql "$DB_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo "✓ Database connection successful"
else
    echo "✗ Database connection failed"
    echo "Please set DATABASE_URL or pass connection string as argument"
    exit 1
fi
echo ""

# Test 1: Monthly Balance Verification
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 1: Monthly Balance Verification"
echo "════════════════════════════════════════════════════════════════════════"
psql "$DB_URL" -f "${SCRIPT_DIR}/01_monthly_balance_verification.sql" \
  -o "${REPORT_DIR}/01_MONTHLY_BALANCE_VERIFICATION.csv" 2>&1 | tee "${REPORT_DIR}/01_MONTHLY_BALANCE_VERIFICATION.log"
echo "✓ Results: ${REPORT_DIR}/01_MONTHLY_BALANCE_VERIFICATION.csv"
echo ""

# Test 2: Double-Entry Verification
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 2: Double-Entry Verification"
echo "════════════════════════════════════════════════════════════════════════"
psql "$DB_URL" -f "${SCRIPT_DIR}/02_double_entry_verification.sql" \
  -o "${REPORT_DIR}/02_DOUBLE_ENTRY_VERIFICATION.csv" 2>&1 | tee "${REPORT_DIR}/02_DOUBLE_ENTRY_VERIFICATION.log"
echo "✓ Results: ${REPORT_DIR}/02_DOUBLE_ENTRY_VERIFICATION.csv"
echo ""

# Test 3: Account Reconciliation
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 3: Account Reconciliation"
echo "════════════════════════════════════════════════════════════════════════"
psql "$DB_URL" -f "${SCRIPT_DIR}/03_account_reconciliation.sql" \
  -o "${REPORT_DIR}/03_ACCOUNT_RECONCILIATION_COMPLETE.csv" 2>&1 | tee "${REPORT_DIR}/03_ACCOUNT_RECONCILIATION_COMPLETE.log"
echo "✓ Results: ${REPORT_DIR}/03_ACCOUNT_RECONCILIATION_COMPLETE.csv"
echo ""

# Test 4: Period Close Controls
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 4: Period Close Controls"
echo "════════════════════════════════════════════════════════════════════════"
psql "$DB_URL" -f "${SCRIPT_DIR}/04_period_close_controls.sql" \
  -o "${REPORT_DIR}/04_PERIOD_CLOSE_CONTROLS.csv" 2>&1 | tee "${REPORT_DIR}/04_PERIOD_CLOSE_CONTROLS.log"
echo "✓ Results: ${REPORT_DIR}/04_PERIOD_CLOSE_CONTROLS.csv"
echo ""

# Test 5: Year-End Procedures
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 5: Year-End Procedures"
echo "════════════════════════════════════════════════════════════════════════"
psql "$DB_URL" -f "${SCRIPT_DIR}/05_year_end_procedures.sql" \
  -o "${REPORT_DIR}/05_YEAR_END_PROCEDURES.csv" 2>&1 | tee "${REPORT_DIR}/05_YEAR_END_PROCEDURES.log"
echo "✓ Results: ${REPORT_DIR}/05_YEAR_END_PROCEDURES.csv"
echo ""

# Generate summary report
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 6: Generating Summary Report"
echo "════════════════════════════════════════════════════════════════════════"

cat > "${REPORT_DIR}/TESTING_RESULTS_SUMMARY.md" << 'EOF'
# FINANCIAL CLOSE TESTING RESULTS SUMMARY
**Execution Date:** $(date)

## Test Execution Status

### Test 1: Monthly Balance Verification
- **File:** 01_MONTHLY_BALANCE_VERIFICATION.csv
- **Purpose:** Verify SUM(debit) = SUM(credit) for each month
- **Expected Result:** All months show BALANCED status

### Test 2: Double-Entry Verification
- **File:** 02_DOUBLE_ENTRY_VERIFICATION.csv
- **Purpose:** Verify all entries are properly balanced
- **Expected Result:** Count of unbalanced entries = 0

### Test 3: Account Reconciliation
- **File:** 03_ACCOUNT_RECONCILIATION_COMPLETE.csv
- **Purpose:** Verify all accounts reconcile
- **Expected Result:** 100% of accounts reconciled

### Test 4: Period Close Controls
- **File:** 04_PERIOD_CLOSE_CONTROLS.csv
- **Purpose:** Verify period-end controls
- **Expected Result:** All periods show PASS status

### Test 5: Year-End Procedures
- **File:** 05_YEAR_END_PROCEDURES.csv
- **Purpose:** Verify opening balances match prior year closing
- **Expected Result:** All accounts show MATCH status

## Summary Statistics

- Total test modules: 5
- Expected passing tests: 5
- Actual passing tests: [CHECK CSV FILES]
- Overall status: [PASS/FAIL]

## Detailed Analysis

See individual CSV files for detailed results.

## Recommendations

[To be updated after reviewing detailed results]

---
**Report Generated:** $(date)
EOF

echo "✓ Summary report: ${REPORT_DIR}/TESTING_RESULTS_SUMMARY.md"
echo ""

# Check for failures
echo "════════════════════════════════════════════════════════════════════════"
echo "Step 7: Failure Analysis"
echo "════════════════════════════════════════════════════════════════════════"

FAIL_COUNT=0

for file in "${REPORT_DIR}"/*.csv; do
    if grep -qi "fail\|error\|mismatch\|unbalanced\|unreconciled" "$file"; then
        echo "⚠ Issues found in $(basename $file)"
        ((FAIL_COUNT++))
    fi
done

if [ $FAIL_COUNT -eq 0 ]; then
    echo "✓ No failures detected in any test"
    OVERALL_STATUS="PASS"
else
    echo "✗ Issues detected in $FAIL_COUNT test(s)"
    OVERALL_STATUS="FAIL"
fi
echo ""

# Final summary
echo "════════════════════════════════════════════════════════════════════════"
echo "TESTING COMPLETE"
echo "════════════════════════════════════════════════════════════════════════"
echo "Overall Status: $OVERALL_STATUS"
echo "Report Directory: $REPORT_DIR"
echo "Files generated:"
ls -1 "${REPORT_DIR}/"
echo ""
echo "Next Steps:"
if [ "$OVERALL_STATUS" = "PASS" ]; then
    echo "1. Review summary report"
    echo "2. Archive test results"
    echo "3. Sign off on GL close procedures"
    echo "4. Provide results to auditor"
else
    echo "1. Review failure details in CSV files"
    echo "2. Identify root causes"
    echo "3. Create remediation plan"
    echo "4. Re-run tests after fixes"
fi
echo ""

exit 0
