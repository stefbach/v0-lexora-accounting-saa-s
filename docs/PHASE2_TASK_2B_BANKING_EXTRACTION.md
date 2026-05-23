# PHASE 2, TASK 2B — Banking Extraction Agent
## Extract & Verify 12 Months of Bank Reconciliations for Auditor Review

**Timeline:** Weeks 3-4 (May 22 - June 4, 2026)  
**Effort:** 30 hours  
**Owner:** Finance ops team + Tech  
**Status:** Initial Planning

---

## 🎯 MISSION STATEMENT

Extract and verify 12 months of bank reconciliations for both bank accounts (MUR 512100 and EUR 512101) for a Big4 audit. Produce professional reconciliation reports suitable for auditor workpapers, ensuring 100% completeness and zero unmatched items > 30 days old.

---

## 📋 DELIVERABLES

### 1. Monthly Bank Reconciliation Reports (12 × 2 accounts = 24 reports)

**Format:** PDF, one per month per account  
**Output:** `/exports/BANK_RECS/[ACCOUNT]/[YYYY_MM]_RECONCILIATION.pdf`

**Content per report:**
- **Header:** Company name (DDS or OCC), Account number, Account currency, Period (YYYY-MM)
- **Bank Section:**
  - Bank name: MCB (Mauritius Commercial Bank)
  - Account: 512100 (MUR) or 512101 (EUR)
  - Statement date: Last day of month
  - Opening balance (1st of month)
  - Total deposits (credits) for period
  - Total withdrawals (debits) for period
  - **Bank statement balance (last day of month)**
  
- **GL Section:**
  - GL account number: 5121 (via plan_comptable_mauricien)
  - GL account name: "Comptes Bancaires MCB - [Currency]"
  - Opening balance (1st of month)
  - Total debits to account during period
  - Total credits to account during period
  - **GL account balance (last day of month)**

- **Reconciliation:**
  - Bank balance (as above)
  - Less: Pending deposits (in-transit, awaiting ledger entry)
  - Plus: Pending withdrawals/checks (accrued but not cleared)
  - **Reconciled GL balance**
  - Reconciliation difference: `|GL balance - Reconciled bank balance|`

- **Exception Handling:**
  - List unmatched transactions (status ≠ 'lettre') by:
    - Transaction date
    - Amount (in original currency + MUR equivalent)
    - Days outstanding (today - date_transaction)
    - Libelle_banque (bank description)
    - Manual note/justification
  - Flag any variance > 100 MUR in red
  - Document root cause for each variance

- **Sign-Off:**
  - Prepared by: [Comptable name]
  - Date prepared: [YYYY-MM-DD]
  - Reviewed by: [Finance manager name]
  - Date reviewed: [YYYY-MM-DD]

**SQL Source:**
```sql
-- GL Balance (per account, per month, per company)
SELECT 
  DATE_TRUNC('month', ec.date_ecriture)::date + interval '1 month' - interval '1 day' AS period_end,
  ec.societe_id,
  ec.numero_compte,
  SUM(CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE 0 END) AS total_debits,
  SUM(CASE WHEN ec.credit_mur > 0 THEN ec.credit_mur ELSE 0 END) AS total_credits,
  SUM(ec.debit_mur - ec.credit_mur) AS balance_mur
FROM ecritures_comptables_v2 ec
WHERE ec.numero_compte IN ('5121', '51210', '512100', '512101')  -- canonicalized by trigger
  AND DATE_TRUNC('month', ec.date_ecriture) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')  -- adjust for desired month
GROUP BY period_end, ec.societe_id, ec.numero_compte;

-- Bank Statement Balance (per account, per month)
SELECT
  rb.periode,
  rb.societe_id,
  rb.compte_bancaire_id,
  cb.numero_compte,
  cb.devise,
  rb.solde_ouverture,
  rb.total_credits,
  rb.total_debits,
  rb.solde_cloture,
  COUNT(tb.id) AS nb_transactions
FROM releves_bancaires rb
JOIN comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
LEFT JOIN transactions_bancaires tb ON tb.releve_id = rb.id
WHERE rb.societe_id = [SOCIETE_ID]
  AND rb.periode = 'YYYY-MM'  -- parameterized
GROUP BY rb.id, cb.id;

-- Unmatched Transactions (status ≠ 'lettre')
SELECT
  tb.id,
  tb.date_transaction,
  CURRENT_DATE - tb.date_transaction AS days_unmatched,
  tb.libelle_banque,
  tb.debit,
  tb.credit,
  tb.montant_mur,
  tb.devise_origine,
  tb.statut_lettrage,
  CASE WHEN CURRENT_DATE - tb.date_transaction > 30 THEN 'FLAG' ELSE 'OK' END AS audit_flag
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.compte_bancaire_id = [ACCOUNT_ID]
  AND tb.date_transaction >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')::date
  AND tb.date_transaction <= (DATE_TRUNC('month', NOW() - INTERVAL '1 month')::date + INTERVAL '1 month' - INTERVAL '1 day')::date
  AND tb.statut_lettrage != 'lettre'
ORDER BY tb.date_transaction ASC;
```

