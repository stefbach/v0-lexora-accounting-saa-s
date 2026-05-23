# PHASE 2, Task 2A - Finance Extraction Agent

**Timeline:** Weeks 3-4  
**Effort:** 40 hours  
**Owner:** Finance team + Tech  
**Status:** Setup Complete  
**Branch:** `claude/rotate-supabase-keys-YPd5x`

---

## Mission

Extract and verify **12 months of complete financial data** ready for Big 4 auditors.

---

## Deliverables

### 1. General Ledger Export (GL_12MONTHS_COMPLETE.csv)

**Purpose:** Complete audit trail of all accounting entries for 12-month period.

**Contents:**
- ALL rows from `ecritures_comptables_v2` for past 12 months
- Sorted by date, then account number

**Columns:**
```
date, account, debit, credit, description, journal, ref_folio, 
created_by, approved_by, created_at, fiscal_year, societe_name, account_name
```

**Validation:**
- ✓ SUM(debit) = SUM(credit) for each month
- ✓ All required audit fields populated
- ✓ No duplicate entries

**Output Location:** `/exports/GL_12MONTHS_COMPLETE.csv`

---

### 2. Monthly Trial Balance (TRIAL_BALANCE_12MONTHS.csv)

**Purpose:** Month-end account balances for closing and audit verification.

**Contents:**
- Account balances for last day of each month (12 months)
- Opening balances, closing balances, movements

**Columns:**
```
month_end_date, account_number, account_name, debit_balance, credit_balance, balance
```

**Validation:**
- ✓ Each month balances to 0.00 (SUM(debit) = SUM(credit))
- ✓ Account closings verified
- ✓ No missing months

**Output Location:** `/exports/TRIAL_BALANCE_12MONTHS.csv`

---

### 3. Monthly Summary Reports (MONTHLY_SUMMARIES.xlsx)

**Purpose:** Summary of revenue, expenses, assets, and liabilities by month.

**Format:** Excel workbook with 12 sheets (one per month)

**Sheets Include:**
1. **Revenue Summary**
   - Accounts: 706 (Sales), 707 (Services), 708 (Other Income)
   - Subtotals by account and month

2. **Expense Summary**
   - Accounts: All 6xxx accounts
   - Operating expenses breakdown
   - Subtotals by cost center

3. **Asset/Liability Summary**
   - Assets (1xxx-3xxx): Current & Fixed
   - Liabilities (4xxx): Payables, Loans, Taxes
   - Equity (5xxx): Capital, Reserves, Retained Earnings

**Output Location:** `/exports/MONTHLY_SUMMARIES.xlsx`

---

### 4. Data Quality Report (DATA_QUALITY_AUDIT.md)

**Purpose:** Comprehensive audit validation for Big 4 auditors.

**Sections:**

1. **Completeness**
   - % of transactions with all required fields
   - Missing fields: date, account, description, journal, creator
   - Zero-amount entries count

2. **Accuracy (Double-Entry Principle)**
   - % of transactions matching DR = CR
   - Total debits vs. total credits
   - Balance variance (should be 0.00)

3. **Reconciliation**
   - Unbalanced months
   - Unmatched receivables/payables
   - GL balance vs. bank balances

4. **Exceptions**
   - Suspicious entries
   - Large transactions (> 1,000,000 MUR)
   - Late entries
   - Missing audit fields

**Output Location:** `/exports/DATA_QUALITY_AUDIT.md`

---

## Technical Setup

### Directory Structure

```
/home/user/v0-lexora-accounting-saa-s/
├── supabase/
│   └── queries/
│       ├── 01_general_ledger_12months.sql
│       ├── 02_monthly_trial_balance.sql
│       ├── 03_monthly_summary_reports.sql
│       └── 04_data_quality_checks.sql
│   └── migrations/
│       └── 333_finance_extraction_functions.sql
├── scripts/
│   └── finance-extraction-agent.ts
├── exports/                         (created at runtime)
│   ├── GL_12MONTHS_COMPLETE.csv
│   ├── TRIAL_BALANCE_12MONTHS.csv
│   ├── MONTHLY_SUMMARIES.csv
│   └── DATA_QUALITY_AUDIT.md
└── docs/
    └── PHASE2_TASK2A_FINANCE_EXTRACTION.md (this file)
```

### SQL Components

#### 1. Raw Queries (supabase/queries/)

Pure SQL for manual execution or documentation:

- `01_general_ledger_12months.sql` - GL export with joins
- `02_monthly_trial_balance.sql` - Trial balance with validation
- `03_monthly_summary_reports.sql` - Summary by category
- `04_data_quality_checks.sql` - Audit checks

#### 2. Database Functions (Migration 333)

RPC-callable functions for TypeScript extraction:

```sql
-- Exports general ledger (12 months)
SELECT * FROM get_general_ledger_12months();

-- Exports trial balance (month-end)
SELECT * FROM get_monthly_trial_balance();

-- Exports summary reports
SELECT * FROM get_monthly_summary_reports();

-- Runs data quality checks
SELECT * FROM get_data_quality_checks();
```

### TypeScript Extraction Agent

**File:** `scripts/finance-extraction-agent.ts`

**Execution:**

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."

# Run extraction
npx ts-node scripts/finance-extraction-agent.ts
```

**Output:**
- Console logs showing progress
- CSV files in `/exports/`
- Markdown report in `/exports/`

**Features:**
- Validates double-entry principle
- Checks monthly balances
- Generates audit-quality CSV
- Creates summary report

---

## Database Schema

### Key Tables

#### `ecritures_comptables_v2` (General Ledger)
- `id` (UUID) - Entry ID
- `societe_id` (UUID) - Company
- `date_ecriture` (DATE) - Entry date
- `numero_compte` (TEXT) - Account code (4-digit)
- `debit_mur` (NUMERIC) - Debit amount in MUR
- `credit_mur` (NUMERIC) - Credit amount in MUR
- `description` (TEXT) - Entry description
- `journal` (TEXT) - Journal code (ACH, VTE, BNQ, SAL, OD)
- `ref_folio` (TEXT) - Reference number
- `created_by` (UUID) - Creator user ID
- `approved_by` (UUID) - Approver user ID
- `created_at` (TIMESTAMPTZ) - Creation timestamp
- `exercice` (TEXT) - Fiscal year (e.g., '2025-2026')

#### `plan_comptable_mauricien` (Chart of Accounts)
- `code_compte` (TEXT) - Account code
- `nom_compte` (TEXT) - Account name
- `classe` (INTEGER) - Account class (1-7)
- `type_compte` (TEXT) - Account type

#### `lettrages` (Matching)
- `id` (UUID) - Matching ID
- `ecriture_1_id` (UUID) - First entry
- `ecriture_2_id` (UUID) - Second entry
- `statut` (TEXT) - Status (lettres=matched, delettres=unmatched)

#### `profiles` (Users)
- `id` (UUID) - User ID
- `email` (TEXT) - Email address
- `role` (TEXT) - User role

---

## Account Structure (Mauritian PCM)

### Classes
- **1xxx-3xxx** - Assets
  - 1xxx - Fixed Assets
  - 2xxx - Current Assets
  - 3xxx - Stock/Inventory
- **4xxx** - Liabilities
  - 42xx - Payables
  - 44xx - Tax payables
  - 45xx - Salaries/Wages payable
  - 48xx - Loans
- **5xxx** - Equity
  - 51xx - Capital
  - 52xx - Reserves
  - 58xx - Retained Earnings
- **6xxx** - Expenses
  - 60xx - Materials
  - 61xx - Services
  - 62xx - Personnel
  - 63xx - Depreciation
  - 64xx - Finance costs
  - 65xx - Taxes
  - 66xx - Other expenses
- **7xxx** - Revenue
  - 706x - Sales
  - 707x - Services
  - 708x - Other income
  - 71xx - Grants/Subsidies
  - 75xx - Other income
  - 76xx - Finance income
  - 77xx - Extraordinary income

---

## Execution Steps

### Step 1: Apply Migration

```bash
# Connect to Supabase and apply migration 333
supabase migration up

# OR use Supabase CLI
cd /home/user/v0-lexora-accounting-saa-s
supabase db push
```

### Step 2: Verify Functions

```bash
# Test if functions exist
psql [connection] -c "
  SELECT routine_name 
  FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name LIKE 'get_%'
"
```

### Step 3: Run Extraction Agent

```bash
# From project root
npm run ts-node scripts/finance-extraction-agent.ts

# OR directly with npx
npx ts-node scripts/finance-extraction-agent.ts
```

### Step 4: Verify Outputs

```bash
# Check exports directory
ls -lh exports/

# Verify CSV structure
head -10 exports/GL_12MONTHS_COMPLETE.csv
head -10 exports/TRIAL_BALANCE_12MONTHS.csv

# View quality report
cat exports/DATA_QUALITY_AUDIT.md
```

---

## Validation Checklist

### Data Completeness
- [ ] All 12 months included
- [ ] No missing months
- [ ] All companies included (if multi-company)
- [ ] All required columns present

### Data Accuracy
- [ ] GL debits = GL credits
- [ ] Each month trial balance = 0
- [ ] Account names match chart of accounts
- [ ] No duplicate entries
- [ ] Dates in correct format

### Audit Trail
- [ ] created_by populated for all entries
- [ ] approved_by populated where required
- [ ] created_at timestamps consistent
- [ ] No future-dated entries
- [ ] No entries older than 12 months

### Format Compliance
- [ ] CSV files UTF-8 encoded
- [ ] No special characters causing issues
- [ ] Numeric values with 2 decimals
- [ ] Dates in YYYY-MM-DD format
- [ ] Null values handled consistently

---

## Troubleshooting

### Problem: "Unauthorized" Error

**Cause:** Supabase credentials not set

**Solution:**
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
npx ts-node scripts/finance-extraction-agent.ts
```

