# PHASE 2, TASK 2B — Banking Extraction Agent

**Status:** ✅ Planning Complete | Ready for Implementation  
**Timeline:** Weeks 3-4 (May 22 - June 4, 2026)  
**Effort:** 30 hours  
**Owner:** Finance ops team + Tech  

---

## QUICK START

This task extracts and verifies 12 months of bank reconciliations from both bank accounts (MUR 512100 and EUR 512101) for a Big4 audit.

### Deliverables (4 components)

1. **24 Monthly Reconciliation Reports (PDF)**
   - One per month per account
   - Location: `/exports/BANK_RECS/[ACCOUNT]/[YYYY_MM]_RECONCILIATION.pdf`
   - Content: Bank balance, GL balance, reconciliation, variance analysis, sign-offs

2. **Transaction Matching Report (CSV)**
   - All transactions with match status
   - Location: `/exports/BANK_MATCHING_SUMMARY.csv`
   - Flags: Items unmatched > 30 days

3. **Bank Statement Images (PDF)**
   - Original bank statements for all 12 months
   - Location: `/exports/BANK_STATEMENTS/[ACCOUNT]/[YYYY_MM].pdf`
   - Purpose: Audit evidence

4. **Variance Analysis Report (Markdown)**
   - Month-by-month variance narrative
   - Location: `/exports/RECONCILIATION_VARIANCES.md`
   - Root cause analysis for variances > 100 MUR

### Success Criteria

✅ 24/24 monthly reconciliations complete  
✅ Bank balance = GL balance (per account, per month)  
✅ 0 unmatched transactions > 30 days old  
✅ All documentation audit-ready for Big4 review  

---

## DOCUMENTATION FILES

This task is documented across 4 comprehensive guides:

### 1. [`PHASE2_TASK_2B_BANKING_EXTRACTION.md`](./PHASE2_TASK_2B_BANKING_EXTRACTION.md) ← **START HERE**
**The main spec document** (3000+ lines)
- Complete mission statement
- Detailed deliverable specifications (format, content, SQL source)
- 4-phase implementation roadmap (30 hours breakdown)
- Data flow diagram
- Execution timeline
- Dependencies and prerequisites

**Read this first to understand the WHAT and WHY.**

### 2. [`PHASE2_TASK_2B_SQL_REFERENCE.md`](./PHASE2_TASK_2B_SQL_REFERENCE.md)
**Complete SQL cookbook** (2000+ lines)
- 7 query categories with 30+ ready-to-copy SQL snippets
- GL Balance queries (monthly, opening, daily progression)
- Bank Statement Balance queries (summary, details)
- Transaction Matching queries (matched, unmatched, fuzzy)
- Unmatched & Outstanding queries (deposits, checks, stale items)
- Variance Analysis queries (root cause identification)
- Forex & Multi-currency queries (EUR handling)
- Audit Trail & Evidence queries (lettrage history)

**Use this as your SQL reference while coding.**

### 3. [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md)
**Ready-to-code implementation guide** (1500+ lines)
- Pre-implementation checklist (database validation)
- Phase 1: Infrastructure setup (directory structure, types, config)
- Phase 2: Data extraction services (3 service files with code stubs)
- Phase 3: Report generation (PDF, CSV, API endpoint stubs)
- Phase 4: Validation & QA (validator, completeness checker)
- Testing & verification checklist
- Deployment & sign-off procedures

**Follow this step-by-step to implement the task.**

### 4. This README
**Quick overview and navigation guide**

---

## EXECUTION FLOW

```
Week 3 (Mon-Fri)
├─ Mon-Tue (4 hrs): Phase 1 — Infrastructure
│  ├─ Create export directories
│  ├─ Create TypeScript types
│  └─ Create config file
├─ Wed-Fri (12 hrs): Phase 2 — Data extraction
│  ├─ GL balance service
│  ├─ Bank statement service
│  └─ Transaction matcher service
│
Week 4 (Mon-Fri)
├─ Mon-Wed (10 hrs): Phase 3 — Report generation
│  ├─ PDF generator (with pdf-lib)
│  ├─ CSV generator
│  └─ API endpoint (/api/exports/banking/reconciliations)
├─ Thu-Fri (4 hrs): Phase 4 — Validation & QA
│  ├─ Completeness checker (24/24 reports)
│  ├─ Manual spot-check (5 months)
│  └─ Finance team review
│
Buffer (Jun 3-4): Final review & sign-off
```