---

### 2. Transaction Matching Report

**Format:** CSV (Excel-compatible)  
**Output:** `/exports/BANK_MATCHING_SUMMARY.csv`  
**Scope:** All 12 months, both accounts

**Columns:**
| bank_tx_id | bank_tx_date | bank_amount | bank_currency | bank_libelle | gl_entry_id | gl_entry_date | gl_amount | gl_montant_mur | gl_journal | match_status | days_unmatched | justification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UUID | YYYY-MM-DD | 12345.67 | EUR | INT TRANSFER ABC | UUID or NULL | YYYY-MM-DD | 12345.67 | 210000.34 | BNQ | matched | 0 | Facture FAC-2025-001 |
| UUID | YYYY-MM-DD | 5000.00 | MUR | SALARY PAYMENT | UUID or NULL | NULL | NULL | NULL | NULL | unmatched | 45 | Manual verification needed |

**Row creation logic:**
1. For each transaction in `transactions_bancaires`:
   - If `statut_lettrage = 'lettre'` (linked to GL entry):
     - Find matching `ecritures_comptables_v2` entry via `lettrages` junction table
     - Match status: "matched"
     - Days unmatched: 0
   
   2. If `statut_lettrage = 'en_attente'` or `'manuel_suspend'`:
     - Find partial matches via:
       - Amount match (within 1% due to forex)
       - Date match (within 3 business days)
       - Libelle match (substring search with patterns)
     - If no match found: status = "unmatched"
     - Days unmatched: CURRENT_DATE - bank_tx_date
     - Flag if > 30 days old with 🚩

**SQL:**
```sql
-- Matched transactions (via lettrages)
SELECT
  tb.id AS bank_tx_id,
  tb.date_transaction AS bank_tx_date,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  COALESCE(tb.devise_origine, 'MUR') AS bank_currency,
  tb.libelle_banque,
  ec.id AS gl_entry_id,
  ec.date_ecriture AS gl_entry_date,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END AS gl_amount,
  CASE WHEN ec.debit_mur > 0 THEN ec.debit_mur ELSE ec.credit_mur END AS gl_montant_mur,
  ec.journal_code AS gl_journal,
  'matched' AS match_status,
  0 AS days_unmatched,
  COALESCE(l.notes, ec.reference) AS justification
FROM transactions_bancaires tb
LEFT JOIN lettrages l ON l.transaction_bancaire_id = tb.id
LEFT JOIN ecritures_comptables_v2 ec ON ec.id = l.ecriture_id
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01' AND tb.date_transaction <= '2026-06-30'
  AND l.id IS NOT NULL;

-- Unmatched transactions
SELECT
  tb.id AS bank_tx_id,
  tb.date_transaction AS bank_tx_date,
  CASE WHEN tb.debit > 0 THEN tb.debit ELSE tb.credit END AS bank_amount,
  COALESCE(tb.devise_origine, 'MUR') AS bank_currency,
  tb.libelle_banque,
  NULL AS gl_entry_id,
  NULL AS gl_entry_date,
  NULL AS gl_amount,
  NULL AS gl_montant_mur,
  NULL AS gl_journal,
  'unmatched' AS match_status,
  CURRENT_DATE - tb.date_transaction AS days_unmatched,
  CASE 
    WHEN CURRENT_DATE - tb.date_transaction > 30 THEN '🚩 AUDIT FLAG - ' || tb.libelle_banque
    ELSE tb.libelle_banque 
  END AS justification
FROM transactions_bancaires tb
WHERE tb.societe_id = [SOCIETE_ID]
  AND tb.date_transaction >= '2025-07-01' AND tb.date_transaction <= '2026-06-30'
  AND NOT EXISTS (
    SELECT 1 FROM lettrages l WHERE l.transaction_bancaire_id = tb.id
  )
ORDER BY tb.date_transaction DESC;
```

