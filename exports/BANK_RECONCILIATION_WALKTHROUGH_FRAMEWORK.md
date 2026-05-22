# PHASE 4, Task 4B — BANK RECONCILIATION WALKTHROUGH AGENT
## Comprehensive Testing & Documentation Framework

**Timeline:** Weeks 7-8  
**Effort:** 20 hours  
**Owner:** Finance Ops + Tech  
**Date Prepared:** 2026-05-22

---

## MISSION STATEMENT

Verify bank reconciliation procedures work correctly through comprehensive testing of 3 months (Jan, Jun, Dec) across a 12-month period, including lettrage validation, outstanding items aging, multi-currency reconciliation, and exception handling.

**Success Criteria:**
- 3 detailed monthly reconciliations completed and documented
- 100% of transactions lettraged successfully (no orphaned entries)
- 0 outstanding items > 30 days old
- Bank balance = GL balance (all months, all accounts)
- All exceptions documented and corrected
- Auditor-ready documentation

---

## DELIVERABLES STRUCTURE

### 1. BANK_RECON_WALKTHROUGHS_3MONTHS.pdf
Detailed reconciliation walkthroughs for Jan (Month 1), Jun (Month 6), Dec (Month 12).

**Format per month:**

```
MONTH: [January | June | December]
YEAR: 2025 [or applicable fiscal year]
DATE: [As at 31-Jan / 30-Jun / 31-Dec]

A. BANK STATEMENT DETAILS
   - Bank: [MCB / Banque / etc.]
   - Account: [IBAN / Account Number]
   - Currency: [MUR / EUR / etc.]
   - Opening Balance: [amount]
   - Total Credits (Deposits):  [amount]
   - Total Debits (Payments):   [amount]
   - Closing Balance (Per Bank): [amount]
   - Date Range: [01-XXX to 31-XXX]

B. GENERAL LEDGER RECONCILIATION
   - GL Account Code: [5121 / 5122 / etc.]
   - GL Account Name: [e.g., "Bank Account MCB MUR"]
   - GL Opening Balance:  [amount]
   - Total Debits (GL):   [amount]
   - Total Credits (GL):  [amount]
   - GL Closing Balance:  [amount]

C. RECONCILIATION FORMULA
   Bank Balance (Per Bank)              = [X]
   Add: Deposits in Transit             = [+Y]
   Less: Outstanding Cheques/Transfers  = [-Z]
   Reconciled Balance                   = [X + Y - Z]
   
   GL Balance (Per GL)                  = [X + Y - Z]  ✓ MATCH

D. UNCLEARED ITEMS IDENTIFIED
   
   Deposits in Transit (Not on Bank):
   ├─ Item 1: [Date] [Description] [Amount] [Ref]
   ├─ Item 2: [Date] [Description] [Amount] [Ref]
   └─ Item N: [Date] [Description] [Amount] [Ref]
   
   Outstanding Payments (Not on Bank):
   ├─ Item 1: [Date] [Description] [Amount] [Ref]
   ├─ Item 2: [Date] [Description] [Amount] [Ref]
   └─ Item N: [Date] [Description] [Amount] [Ref]

E. MANUAL LETTRAGE ENTRIES (GL 212xx Accounts)
   ├─ Lettre Code: [AUTO0001 / MAN0001 / etc.]
   ├─ GL Entry: [Account] [Description] [Amount]
   ├─ Bank Match: [Bank Tx Ref] [Amount] [Date]
   ├─ Match Result: ✓ MATCH / ⚠ VARIANCE / ✗ MISMATCH
   ├─ Days to Clear: [0-5 days / 5-10 days / etc.]
   └─ Status: [Lettered / Pending]

F. RECONCILIATION SIGN-OFF
   ├─ Prepared By: [Name / Role]
   ├─ Reviewed By: [Name / Role]
   ├─ Date Completed: [YYYY-MM-DD]
   ├─ Any Exceptions: [YES / NO]
   ├─ All Items < 30 Days: [YES / NO]
   └─ Ready for Audit: [YES / NO / WITH COMMENTS]
```

