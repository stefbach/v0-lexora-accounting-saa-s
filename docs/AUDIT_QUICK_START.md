# LEXORA AUDIT QUICK START GUIDE
## For Big 4 Auditors - System Navigation & Control Testing

**Document**: Quick Reference for Audit Fieldwork  
**Date**: 22 May 2026  
**Target Audience**: External audit team (Big 4 engagement)  
**Reference Manual**: See `/docs/CONTROLES_COMPTABLES_LEXORA.md` for full procedures  

---

## 30-MINUTE SYSTEM OVERVIEW

### What is Lexora?

Lexora is a **cloud-based accounting SaaS** for Mauritian companies, built with:
- **Frontend**: Next.js 15 (React)
- **Backend**: API endpoints (Next.js route handlers)
- **Database**: PostgreSQL on Supabase (cloud-hosted)
- **Multi-tenant**: Separate isolation for DDS (Des Dunes Sarl) and OCC (Obesity Care Clinic)
- **Compliance**: Mauritian MRA (tax authority), IFRS, Full IFRS for GBC

### Key Tables for Audit

| Table | Purpose | Audit Relevance |
|-------|---------|-----------------|
| **ecritures_comptables_v2** | General Ledger (master table) | Source of truth for all GL entries |
| **factures** | Customer & Supplier invoices | AR/AP aging, revenue recognition |
| **releves_bancaires** | Bank statements (OCR'd) | Bank reconciliation, transaction matching |
| **transactions_bancaires** | Individual bank transactions (in JSON) | Detailed payment tracing |
| **bulletins_paie** | Payroll slips (monthly by employee) | Salary control, tax withholding |
| **lettrages** | Reconciliation links | Invoice-to-payment matching |
| **plan_comptable_mauricien** | Chart of Accounts (Mauritian PCM) | Revenue/Expense classification |
| **comptes_bancaires** | Bank account registry | Multi-currency control |
| **employes** | Employee master data | Payroll control, related party check |

### Three Key Control Rules

1. **R1 (Double Entry)**: Every GL entry must have Debit = Credit
   - Enforced by: `tr_balance_check_insert` trigger (Migration 168)
   - Cannot be overridden by system

2. **R2 (Lettrage = Matching)**: Invoices must be reconciled to payment
   - Enforced by: `lettrages` table linking AR/AP to bank tx
   - Monthly requirement: Account 5800 (suspense) must = 0

3. **R3 (Idempotency)**: No duplicate GL entries from invoice posting
   - Enforced by: UNIQUE index on `(societe_id, ref_folio, numero_compte)`
   - API retries cannot create duplicates

---

## AUDIT PROGRAM - WALKTHROUGH

### Phase 1: System Access & Navigation (1 hour)

**Objective**: Understand system architecture, access controls, sample data

```
STEP 1: Login & Multi-Tenant Isolation (10 min)
├─ User: [provided by Lexora]
├─ URL: https://lexora.app/client/select-societe
├─ Select: "DDS" (Des Dunes Sarl)
│  └─ Verify: Data from OCC hidden (RLS enforcement)
├─ Select: "OCC" (Obesity Care Clinic)
│  └─ Verify: Data from DDS hidden
└─ Control Assertion: Multi-tenant isolation working ✓

STEP 2: Navigation Tour (10 min)
├─ /client/grand-livre → General Ledger (trial balance, drill-down)
├─ /client/factures → Invoice register (customer + supplier)
├─ /client/banque → Bank statement import & reconciliation
├─ /client/rapprochement → Transaction matching (lettrage)
├─ /client/salaires-compta → Payroll GL posting
└─ /client/ecritures → Manual GL entries (journal)

STEP 3: Sample Transaction Deep-Dive (20 min)
├─ Navigate: /client/factures
├─ Find: Any customer invoice (e.g., "FAC-2026-0001")
├─ Review: 
│  ├─ Invoice fields (date, customer, amount, VAT)
│  ├─ GL accounts selected (4210, 706, 4412)
│  └─ Supporting document attachment
├─ Navigate: /client/grand-livre
├─ Filter: Account 4210 (Clients Receivables)
├─ Verify: GL entry matching invoice TTC
│  └─ Should show: Debit 4210 for full invoice amount
└─ Control Assertion: Invoice-to-GL posting working ✓

STEP 4: User Roles & Permissions (10 min)
├─ Settings → Users
├─ Verify: Comptable, Directeur, RH Admin roles assigned
├─ Check: Access grid (who can create, approve, post)
└─ Control Assertion: Segregation of duties matrix visible
```

### Phase 2: GL & Trial Balance Testing (2 hours)

**Objective**: Verify GL accuracy, balance, and completeness

```
STEP 1: Trial Balance Verification (30 min)
├─ Navigate: /client/grand-livre → "Trial Balance" button
├─ Select: Most recent month-end (e.g., May 2026)
├─ Export: PDF or CSV
├─ Verify in audit software:
│  ├─ Total Debits = Total Credits (must match to penny)
│  ├─ All account codes are valid (4-digit PCM format)
│  ├─ No negative equity accounts (no unusual reversals)
│  └─ No zero-balance accounts left over from prior year
├─ Control Assertion: GL mathematically accurate ✓

STEP 2: Receivables Testing (30 min)
├─ Navigate: /client/factures → Filter: type_facture='client'
├─ Generate: Aging report
├─ Compare: Sum of aged invoices to GL account 4210
│  └─ Reconciliation formula:
│     Total AR (aged report) = GL 4210 balance ✓
├─ Check: Any invoices >90 days overdue
│  ├─ Verify: Doubtful debt provision posted (account 6530)
│  └─ Validate: Allowance reasonable (age, customer credit history)
├─ Sample: Select 5 random invoices
│  ├─ Confirm: GL entries exist for each
│  ├─ Verify: Amount matches invoice TTC
│  └─ Trace: To supporting document (PDF in system)
└─ Control Assertion: AR complete and accurate ✓

STEP 3: Payables Testing (30 min)
├─ Navigate: /client/factures → Filter: type_facture='fournisseur'
├─ Generate: Aging report
├─ Compare: Sum of aged invoices to GL account 4020
│  └─ Reconciliation: Total AP (aged) = GL 4020 balance ✓
├─ Sample: Select 5 random supplier invoices
│  ├─ Verify: Expense account coded correctly (e.g., 601, 6303)
│  ├─ Verify: VAT amount correct (15% if supplier VAT-registered)
│  └─ Check: Supporting invoice attached (external evidence)
├─ Follow-up: Any invoices unpaid 90+ days?
│  ├─ Assess: Dispute or deferred payment?
│  └─ Document: Audit memo on status
└─ Control Assertion: AP complete and accurate ✓

STEP 4: Suspense Account Check (10 min)
├─ Navigate: /client/grand-livre
├─ Search: Account 5800 (Temporary/Suspense)
├─ Verify: Balance = 0 at month-end
│  └─ Control: All bank tx must be matched (no orphans)
├─ If balance > 0:
│  ├─ Identify: Unmatched transactions
│  ├─ Investigate: Why not matched
│  └─ Document: Audit finding (unresolved items)
└─ Control Assertion: All bank tx matched by month-end ✓
```

### Phase 3: Bank Reconciliation & Payments (1.5 hours)

**Objective**: Verify bank statement matches GL, all payments matched to invoices

```
STEP 1: Bank Statement Reconciliation (45 min)
├─ Navigate: /client/banque
├─ Select: Account 5121 (Bank MUR - or account being tested)
├─ Review: Most recent month's statement
│  ├─ Opening balance (from prior month reconciliation)
│  ├─ Deposits (credits)
│  ├─ Withdrawals (debits)
│  └─ Closing balance
├─ Compare to GL:
│  └─ Bank GL balance (5121) = Bank statement closing balance ✓
├─ Reconcile: If differences:
│  ├─ Look for: Outstanding checks (expected)
│  ├─ Look for: Bank fees not yet recorded
│  ├─ Look for: Timing differences (1-day delays)
│  └─ Verify: Explanation documented
├─ Sample: 10 random bank transactions
│  ├─ Pull: PDF from bank statement
│  ├─ Match: To GL entry in BNQ journal
│  ├─ Verify: Debit/credit direction correct
│  └─ Trace: To source invoice/payroll/vendor
└─ Control Assertion: Bank rec complete and accurate ✓

STEP 2: Invoice Payment Tracing (45 min)
├─ Objective: Verify payments traced back to invoices
├─ Sample: 5 customer invoices from AR aging
│  For each invoice:
│  ├─ 1. Find invoice in /client/factures (note TTC amount & date due)
│  ├─ 2. Check: statut = 'paye' (should be paid)
│  ├─ 3. Look: rapproche_date (when was it paid?)
│  ├─ 4. Navigate: /client/rapprochement
│  ├─ 5. Search: Bank statement for that date
│  ├─ 6. Verify: Bank tx amount matches invoice TTC
│  ├─ 7. Confirm: Lettering code matches (links invoice to payment)
│  ├─ 8. Check: GL entry in BNQ journal (debit bank, credit AR)
│  └─ 9. Verify: Both invoice and GL entry reconciled
├─ Check: Any unpaid invoices past due?
│  ├─ Are they marked 'retard' (overdue)?
│  ├─ Has dunning notice been sent?
│  └─ Is payment arrangement documented?
└─ Control Assertion: Payment process operating effectively ✓
```

### Phase 4: Payroll & Tax Controls (1 hour)

**Objective**: Verify payroll posted correctly, tax withheld per MRA rules

```
STEP 1: Payroll Master Data (15 min)
├─ Navigate: /client/employes
├─ Sample: 3 employees (senior, mid, junior)
├─ Verify for each:
│  ├─ Name, BRN (employee ID)
│  ├─ Salary amount (base + allowances)
│  ├─ Tax status (resident, non-resident, VAT agent?)
│  ├─ Deduction elections (CSG, NSF, training levy)
│  └─ Contract type (permanent, temporary, probation)
└─ Control Assertion: Employee data complete ✓

STEP 2: Monthly Payroll Journal Entry (30 min)
├─ Navigate: /client/ecritures
├─ Filter: Journal = "SAL" (Salaires), Month = May 2026
├─ Verify: One aggregate entry per month (not per employee)
│  ├─ Example entry structure:
│  │  Debit: 6200 (Salaries) = Total gross
│  │  Credit: 4420 (PAYE withheld) = Employee portion
│  │  Credit: 4421 (PAYE employer) = Employer portion
│  │  Credit: 4430 (CSG employee) = Employee contrib
│  │  Credit: 4431 (CSG employer) = Employer contrib
│  │  Credit: 4440 (NSF employee) = Employee contrib
│  │  Credit: 4441 (NSF employer) = Employer contrib
│  │  Credit: 4500 (Salaries payable) = Net amount
│  └─ VERIFY: Total debit (6200) = Sum of all credits ✓
├─ Sample: 3 employees, calculate totals:
│  ├─ If Emp1: Gross 30k, Emp2: Gross 20k, Emp3: Gross 15k
│  ├─ Then: 6200 should = 65k
│  ├─ Tax rates: Use MRA 2026 barème (provided)
│  └─ Calculate: Expected withholding for each
├─ Verify: Actual GL entry matches calculated amounts
│  └─ If variance >1%: Investigate
└─ Control Assertion: Payroll posted accurately ✓

STEP 3: Tax Withholding Verification (15 min)
├─ Objective: PAYE withheld per MRA barème
├─ Get: MRA 2026 tax bands (linear scale)
│  └─ Example: 0-100k @ 0%, 100k-200k @ 10%, etc. (simplified)
├─ Sample: 3 employees from step 2
│  For each:
│  ├─ 1. Salary amount (gross)
│  ├─ 2. Apply: MRA 2026 tax bands
│  ├─ 3. Calculate: Expected PAYE withholding
│  ├─ 4. Compare: To GL entry (4420/4421)
│  ├─ 5. Verify: Variance <1% (rounding acceptable)
│  └─ 6. Check: Receipt for payment (was PAYE paid to MRA?)
├─ CSG/NSF Verification:
│  ├─ CSG = ~4.5% of gross (employee + employer match)
│  ├─ NSF = ~5.0% of gross (employee + employer match)
│  └─ Verify: Rates applied correctly
└─ Control Assertion: Tax withholding accurate ✓
```

### Phase 5: Audit Trail & Documentation (30 min)

**Objective**: Verify audit trail, supporting docs, system control

```
STEP 1: Invoice Documentation Trail (15 min)
├─ Navigate: /client/factures
├─ Select: 1 random customer invoice
├─ Verify: Supporting PDF attached
│  ├─ Open: PDF document
│  ├─ Check: Invoice content matches GL entry
│  └─ Assess: Quality (OCR legible, complete)
├─ Check: Invoice timestamps
│  ├─ created_at: When invoice created
│  ├─ updated_at: Any subsequent updates
│  └─ Assess: No post-period modifications?
├─ Review: Approval status
│  ├─ Was invoice approved before GL posting?
│  └─ By whom? (Directeur signature?)
└─ Control Assertion: Supporting docs on file ✓

STEP 2: GL Entry Linkage (15 min)
├─ Select: Same invoice from step 1
├─ Trace: To GL entries in /client/grand-livre
│  ├─ Search: Account 4210 (AR)
│  ├─ Filter: Date = invoice date
│  ├─ Verify: Entry found with matching amount
├─ Verify: ref_folio (idempotency key)
│  ├─ Example: ref_folio = "FAC-xxxxx"
│  ├─ Check: Is this unique? (no duplicates)
│  └─ Control: Prevents accidental re-posting
├─ Review: GL entry detail
│  ├─ Description should reference invoice number
│  ├─ Amount should match invoice TTC
│  └─ Accounts should be correct (4210, 706, 4412)
└─ Control Assertion: GL entry properly linked ✓
```

---

## COMMON AUDIT TESTS & QUERIES

### Test 1: Is GL Balanced? (5 min)

```sql
-- RUN IN SUPABASE QUERY EDITOR
SELECT 
  societe_id,
  date_ecriture,
  journal,
  SUM(debit_mur) as total_debit,
  SUM(credit_mur) as total_credit,
  (SUM(debit_mur) - SUM(credit_mur)) as difference
FROM ecritures_comptables_v2
WHERE date_ecriture >= '2026-05-01'
  AND date_ecriture <= '2026-05-31'
GROUP BY societe_id, date_ecriture, journal
ORDER BY difference DESC
LIMIT 20;

-- EXPECTED RESULT: All rows should show difference = 0
-- If any row shows non-zero difference: GL is unbalanced (audit finding)
```

### Test 2: Do All Invoices Have GL Entries? (5 min)

```sql
-- Check: Customer invoices
SELECT COUNT(*) as invoice_count
FROM factures
WHERE type_facture = 'client'
  AND date_facture >= '2026-05-01'
  AND date_facture <= '2026-05-31';

-- Should match: Number of VTE journal entries
SELECT COUNT(*) as vte_entry_count
FROM ecritures_comptables_v2
WHERE journal = 'VTE'
  AND date_ecriture >= '2026-05-01'
  AND date_ecriture <= '2026-05-31';

-- If counts don't match: Missing GL entries (audit finding)
```

### Test 3: Are Invoices Reconciled to Payment? (10 min)

```sql
-- Check: How many invoices are unpaid?
SELECT statut, COUNT(*) as count
FROM factures
WHERE type_facture = 'client'
GROUP BY statut;

-- Expected:
-- paye: Most invoices
-- en_attente: Current/recent invoices (ok if due date not passed)
-- retard: Any overdue? Investigate
-- partiel: Any partial? Investigate
-- annule: Any cancelled? Document reason
```

### Test 4: Is 5800 (Suspense) Account Zero? (5 min)

```sql
-- Check: No unmatched bank transactions
SELECT 
  SUM(debit_mur) - SUM(credit_mur) as balance
FROM ecritures_comptables_v2
WHERE numero_compte = '5800'
  AND date_ecriture >= '2026-05-01'
  AND date_ecriture <= '2026-05-31';

-- EXPECTED: 0
-- If non-zero: Unmatched bank transactions (must be resolved)
```

---

## RED FLAGS & ESCALATIONS

### ⚠️ If You See These, STOP and Investigate

| Finding | Audit Action | Escalation |
|---------|--------------|------------|
| GL trial balance doesn't balance | Run balance check query | Partner review |
| Invoice without GL entry | Check: Is posting automated? | Query system logs |
| GL entry without supporting invoice | Check: Was it manual? (OD journal) | Review approval |
| 5800 balance > 0 at month-end | Identify unmatched transaction | Directeur sign-off required |
| Invoice dated after payment | Unusual timing (negative AR days) | Investigate timing |
| Same ref_folio appearing twice | Duplicate posting (should be rejected) | IT investigation |
| PAYE not withheld per barème | Tax calculation error | Recalculate with auditor |
| Supplier without VAT registration, VAT claimed | Input VAT recovery questioned | Documentation required |
| Large manual GL entry (>1M MUR) | High control risk | Requires Directeur approval |
| Account 4210 (AR) negative balance | Credit customer or write-off | Must be reconciled |

---

## KEY DATES & DEADLINES

| Event | Date | Action |
|-------|------|--------|
| Month-End Close | 31st | GL must balance, reconciliations signed |
| Bank Reconciliation | By 27th | All accounts matched |
| Payroll Processing | 27th | Salary GL posted, PAYE withheld |
| Trial Balance Report | 31st | Generated, reviewed, filed |
| VAT Return Filing | 5th of next month | VAT due to MRA |
| PAYE Payment | Due date | Usually same as salary payment |
| Audit Prep File | TBD | All documentation ready for auditor |

---

## CONTACT & SUPPORT

**System Access**: [Lexora support email]  
**Password Reset**: [Support process]  
**Data Questions**: Comptable Jean-Paul (jpaul@dds.mu)  
**Directeur Approval**: Marie (marie@dds.mu)  
**Auditor Liaison**: [TBD - engagement manager]  

---

**For complete procedures, see**: `/docs/CONTROLES_COMPTABLES_LEXORA.md`