---

### 3. Bank Statement Images

**Format:** Original PDF statements from MCB  
**Output:** `/exports/BANK_STATEMENTS/[ACCOUNT]/[YYYY_MM].pdf`  
**Organization:**
```
/exports/BANK_STATEMENTS/
├── 512100_MUR/
│   ├── 2025_07.pdf
│   ├── 2025_08.pdf
│   ├── ...
│   └── 2026_06.pdf
└── 512101_EUR/
    ├── 2025_07.pdf
    ├── 2025_08.pdf
    ├── ...
    └── 2026_06.pdf
```

**Source:**
- Pull from `releves_bancaires.document_id` → `documents.file_path` in Supabase Storage
- Verify 12 consecutive months (FY2025-2026: July 2025 → June 2026)
- Ensure all account-month combinations have a statement
- Flag any missing statements

---

### 4. Reconciliation Variance Analysis

**Format:** Markdown report with CSV appendix  
**Output:** `/exports/RECONCILIATION_VARIANCES.md`

**Content:**
```markdown
# Reconciliation Variance Analysis — FY2025-2026

## Executive Summary
- Total months analyzed: 24 (2 accounts × 12 months)
- Variances found: [N]
- Variances > 100 MUR: [N] — flagged for manual review
- Average reconciliation time: [days]
- Outstanding items > 30 days: [N] — see detailed analysis

## Variance Detail

### Account 512100 (MUR) — MCB Main

**2025-07 (July 2025)**
- Bank statement balance: 1,234,567.89 MUR
- GL balance: 1,234,567.89 MUR
- Variance: 0.00 MUR ✅
- Status: BALANCED
- Notes: Clean reconciliation

**2025-08 (August 2025)**
- Bank statement balance: 2,345,678.90 MUR
- GL balance: 2,345,678.99 MUR
- Variance: 0.09 MUR ⚠️
- Status: MINOR VARIANCE
- Root cause: Rounding difference in forex conversion
- Correction: None required (< 1 MUR threshold)

**2025-09 (September 2025)**
- Bank statement balance: 3,000,000.00 MUR
- GL balance: 2,999,500.00 MUR
- Variance: 500.00 MUR 🚩
- Status: SIGNIFICANT VARIANCE
- Unmatched transactions:
  - 2025-09-15: Salary payment 250,000.00 (not yet in GL) — in-transit
  - 2025-09-22: Customer deposit 250,000.00 (not yet in GL) — in-transit
- Root cause: Two large transactions awaiting GL posting
- Correction: Post manual journal entry OD-2025-09-001
  - DR 5120 Banque (250,000 + 250,000)
  - CR 4210 Clients (250,000)
  - CR 4210 Clients (250,000)
- Correction date: 2025-09-30
- Post-correction variance: 0.00 MUR ✅

### Account 512101 (EUR) — MCB Forex

[Similar structure for EUR account]

## Summary Table

| Month | Account | Bank Bal | GL Bal | Variance | Flag | Status |
|---|---|---|---|---|---|---|
| 2025-07 | MUR | 1.23M | 1.23M | 0 | | ✅ |
| 2025-07 | EUR | 45K | 45K | 0 | | ✅ |
| 2025-08 | MUR | 2.34M | 2.34M | 0.09 | | ✅ |
| 2025-08 | EUR | 46K | 46K | 0 | | ✅ |
| ... | ... | ... | ... | ... | ... | ... |

## Outstanding Items > 30 Days (as of today)

| Tx Date | Bank Description | Amount | Days Out | Account | Action |
|---|---|---|---|---|---|
| 2025-07-15 | Customer XYZ Payment | 50,000 | 342 | MUR | 🚩 REQUIRES IMMEDIATE INVESTIGATION |
| 2025-07-20 | Supplier ABC Credit | (30,000) | 337 | MUR | 🚩 REQUIRES IMMEDIATE INVESTIGATION |

## Audit Conclusion

- **Completeness:** 24/24 months reconciled (100%)
- **Accuracy:** [N] variances > 100 MUR (all explained)
- **Outstanding items > 30 days:** [N] (all investigated)
- **Recommendation:** Ready for Big4 audit workpapers

---

**Prepared by:** [Comptable name]  
**Date:** 2026-06-04  
**Reviewed by:** [Finance Controller]  
**Date:** 2026-06-04  
**Signed:** ___________________________
```