---

### 2. LETTRAGE_VERIFICATION.csv

CSV file listing all lettered entries with validation status.

**Columns:**
| Field | Description |
|-------|-------------|
| `lettre_code` | Lettrage identifier (e.g., AUTO0001) |
| `gl_account` | GL account number (212xxx) |
| `gl_ref_folio` | GL reference (e.g., FAC-xxxxx or BANK-xxxxx) |
| `gl_date` | GL entry date |
| `gl_amount_mur` | GL amount in MUR |
| `bank_tx_ref` | Bank transaction reference |
| `bank_date` | Bank transaction date |
| `bank_amount_mur` | Bank amount in MUR |
| `amount_match` | ✓ EXACT / ⚠ <1 CENT / ✗ MISMATCH |
| `date_variance_days` | Days between GL and bank dates |
| `within_5bd` | Y/N — within 5 business days? |
| `facture_id` | Linked invoice ID (if applicable) |
| `status` | LETTERED / ORPHANED / PENDING |
| `notes` | Comments (variance reason, etc.) |

**Summary Rows:**
- `TOTAL_LETTERED`: Count of fully lettered transactions
- `TOTAL_ORPHANED`: Count of orphaned GL entries without bank match
- `TOTAL_PENDING`: Count of pending matches
- `PRCNT_MATCHED`: % of transactions successfully lettered

---

### 3. OUTSTANDING_ITEMS_AGING.xlsx

Excel workbook with aging analysis of unmatched transactions.

**Sheet 1: Outstanding Deposits (Credits not yet on Bank)**

| Date | Description | Ref | Amount MUR | Days Outstanding | Reason for Delay | Action Taken | Follow-up Required |
|------|-------------|-----|-----------|------------------|------------------|--------------|-------------------|
| 15-Jan | Customer payment ABC | INV-001 | 50,000 | 5 | In processing | None | N - within normal range |
| 20-Jan | Transfer OCC | INT-TX-001 | 100,000 | 2 | Expected within 3 days | None | Monitor |
| ... | ... | ... | ... | ... | ... | ... | ... |
| **Summary:** | **Total in Transit** | | **[Amount]** | **Max Age:** | | | |

**Sheet 2: Outstanding Payments (Debits not yet on Bank)**

| Date | Description | Ref | Amount MUR | Days Outstanding | Reason for Delay | Action Taken | Follow-up Required |
|------|-------------|-----|-----------|------------------|------------------|--------------|-------------------|
| 10-Jan | Cheque #1234 | CHK-1234 | 25,000 | 10 | Clearing time | None | N - normal |
| 18-Jan | Transfer to Supplier | PO-5678 | 150,000 | 3 | ACH processing | None | Monitor |
| ... | ... | ... | ... | ... | ... | ... | ... |
| **Summary:** | **Total Outstanding** | | **[Amount]** | **Max Age:** | | | |

**Sheet 3: Aging Summary**

| Age Category | Count | Total Amount | Status |
|--------------|-------|--------------|--------|
| 0-5 days | [N] | [Amount] | ✓ Normal |
| 6-10 days | [N] | [Amount] | ✓ Normal |
| 11-20 days | [N] | [Amount] | ⚠ Monitor |
| 21-30 days | [N] | [Amount] | ⚠ Investigate |
| 31+ days | [N] | [Amount] | ✗ Overdue |
| **TOTALS** | [N] | [Amount] | |

**Success Criteria:** No items > 30 days old (or documented as expected delays)

---

### 4. CURRENCY_RECONCILIATION.md

Multi-currency reconciliation report (MUR vs EUR).

**Format:**

