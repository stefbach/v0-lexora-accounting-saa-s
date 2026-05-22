# Finance Extraction Agent - Quick Start Guide

**Branch:** `claude/rotate-supabase-keys-YPd5x`

---

## 5-Minute Setup

### 1. Set Environment Variables

```bash
# From project root
export NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
```

### 2. Apply Database Migration

```bash
# Option A: Using Supabase CLI
cd /home/user/v0-lexora-accounting-saa-s
supabase db push

# Option B: Using psql directly
psql [connection-string] -f supabase/migrations/333_finance_extraction_functions.sql
```

### 3. Verify Setup

```bash
# Test extraction functions
psql [connection-string] -f scripts/test-extraction-setup.sql

# OR using npm script
npm run extract:test
```

### 4. Run Extraction

```bash
# Execute the extraction agent
npm run extract:finance

# OR with ts-node directly
npx ts-node scripts/finance-extraction-agent.ts
```

### 5. Check Results

```bash
# List generated files
ls -lh exports/

# View the audit report
cat exports/DATA_QUALITY_AUDIT.md

# Check CSV headers
head -1 exports/GL_12MONTHS_COMPLETE.csv
```

---

## What Gets Generated

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `GL_12MONTHS_COMPLETE.csv` | 1-10 MB | CSV | All ledger entries, 12 months |
| `TRIAL_BALANCE_12MONTHS.csv` | 100 KB-1 MB | CSV | Month-end account balances |
| `MONTHLY_SUMMARIES.csv` | 50-500 KB | CSV | Revenue/expense/asset summaries |
| `DATA_QUALITY_AUDIT.md` | 5-20 KB | Markdown | Audit quality report |

---

## Key Validations

The extraction agent automatically:
- ✓ Verifies GL balances (debit = credit)
- ✓ Checks each month balances to zero
- ✓ Validates data completeness
- ✓ Identifies suspicious entries
- ✓ Generates audit trail report

---

## Troubleshooting

### Error: "Unauthorized" / "Missing credentials"

```bash
# Check if env vars are set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Re-export if needed
export NEXT_PUBLIC_SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
```

### Error: "Function not found"

```bash
# Ensure migration was applied
psql -f supabase/migrations/333_finance_extraction_functions.sql

# Verify functions exist
psql -c "SELECT * FROM information_schema.routines WHERE routine_name LIKE 'get_%';"
```

### Error: "No transactions found"

This is OK if the database is empty or has no entries in the past 12 months.

---

## For Big 4 Auditors

Deliver these files to your audit team:

1. **GL_12MONTHS_COMPLETE.csv** - Complete general ledger
2. **TRIAL_BALANCE_12MONTHS.csv** - Trial balance for audit verification
3. **DATA_QUALITY_AUDIT.md** - Data quality certification

---

## Need More Help?

```bash
# View full documentation
npm run extract:help

# Or read directly
cat docs/PHASE2_TASK2A_FINANCE_EXTRACTION.md
```

---

## Files Created

```
supabase/
  ├── queries/
  │   ├── 01_general_ledger_12months.sql
  │   ├── 02_monthly_trial_balance.sql
  │   ├── 03_monthly_summary_reports.sql
  │   └── 04_data_quality_checks.sql
  └── migrations/
      └── 333_finance_extraction_functions.sql

scripts/
  ├── finance-extraction-agent.ts
  └── test-extraction-setup.sql

docs/
  └── PHASE2_TASK2A_FINANCE_EXTRACTION.md

exports/ (created at runtime)
  ├── GL_12MONTHS_COMPLETE.csv
  ├── TRIAL_BALANCE_12MONTHS.csv
  ├── MONTHLY_SUMMARIES.csv
  └── DATA_QUALITY_AUDIT.md
```

---

**Status:** Ready for deployment  
**Last Updated:** 2026-05-22