---

## ✅ SUCCESS CRITERIA

### Quantitative
1. **Completeness:** 24/24 monthly reconciliations (2 accounts × 12 months)
   - Every reconciliation has valid bank statement and GL data
   - No missing months in July 2025 → June 2026 range

2. **Outstanding Items:** 0 unmatched transactions > 30 days old
   - All transactions > 30 days must be investigated and documented
   - Either matched to GL or marked as "justified exception"

3. **Balance Match:** Bank balance = GL balance (per account, per month)
   - After accounting for in-transit items
   - Variance tolerance: < 1 MUR (rounding)
   - Any variance > 100 MUR must be documented with root cause

4. **Documentation:** All 24 PDF reports + CSV summary + variance analysis complete
   - Zero missing reports
   - All sign-off fields populated
   - All narratives filled in

### Qualitative
5. **Audit-Ready:** Reports suitable for Big4 auditor workpapers
   - Professional formatting (letterhead, signatures)
   - Complete transaction detail (no summaries)
   - Clear narrative of exceptions
   - All supporting documents attached (bank statements)

6. **Accuracy:** All calculations verified
   - GL balance = SUM(debits - credits) for period
   - Bank balance matches bank statement document
   - Forex conversions at correct MCB rates
   - No data quality issues

---

## 🔧 IMPLEMENTATION ROADMAP

### Phase 1: Infrastructure Setup (Days 1-2, 4 hours)

**Task 1.1: Create export directory structure**
```bash
mkdir -p /exports/BANK_RECS/512100_MUR
mkdir -p /exports/BANK_RECS/512101_EUR
mkdir -p /exports/BANK_STATEMENTS/512100_MUR
mkdir -p /exports/BANK_STATEMENTS/512101_EUR
```

**Task 1.2: Create Node.js export service**
- New file: `app/api/exports/banking/route.ts`
- Handles:
  - PDF generation (using `pdf-lib` or similar)
  - CSV generation
  - File staging to S3 or local `/exports`
  - Audit trail logging

**Task 1.3: Create TypeScript types for exports**
- File: `lib/types/banking-export.ts`
```typescript
export interface BankReconciliationReport {
  societeId: string;
  compte_id: uuid;
  periode: string;
  bankStatementBalance: number;
  glBalance: number;
  variance: number;
  reconciliationDifference: number;
  outstandingDeposits: Transaction[];
  outstandingChecks: Transaction[];
  unmatchedTransactions: Transaction[];
  preparedBy: string;
  datePrepared: Date;
  reviewedBy?: string;
  dateReviewed?: Date;
}

export interface TransactionMatch {
  bank_tx_id: string;
  bank_tx_date: string;
  bank_amount: number;
  gl_entry_id?: string;
  match_status: 'matched' | 'unmatched' | 'partial';
  days_unmatched: number;
}
```

---

### Phase 2: Data Extraction (Days 3-5, 12 hours)

**Task 2.1: Build GL balance query service**
- File: `lib/banking/gl-balance-service.ts`
- Query `ecritures_comptables_v2` for:
  - Account 5121 (all variations: 5121, 51210, 512100, 512101)
  - Grouped by month-end
  - Per societe_id (DDS and OCC)
- Cache results in memory

**Task 2.2: Build bank statement query service**
- File: `lib/banking/bank-statement-service.ts`
- Query `releves_bancaires` for:
  - All 12 months (FY2025-2026)
  - All accounts (512100, 512101)
  - Extract: solde_cloture, total_debits, total_credits, nb_transactions

**Task 2.3: Build transaction matching service**
- File: `lib/banking/transaction-matcher.ts`
- Query `transactions_bancaires` + `lettrages` + `ecritures_comptables_v2`
- For each bank transaction:
  - Check if `lettrage` exists (matched)
  - Calculate days unmatched
  - Flag if > 30 days old