### Problem: GL Does Not Balance

**Cause:** Unbalanced entries in database

**Solution:**
```bash
# Run data quality checks
SELECT * FROM get_data_quality_checks() WHERE check_type = 'ACCURACY';

# Find problematic months
SELECT 
  DATE_TRUNC('month', date_ecriture)::DATE AS month,
  ABS(SUM(debit_mur) - SUM(credit_mur)) AS variance
FROM ecritures_comptables_v2
GROUP BY DATE_TRUNC('month', date_ecriture)
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01;
```

### Problem: Missing Accounts

**Cause:** Chart of accounts not complete

**Solution:**
```bash
# Update plan_comptable_mauricien
INSERT INTO plan_comptable_mauricien (code_compte, nom_compte, classe)
VALUES ('XXXX', 'Account Name', N);
```

### Problem: Trial Balance Does Not Match

**Cause:** Unmatched or unlettered entries

**Solution:**
```bash
# Find unlettered entries
SELECT * FROM get_data_quality_checks() 
WHERE metric LIKE '%Unmatched%';
```

---

## Output File Specifications

### GL_12MONTHS_COMPLETE.csv

**Record Count:** All entries for 12 months  
**Size Estimate:** 1-10 MB (depends on transaction volume)  
**Validation:** SUM(debit) = SUM(credit)

**Example:**
```
date,account,debit,credit,description,journal,ref_folio,created_by,approved_by,created_at,fiscal_year,societe_name,account_name
2025-06-01,5121,10000.00,0.00,Opening balance,BNQ,BANK-001,system@lexora.com,admin@lexora.com,2025-06-01T00:00:00Z,2025-2026,Lexora SA,Bank Account
2025-06-01,5100,0.00,10000.00,Opening balance,OD,OD-001,system@lexora.com,admin@lexora.com,2025-06-01T00:00:00Z,2025-2026,Lexora SA,Equity
```

### TRIAL_BALANCE_12MONTHS.csv

**Record Count:** 12 × (number of active accounts)  
**Size Estimate:** 100 KB - 1 MB  
**Validation:** Each month: SUM(debit_balance) = SUM(credit_balance)

**Example:**
```
month_end_date,account_number,account_name,debit_balance,credit_balance,balance
2025-06-30,1100,Fixed Assets,500000.00,0.00,500000.00
2025-06-30,1200,Equipment,250000.00,0.00,250000.00
2025-06-30,4210,Supplier Payables,0.00,125000.00,-125000.00
```

### DATA_QUALITY_AUDIT.md

**Format:** Markdown report  
**Size:** 5-20 KB  
**Audience:** Big 4 auditors

**Sections:**
- Executive summary
- Completeness metrics
- Accuracy checks
- Reconciliation status
- Exception list
- Recommendations

---

## Big 4 Audit Preparation

### Required Documents

1. ✓ General Ledger (12 months)
2. ✓ Trial Balance (month-end)
3. ✓ Journal entries (source: GL export)
4. ✓ Audit trail (created_by, approved_by fields)
5. ✓ Data quality certification

### Deliverables to Auditors

```
/exports/
├── GL_12MONTHS_COMPLETE.csv          → Audit team
├── TRIAL_BALANCE_12MONTHS.csv        → Audit team
├── MONTHLY_SUMMARIES.csv             → Audit team
├── DATA_QUALITY_AUDIT.md             → Audit report
└── AUDIT_RECONCILIATION_CHECKLIST.md → Sign-off
```

### Sign-off Process

1. Extract data using this agent
2. Run validation checks
3. Review DATA_QUALITY_AUDIT.md
4. Address any exceptions
5. Send to Big 4 audit team

---

## Timeline

| Week | Task | Owner | Status |
|------|------|-------|--------|
| W3 | Extract GL, TB, Summaries | Finance | ✓ Setup |
| W3 | Validate data quality | Tech | ✓ Ready |
| W3 | Generate audit report | Finance | ✓ Ready |
| W4 | Audit team review | Big 4 | Pending |
| W4 | Address exceptions | Finance | Pending |
| W4 | Final sign-off | Management | Pending |

---

## Contact

- **Tech Support:** Claude Code Agent
- **Finance Lead:** Finance team
- **Big 4 Audit Contact:** [Audit firm name]

---

**Last Updated:** 2026-05-22  
**Version:** 1.0  
**Status:** Ready for Deployment