```markdown
# Currency Reconciliation Report
## As at [Date]

## Account 512100 (MUR - Primary)

### Bank Statement (MUR)
- Bank Name: MCB
- Opening Balance: [Amount] MUR
- Credits (Deposits): [Amount] MUR
- Debits (Payments): [Amount] MUR
- Closing Balance (Bank): [Amount] MUR

### General Ledger (MUR)
- GL Account: 5121 (Bank - MUR)
- Opening Balance: [Amount] MUR
- Total Debits (GL): [Amount] MUR
- Total Credits (GL): [Amount] MUR
- Closing Balance (GL): [Amount] MUR

### Reconciliation
- Bank Balance: [Amount] MUR
- Less: Outstanding items: [-Amount] MUR
- Reconciled Balance: [Amount] MUR
- GL Balance: [Amount] MUR
- **Status:** ✓ RECONCILED

---

## Account 512101 (EUR - Secondary)

### Bank Statement (EUR)
- Bank Name: MCB-EUR
- Opening Balance: [Amount] EUR
- Credits (Deposits): [Amount] EUR
- Debits (Payments): [Amount] EUR
- Closing Balance (Bank): [Amount] EUR

### General Ledger (EUR)
- GL Account: 5122 (Bank - EUR)
- Opening Balance: [Amount] EUR
- Total Debits (GL): [Amount] EUR
- Total Credits (GL): [Amount] EUR
- Closing Balance (GL): [Amount] EUR

### Conversion to MUR
- Exchange Rate Applied (as at month-end): [Rate]
- Source of Rate: [Bank / Historical / Manual]
- GL Converted Amount: [Amount] MUR

### Reconciliation
- Bank Balance (EUR): [Amount] EUR
- Converted to MUR: [Amount] MUR
- GL Balance (MUR equivalent): [Amount] MUR
- **Status:** ✓ RECONCILED

---

## Cross-Account Verification
- Total MUR Accounts: [Sum] MUR
- Total EUR Accounts: [Sum] EUR converted to [Amount] MUR
- No double-counting detected: ✓ YES
- All conversions consistent with historical rates: ✓ YES

## Compliance Notes
- All exchange rates logged with source and date
- No unauthorized currency conversions detected
- EUR purchases properly classified to 4457 (Reverse Charge) if applicable
- Ready for audit: ✓ YES
```

---

### 5. RECONCILIATION_EXCEPTIONS.md

Documentation of any exceptions found and corrections applied.

**Format:**

```markdown
# Bank Reconciliation Exceptions Report
## 12-Month Period Ending 30 June 2025

## Summary
- Total Exceptions Found: [N]
- Root Causes Identified: [N]
- Corrections Applied: [N]
- Open/Unresolved: [N]

---

## EXCEPTION #001

**Detection Date:** [Date discovered]  
**Month/Account:** [Jan 2025 / 512100-MUR]  
**Description:** [Clear description of what was wrong]

### Root Cause Analysis
- **Primary Cause:** [Bank error / GL error / Timing issue / Data entry error]
- **Supporting Evidence:** 
  - Bank statement shows [Description] with ref [Ref]
  - GL shows [Description] with date [Date]
  - Variance: [Amount] MUR (±X%)

### Correction Applied
- **Action:** [Manual journal entry / Bank memo / GL reversal]
- **Correction Entry:**
  ```
  Date: [Date]
  Journal: [VTE / ACH / BNQ / OD]
  Debit: [Account] [Amount]
  Credit: [Account] [Amount]
  Description: Correction for [ref]
  ```
- **Approval:** [Name / Auth]
- **Date Applied:** [Date]

### Verification
- ✓ Reconciliation balance verified post-correction
- ✓ No duplicate entries created
- ✓ Exception fully resolved

---

## EXCEPTION #002
[Repeat structure for each exception]

---

## Summary by Category

| Category | Count | Resolved | Status |
|----------|-------|----------|--------|
| Bank Errors (incorrect statement) | N | N | [Status] |
| GL Errors (wrong posting) | N | N | [Status] |
| Timing Issues (legitimate delays) | N | N | [Status] |
| Data Entry Errors | N | N | [Status] |
| **TOTAL** | N | N | |

## Audit Trail
- All corrections have supporting documentation
- Corrections logged in cron_logs / audit_trail
- Ready for auditor review: ✓ YES
```