- Export to CSV

**Task 2.4: Build variance analysis service**
- File: `lib/banking/variance-analyzer.ts`
- For each month × account:
  - Calculate: bank_balance - gl_balance
  - Identify unmatched items explaining variance
  - Categorize:
    - In-transit deposits (awaiting GL posting)
    - Pending withdrawals (accrued not cleared)
    - Outstanding checks (issued not cashed)
    - Processing errors (to investigate)

---

### Phase 3: Report Generation (Days 6-8, 10 hours)

**Task 3.1: PDF reconciliation report generator**
- File: `lib/banking/pdf-generator.ts`
- Library: `pdfkit` or `pdf-lib`
- Generate per-account, per-month:
  - Header with company, account, period info
  - Bank section (statement balance details)
  - GL section (ledger balance details)
  - Reconciliation worksheet
  - Exception listing
  - Sign-off section

**Task 3.2: CSV export generator**
- File: `lib/banking/csv-generator.ts`
- Generate BANK_MATCHING_SUMMARY.csv:
  - Headers: bank_tx_id, bank_tx_date, bank_amount, ... , justification
  - One row per transaction (matched or unmatched)
  - Audit flags for > 30 days old

**Task 3.3: Variance analysis markdown generator**
- File: `lib/banking/variance-report-generator.ts`
- Generate markdown with:
  - Executive summary
  - Monthly detail
  - Summary table
  - Outstanding items section
  - Audit conclusion

**Task 3.4: API endpoint for bulk export**
- File: `app/api/exports/banking/reconciliations/route.ts`
- POST endpoint
- Body: `{ societe_ids: [], start_date, end_date, format: 'pdf'|'csv'|'all' }`
- Returns: download URL or streams files
- Logs audit trail

---

### Phase 4: Data Validation & QA (Days 9-10, 4 hours)

**Task 4.1: Completeness validation**
```typescript
// Check: 24 reconciliations exist (2 accounts × 12 months)
const requiredMonths = 12;
const requiredAccounts = 2;
const actualReports = reconciliationReports.length;
if (actualReports !== requiredMonths * requiredAccounts) {
  throw new Error(`Missing reconciliations: expected ${requiredMonths * requiredAccounts}, found ${actualReports}`);
}
```

**Task 4.2: Balance match validation**
```typescript
// Check: Bank balance = GL balance (after adjustments)
for (const rec of reconciliations) {
  const adjustedGlBalance = rec.glBalance 
    + rec.outstandingDeposits.reduce((sum, tx) => sum + tx.amount, 0)
    - rec.outstandingChecks.reduce((sum, tx) => sum + tx.amount, 0);
  
  if (Math.abs(rec.bankBalance - adjustedGlBalance) > 1.00) {
    console.warn(`Variance in ${rec.periode}: ${rec.bankBalance - adjustedGlBalance}`);
  }
}
```

**Task 4.3: Outstanding items validation**
```typescript
// Check: No unmatched items > 30 days old
const oldItems = reconciliations.flatMap(rec => rec.unmatchedTransactions)
  .filter(tx => daysSince(tx.date) > 30);

if (oldItems.length > 0) {
  throw new Error(`${oldItems.length} unmatched items > 30 days old. Must investigate.`);
}
```

**Task 4.4: Manual review checklist**
- Spot-check 5 months:
  - Verify PDF calculations manually
  - Compare to actual bank statements
  - Verify GL entries posted correctly
  - Check sign-offs are complete

---

## 📊 DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│         PHASE 2B: BANKING EXTRACTION PIPELINE               │
└─────────────────────────────────────────────────────────────┘

INPUT:
  Releves Bancaires (12 months) → releves_bancaires table
  GL Entries (FY2025-2026) → ecritures_comptables_v2 table
  Bank Transactions → transactions_bancaires table
  Lettrages (matches) → lettrages table