**Total: 30 hours (matches estimate)**

---

## KEY TECHNICAL NOTES

### Account Mapping
- **Account 512100** (MUR): MCB main account in Mauritian Rupees
- **Account 512101** (EUR): MCB forex account in Euros
- GL account code: `5121` (canonicalized by trigger `tr_ecritures_remap_pcm`)

### GL Balance Calculation
Always use `debit_mur` and `credit_mur` columns (never `debit`/`credit` which may be NULL)
```sql
balance = SUM(debit_mur) - SUM(credit_mur)
```

### Matching Logic
Transactions are "matched" via `lettrages` junction table:
- `transactions_bancaires.id` ↔ `lettrages.transaction_bancaire_id`
- `ecritures_comptables_v2.id` ↔ `lettrages.ecriture_id`

### In-Transit Items (Reconciliation Adjustments)
Two types to track separately:
- **Pending deposits:** Bank received, GL not yet posted (awaiting invoice)
- **Outstanding checks:** GL accrued, bank not yet cleared (check in float)

### Forex Handling
For EUR transactions:
- Store `devise_origine` (EUR) and `montant_origine`
- Store `taux_change_applique` (MCB rate used)
- Flag if rate changed after transaction date
- Calculate realized forex gain/loss monthly

### Audit Flags
Flag for manual investigation:
- Any unmatched transaction > 30 days old
- Any variance > 100 MUR
- Any forex rate discrepancies

---

## DATABASE PREREQUISITES

Before starting, verify:

```sql
-- Check 12 months of bank statements exist
SELECT COUNT(*), COUNT(DISTINCT periodo) 
FROM releves_bancaires 
WHERE periode >= '2025-07' AND periode <= '2026-06';
-- Expected: 24 rows (12 months × 2 accounts)

-- Check GL entries exist
SELECT COUNT(*), COUNT(DISTINCT societe_id)
FROM ecritures_comptables_v2 
WHERE numero_compte IN ('5121', '512100', '512101')
  AND date_ecriture >= '2025-07-01';
-- Expected: 1000+ entries

-- Check transactions imported
SELECT COUNT(*), COUNT(DISTINCT releve_id)
FROM transactions_bancaires 
WHERE date_transaction >= '2025-07-01';
-- Expected: 5000+ transactions

-- Check some matches exist (baseline)
SELECT COUNT(*)
FROM lettrages 
WHERE created_at >= '2025-07-01';
-- Expected: 1000+ (80%+ of transactions should be matched)
```

---

## FILE STRUCTURE

After completion, you'll have created:

```
app/api/exports/banking/
└── reconciliations/
    └── route.ts

lib/banking/
├── config.ts
├── gl-balance-service.ts
├── bank-statement-service.ts
├── transaction-matcher.ts
├── pdf-generator.ts
├── csv-generator.ts
├── validator.ts
└── completeness-checker.ts

lib/types/
└── banking-export.ts

docs/
├── PHASE2_TASK_2B_BANKING_EXTRACTION.md (← spec)
├── PHASE2_TASK_2B_SQL_REFERENCE.md (← SQL queries)
├── PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md (← code guide)
└── PHASE2_TASK_2B_README.md (← this file)

/exports/
├── BANK_RECS/
│   ├── 512100_MUR/
│   │   ├── 2025_07_RECONCILIATION.pdf
│   │   ├── 2025_08_RECONCILIATION.pdf
│   │   └── ...
│   └── 512101_EUR/
│       └── ...
├── BANK_STATEMENTS/
│   ├── 512100_MUR/
│   │   └── ...
│   └── 512101_EUR/
│       └── ...
├── BANK_MATCHING_SUMMARY.csv
└── RECONCILIATION_VARIANCES.md
```

---

## IMPLEMENTATION STEPS

### Step 1: Read the Spec (30 min)
👉 Open [`PHASE2_TASK_2B_BANKING_EXTRACTION.md`](./PHASE2_TASK_2B_BANKING_EXTRACTION.md)
- Understand the deliverables and success criteria
- Review the data flow diagram
- Understand the variance analysis requirements