---

## TESTING APPROACH

### Phase 1: Data Preparation
1. Identify 3 test months: **January (Month 1), June (Month 6), December (Month 12)**
2. For each month:
   - Export bank statement from MCB (if real data) or use test data
   - Verify GL account balances (accounts 512x for bank)
   - List all transactions with status (cleared vs. pending)

### Phase 2: Manual Reconciliation
1. **Start with Bank Balance (Per Bank)**
   - Get closing balance from bank statement
   
2. **Identify Uncleared Items**
   - Scan bank statement for items that appeared AFTER month-end
   - Scan GL for items that haven't appeared on bank yet
   - Classify: in-transit deposits vs. outstanding payments

3. **Apply Lettrage Rules (R1-R7)**
   - R1: Customer payment ↔ invoice match (account 411)
   - R2: Supplier payment ↔ invoice match (account 401)
   - R3: Payroll payment ↔ salary obligation (account 4210)
   - R5: Internal transfers (mark as interne, no BNQ)
   - R7: CCA (compte courant associé) cross-match
   
4. **Create GL Entries**
   - Generate BNQ (journal bancaire) entries per lettered item
   - Verify no duplicates (check `ref_folio` uniqueness)
   - Confirm debit/credit balance

5. **Final Reconciliation**
   - Bank Balance + Deposits in Transit - Outstanding Checks = GL Balance
   - Must balance to the cent

### Phase 3: Data Validation
1. Check lettrage codes (no orphaned entries)
2. Verify all GL entries have corresponding bank transaction within ±5 business days
3. Confirm multi-currency accounts reconcile separately
4. Document any exceptions

### Phase 4: Documentation
1. Screenshot each step (UI confirmation)
2. Export GL balances (CSV)
3. Create reconciliation summary (PDF)
4. Log any discrepancies

---

## KEY ACCOUNTS TO MONITOR

### Bank Accounts (212xx class — Balance Sheet)
- **5121**: Bank Account - MUR (Primary)
- **5122**: Bank Account - EUR (Secondary, if applicable)

### Matching/Lettrage Accounts (4xx class — Tiers)
- **411x**: Clients (debtors - AR)
- **401x**: Fournisseurs (creditors - AP)
- **4210**: Rémunérations dues (payroll liability)
- **431x**: Social contributions (CSG/NSF)
- **4457**: Reverse Charge (if EU purchases)

### BNQ Entry Accounts (per transaction type)
| Transaction Type | Debit Account | Credit Account | Journal |
|------------------|---------------|-----------------|---------|
| Customer payment | 5121 (bank) | 411x (client) | BNQ |
| Supplier payment | 401x (supplier) | 5121 (bank) | BNQ |
| Salary payment | 4210 (payroll) | 5121 (bank) | BNQ |
| Internal transfer | 5121a (from) | 5121b (to) | BNQ |
| CCA distribution | 5121 (bank) | CCA (debt) | BNQ |

---

## TOOLS & SCRIPTS AVAILABLE

### API Endpoints (Lexora)
- `GET /api/comptable/releves-bancaires` — fetch bank statements
- `GET /api/comptable/rapprochement/[societe_id]` — get reconciliation status
- `POST /api/comptable/rapprochement` with `action: 'auto_rapprocher'` — auto-reconcile
- `POST /api/comptable/rapprochement` with `action: 'lettrer_multi'` — manual lettrage
- `GET /api/comptable/transactions` — fetch transactions by account/period