┌──────────────────────────────────────────────────────────────┐
│ EXTRACTION LAYER                                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  gl-balance-service.ts                                       │
│  ├─ Query EC_v2 for account 5121/512100/512101              │
│  ├─ Group by month-end, societe_id                          │
│  └─ Return: { month, glBalance, totalDebits, totalCredits } │
│                                                               │
│  bank-statement-service.ts                                   │
│  ├─ Query releves_bancaires for 12 months                   │
│  ├─ Join to comptes_bancaires for account #                 │
│  └─ Return: { month, bankBalance, totalDebits, totalCredits }│
│                                                               │
│  transaction-matcher.ts                                      │
│  ├─ Query transactions_bancaires + lettrages                │
│  ├─ For each bank tx: check if matched via lettrage         │
│  └─ Return: matched[], unmatched[]                           │
│                                                               │
│  variance-analyzer.ts                                        │
│  ├─ Compare: bankBalance vs glBalance per month             │
│  ├─ Identify: in-transit, pending, outstanding              │
│  └─ Return: variance details + root causes                   │
│                                                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ GENERATION LAYER                                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  pdf-generator.ts                                            │
│  ├─ FOR EACH (account, month):                              │
│  │   ├─ Create 1-page PDF report                            │
│  │   ├─ Fill in: bank bal, GL bal, reconciliation, sign-off │
│  │   └─ Save to /exports/BANK_RECS/[ACCOUNT]/[YYYY_MM].pdf  │
│  └─ OUTPUT: 24 PDFs                                          │
│                                                               │
│  csv-generator.ts                                            │
│  ├─ Create CSV headers                                       │
│  ├─ FOR EACH bank transaction (matched + unmatched):        │
│  │   └─ Write row to CSV                                    │
│  └─ OUTPUT: /exports/BANK_MATCHING_SUMMARY.csv              │
│                                                               │
│  variance-report-generator.ts                                │
│  ├─ Build markdown sections                                 │
│  ├─ Insert monthly detail + summary table                   │
│  ├─ Insert outstanding items > 30 days                      │
│  └─ OUTPUT: /exports/RECONCILIATION_VARIANCES.md            │
│                                                               │
│  document-retriever.ts                                       │
│  ├─ FOR EACH releve_bancaire:                               │
│  │   ├─ Get document_id                                     │
│  │   ├─ Download PDF from Supabase Storage                  │
│  │   └─ Copy to /exports/BANK_STATEMENTS/[ACCOUNT]/         │
│  └─ OUTPUT: 24 PDFs (original bank statements)              │
│                                                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ VALIDATION LAYER                                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ✓ Completeness: 24 reconciliations exist                   │
│  ✓ Accuracy: Bank bal = GL bal (per month)                  │
│  ✓ Timeliness: 0 unmatched items > 30 days                  │
│  ✓ Documentation: All PDFs, CSVs, MD files generated        │
│                                                               │
└──────────────────────────────────────────────────────────────┘