### Step 2: Verify Prerequisites (15 min)
👉 Run the SQL checks above to confirm data availability
- Ensure 12 months of bank statements exist
- Ensure GL entries populated for FY2025-2026
- Ensure transactions_bancaires populated from OCR

### Step 3: Execute Phase 1 (4 hours)
👉 Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) — Section: Phase 1
- Create directory structure
- Create TypeScript types
- Create configuration file

### Step 4: Execute Phase 2 (12 hours)
👉 Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) — Section: Phase 2
- Create GL balance service
- Create bank statement service
- Create transaction matcher service
- Reference [`PHASE2_TASK_2B_SQL_REFERENCE.md`](./PHASE2_TASK_2B_SQL_REFERENCE.md) for SQL

### Step 5: Execute Phase 3 (10 hours)
👉 Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) — Section: Phase 3
- Create PDF generator (npm install pdf-lib)
- Create CSV generator
- Create API endpoint

### Step 6: Execute Phase 4 (4 hours)
👉 Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) — Section: Phase 4
- Create validation service
- Create completeness checker
- Run unit tests

### Step 7: Deploy & Sign-Off
👉 Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) — Section: Deployment
- Verify all 24 reports generated
- Verify 0 unmatched items > 30 days old
- Finance controller sign-off
- Archive to audit drive

---

## DEPENDENCIES

**npm packages:**
- `pdf-lib` — PDF generation (install: `npm install pdf-lib`)
- `@supabase/supabase-js` — Already installed
- TypeScript (already installed)

**Environment variables (already configured):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Database tables (all exist):**
- `ecritures_comptables_v2` — GL entries
- `releves_bancaires` — Bank statements
- `transactions_bancaires` — Bank transactions
- `lettrages` — Transaction matching
- `comptes_bancaires` — Account master data
- `societes` — Company master data

---

## RELATED DOCUMENTATION

- **Master Plan:** [`LEXORA_MASTER_PLAN.md`](../../LEXORA_MASTER_PLAN.md#sprint-3--module-relevé-bancaire-complet) (Sprint 3)
- **Schema Reference:** [`supabase/SCHEMA.md`](../../supabase/SCHEMA.md)
- **Rapprochement Rules:** `lexora-rapprochement-rules` skill (R1-R7 classification rules)
- **Action Plan:** [`PLAN_ACTION_OUTIL_PARFAIT.md`](../../PLAN_ACTION_OUTIL_PARFAIT.md#task-21-extract-historical-accounting-data) (Task 2.1)

---

## SUPPORT & QUESTIONS

For questions during implementation:

1. **"How do I query GL balance?"** → See [`PHASE2_TASK_2B_SQL_REFERENCE.md`](./PHASE2_TASK_2B_SQL_REFERENCE.md) Section 1.1
2. **"What's the format of the PDF?"** → See [`PHASE2_TASK_2B_BANKING_EXTRACTION.md`](./PHASE2_TASK_2B_BANKING_EXTRACTION.md) Deliverable 1
3. **"How do I handle EUR transactions?"** → See [`PHASE2_TASK_2B_SQL_REFERENCE.md`](./PHASE2_TASK_2B_SQL_REFERENCE.md) Section 6
4. **"What code should I write?"** → Follow [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) step-by-step
5. **"How do I validate completeness?"** → See [`PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md`](./PHASE2_TASK_2B_IMPLEMENTATION_CHECKLIST.md) Phase 4

---

## SIGN-OFF REQUIREMENTS

Before completing the task, ensure:

- [ ] All 24 PDF reconciliation reports generated
- [ ] All PDF reports include sign-off fields (preparedBy, reviewedBy dates)
- [ ] CSV export includes all transactions
- [ ] 0 unmatched transactions > 30 days old
- [ ] Variance analysis markdown complete with root causes
- [ ] Finance team reviewed 5 spot-check months
- [ ] Finance Controller signature obtained
- [ ] All files copied to audit drive for Big4 review

---

**Last updated:** 2026-05-22  
**Status:** ✅ Ready for implementation  
**Estimated completion:** 2026-06-04