### SQL Queries
See [DB Queries Section](#database-queries) below.

### Export Tools
- Node.js script: `scripts/export-reconciliation.mjs` (creates CSVs)
- Supabase CLI: `supabase inspect db` (schema verification)

---

## DATABASE QUERIES

### 1. Get All Bank Transactions for Month
```sql
SELECT 
  rb.id as releve_id,
  rb.periode,
  tx->>'date' as transaction_date,
  tx->>'libelle' as description,
  COALESCE((tx->'debit')::numeric, 0) as debit_amount,
  COALESCE((tx->'credit')::numeric, 0) as credit_amount,
  tx->>'statut' as status,
  tx->>'lettre' as lettre_code,
  tx->>'facture_id' as facture_id
FROM releves_bancaires rb
CROSS JOIN LATERAL jsonb_array_elements(rb.transactions_json) AS tx
WHERE rb.societe_id = '[SOCIETE_ID]'
  AND rb.compte_bancaire_id = '[COMPTE_ID]'
  AND (tx->>'date')::date >= '2025-01-01'
  AND (tx->>'date')::date <= '2025-01-31'
ORDER BY (tx->>'date')::date;
```

### 2. Get GL Balance for Account & Period
```sql
SELECT 
  numero_compte,
  nom_compte,
  SUM(CASE WHEN debit_mur > 0 THEN debit_mur ELSE 0 END) as total_debits,
  SUM(CASE WHEN credit_mur > 0 THEN credit_mur ELSE 0 END) as total_credits,
  SUM(debit_mur) - SUM(credit_mur) as balance_mur
FROM ecritures_comptables_v2
WHERE societe_id = '[SOCIETE_ID]'
  AND numero_compte IN ('5121', '5122')
  AND DATE_TRUNC('month', date_ecriture) = '2025-01-01'::date
GROUP BY numero_compte, nom_compte;
```

### 3. Check Lettrage Completeness
```sql
SELECT 
  COUNT(*) as total_entries,
  SUM(CASE WHEN lettre IS NOT NULL THEN 1 ELSE 0 END) as lettered_entries,
  SUM(CASE WHEN lettre IS NULL THEN 1 ELSE 0 END) as unlettered_entries,
  ROUND(100.0 * SUM(CASE WHEN lettre IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as prcnt_lettered
FROM ecritures_comptables_v2
WHERE societe_id = '[SOCIETE_ID]'
  AND journal = 'BNQ'
  AND DATE_TRUNC('month', date_ecriture) = '2025-01-01'::date;
```

### 4. Find Orphaned Lettrage Entries
```sql
SELECT 
  e.id,
  e.ref_folio,
  e.numero_compte,
  e.libelle,
  e.date_ecriture,
  e.debit_mur,
  e.credit_mur,
  e.lettre,
  'ORPHANED' as status
FROM ecritures_comptables_v2 e
WHERE e.societe_id = '[SOCIETE_ID]'
  AND e.lettre IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_comptables_v2 e2
    WHERE e2.lettre = e.lettre
    AND e2.societe_id = e.societe_id
    AND e2.id != e.id
    AND DATE_ABS(EXTRACT(DAY FROM e2.date_ecriture - e.date_ecriture)) <= 5
  );
```

### 5. Outstanding Items > 30 Days
```sql
SELECT 
  rb.id,
  (tx->>'date')::date as tx_date,
  tx->>'libelle' as description,
  COALESCE((tx->'debit')::numeric, 0) + COALESCE((tx->'credit')::numeric, 0) as amount,
  CURRENT_DATE - (tx->>'date')::date as days_outstanding,
  tx->>'statut' as status
FROM releves_bancaires rb
CROSS JOIN LATERAL jsonb_array_elements(rb.transactions_json) AS tx
WHERE rb.societe_id = '[SOCIETE_ID]'
  AND (tx->>'statut' NOT IN ('rapproche', 'interne', 'lettre'))
  AND CURRENT_DATE - (tx->>'date')::date > 30
ORDER BY days_outstanding DESC;
```

---

## CHECKLIST FOR SIGN-OFF

- [ ] Month 1 (January) reconciliation completed
  - [ ] Bank balance obtained
  - [ ] GL balance calculated
  - [ ] Uncleared items identified
  - [ ] All items lettered (100%)
  - [ ] Balance reconciles to the cent
  - [ ] No exceptions or all documented
  - [ ] Ready for audit

- [ ] Month 6 (June) reconciliation completed
  - [ ] Bank balance obtained
  - [ ] GL balance calculated
  - [ ] Uncleared items identified
  - [ ] All items lettered (100%)
  - [ ] Balance reconciles to the cent
  - [ ] No exceptions or all documented
  - [ ] Ready for audit

- [ ] Month 12 (December) reconciliation completed
  - [ ] Bank balance obtained
  - [ ] GL balance calculated
  - [ ] Uncleared items identified
  - [ ] All items lettered (100%)
  - [ ] Balance reconciles to the cent
  - [ ] No exceptions or all documented
  - [ ] Ready for audit

- [ ] Lettrage Verification (LETTRAGE_VERIFICATION.csv)
  - [ ] All lettered entries extracted
  - [ ] Amounts match bank ± 1 cent
  - [ ] Dates within ±5 business days
  - [ ] No orphaned entries
  - [ ] % matched calculated

- [ ] Outstanding Items Aging (OUTSTANDING_ITEMS_AGING.xlsx)
  - [ ] All outstanding deposits listed
  - [ ] All outstanding payments listed
  - [ ] Days outstanding calculated
  - [ ] No items > 30 days old (or documented)
  - [ ] Aging summary completed

- [ ] Currency Reconciliation (CURRENCY_RECONCILIATION.md)
  - [ ] MUR account (512100) reconciled
  - [ ] EUR account (512101) reconciled (if applicable)
  - [ ] Exchange rates documented
  - [ ] No double-counting
  - [ ] Ready for audit

- [ ] Exception Handling (RECONCILIATION_EXCEPTIONS.md)
  - [ ] All discrepancies documented
  - [ ] Root causes identified
  - [ ] Corrections applied
  - [ ] Audit trail complete

- [ ] Final Deliverables
  - [ ] BANK_RECON_WALKTHROUGHS_3MONTHS.pdf created
  - [ ] LETTRAGE_VERIFICATION.csv generated
  - [ ] OUTSTANDING_ITEMS_AGING.xlsx completed
  - [ ] CURRENCY_RECONCILIATION.md documented
  - [ ] RECONCILIATION_EXCEPTIONS.md finalized
  - [ ] All files exported to /exports/

---

## NEXT STEPS

1. **Week 7: Setup & Month 1 Testing**
   - Gather bank statements for Jan, Jun, Dec
   - Test data extraction and import
   - Complete January (Month 1) full walkthrough

2. **Week 7: Month 6 & Month 12 Testing**
   - Complete June (Month 6) mid-year walkthrough
   - Complete December (Month 12) year-end walkthrough

3. **Week 8: Validation & Documentation**
   - Verify all lettrage entries
   - Complete aging analysis
   - Document exceptions & corrections
   - Prepare final deliverables

4. **Week 8: Sign-off & Audit Readiness**
   - Review all documentation
   - Address any gaps
   - Prepare for auditor walkthrough
   - Deliver all PDFs/CSVs to /exports/

---

## SUCCESS METRICS

| Metric | Target | Status |
|--------|--------|--------|
| 3-month walkthroughs completed | 100% | [ ] |
| Lettrage completion rate | 100% | [ ] |
| Outstanding items > 30 days | 0 | [ ] |
| Bank reconciliation accuracy | ±0.00 MUR | [ ] |
| Documentation completeness | 100% | [ ] |
| Audit-ready status | YES | [ ] |

---

**Prepared by:** Finance Operations + Tech  
**Date:** 2026-05-22  
**Next Review:** Upon completion of testing (Week 8, 2026)