OUTPUT:
  /exports/BANK_RECS/512100_MUR/*.pdf (12 files)
  /exports/BANK_RECS/512101_EUR/*.pdf (12 files)
  /exports/BANK_STATEMENTS/512100_MUR/*.pdf (12 files)
  /exports/BANK_STATEMENTS/512101_EUR/*.pdf (12 files)
  /exports/BANK_MATCHING_SUMMARY.csv (1 file)
  /exports/RECONCILIATION_VARIANCES.md (1 file)
  
TOTAL: 53 files (24 + 24 + 1 + 1 + 2 bank statement + 1 CSV)
```

---

## 🔑 KEY TECHNICAL NOTES

### 1. Account Number Mapping
The system uses canonical 4-digit codes per `plan_comptable_mauricien`:
- **Account:** 5121 (Comptes bancaires)
- **Sub-accounts:** 51210 (legacy), 512100 (MUR), 512101 (EUR)

The trigger `tr_ecritures_remap_pcm` auto-canonicalizes any entry to 4-digit code.

### 2. GL Balance Calculation
```sql
SELECT 
  SUM(debit_mur) - SUM(credit_mur) as balance
FROM ecritures_comptables_v2
WHERE numero_compte = '5121'  -- canonicalized
  AND societe_id = ?
  AND DATE_TRUNC('month', date_ecriture) = ?;
```

**Important:** Always use `debit_mur` and `credit_mur` (never `debit` or `credit` which may be NULL).

### 3. Forex Handling
- Transactions may have `devise_origine` (EUR, USD, GBP) and `montant_origine`
- Always reconcile in **both** original currency AND MUR
- MCB exchange rates stored in `taux_change_historique` table
- Flag if rate changed after transaction date

### 4. Lettrage (Matching) Tracking
Matched transactions linked via `lettrages` junction table:
```sql
CREATE TABLE lettrages (
  id UUID PRIMARY KEY,
  transaction_bancaire_id UUID REFERENCES transactions_bancaires(id),
  ecriture_id UUID REFERENCES ecritures_comptables_v2(id),
  montant_lettre NUMERIC(15,2),
  date_lettrage TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ
);
```

### 5. In-Transit Items
Two categories:
- **Pending deposits:** Bank received payment but GL not yet posted (awaiting invoice receipt or clearance)
- **Outstanding checks:** GL accrued expense but not yet cleared by bank (check still in float)

Mark these in reconciliation with code like:
- `OT-DEP-[YYYY-MM-DD]` (outstanding deposit)
- `OT-CHK-[YYYY-MM-DD]` (outstanding check)

---

## 🚀 EXECUTION TIMELINE

| Week | Days | Task | Hours | Owner |
|---|---|---|---|---|
| **Week 3** | Mon-Tue (May 22-23) | Phase 1: Infrastructure setup | 4 | Tech |
| | Wed-Fri (May 24-26) | Phase 2: Data extraction services | 12 | Tech |
| **Week 4** | Mon-Wed (May 29-31) | Phase 3: Report generation | 10 | Tech |
| | Thu-Fri (Jun 1-2) | Phase 4: Validation & QA | 4 | Finance + Tech |
| **After** | (Jun 3-4) | Final review & sign-off | 0 (buffer) | Finance Controller |

**Total effort:** 30 hours (matches estimate)

---

## 📋 DEPENDENCIES & PREREQUISITES

**Must-Have:**
- All 12 months of bank statements uploaded to `releves_bancaires`
- GL entries (7/1/2025 - 6/30/2026) in `ecritures_comptables_v2`
- `lettrages` table populated with known matches (at least 80% of transactions)
- `transactions_bancaires` records created from OCR extraction

**Nice-to-Have:**
- `taux_change_historique` populated (for forex reconciliation detail)
- `comptes_bancaires` with correct currency codes
- Finance team training on "unmatched item resolution" process

---

## 🎁 DELIVERABLES CHECKLIST

- [ ] 24 PDF reconciliation reports (12 months × 2 accounts)
  - [ ] Account 512100 (MUR): 12 files in `/exports/BANK_RECS/512100_MUR/`
  - [ ] Account 512101 (EUR): 12 files in `/exports/BANK_RECS/512101_EUR/`
- [ ] CSV transaction matching summary
  - [ ] File: `/exports/BANK_MATCHING_SUMMARY.csv`
  - [ ] Contains: all 12 × 2 accounts worth of transactions
- [ ] 24 Bank statement PDFs (original documents)
  - [ ] Account 512100: 12 files in `/exports/BANK_STATEMENTS/512100_MUR/`
  - [ ] Account 512101: 12 files in `/exports/BANK_STATEMENTS/512101_EUR/`
- [ ] Variance analysis report
  - [ ] File: `/exports/RECONCILIATION_VARIANCES.md`
  - [ ] Contains: executive summary + monthly detail + outstanding items > 30 days
- [ ] Success metrics
  - [ ] 24/24 monthly reconciliations complete ✅
  - [ ] 0 unmatched items > 30 days old ✅
  - [ ] Bank balance = GL balance (per account, per month) ✅
  - [ ] All documentation and sign-offs complete ✅
  - [ ] Audit-ready for Big4 review ✅

---

## 🔗 RELATED DOCUMENTATION

- **Master Plan:** LEXORA_MASTER_PLAN.md (Sprint 3 - Bank Reconciliation)
- **Schema Reference:** supabase/SCHEMA.md (tables: releves_bancaires, transactions_bancaires, lettrages)
- **Rapprochement Rules:** lexora-rapprochement-rules skill (R1-R7 classification)
- **Action Plan:** PLAN_ACTION_OUTIL_PARFAIT.md (Task 2.1 - Historical Data Extraction)

---

*Last updated: 2026-05-22*  
*Status: Initial Planning | Target completion: 2026-06-04*
