# PHASE 2, Task 2C — Invoice Extraction Agent
## Complete File Index

---

## Quick Links

**START HERE:** Read [PHASE2_TASK2C_DELIVERABLES.md](/PHASE2_TASK2C_DELIVERABLES.md) for complete project overview.

---

## Scripts (Executable)

### 1. Run All Extractions (Main Entry Point)
**File:** `run-all.sh`
- **Purpose:** Master runner script that executes all 4 extractions sequentially
- **Usage:** `bash scripts/phase2-invoice-extraction/run-all.sh`
- **Output:** Creates `/exports` directory with 4 files
- **Runtime:** ~1-2 minutes

### 2. Complete Invoice Register Extraction
**File:** `extract-complete-register.ts`
- **Purpose:** Extracts all invoices from past 12 months
- **Output:** `exports/INVOICE_REGISTER_COMPLETE.csv`
- **Deliverable:** 1
- **Usage:** `npx ts-node scripts/phase2-invoice-extraction/extract-complete-register.ts`
- **Records:** All factures from 12-month period
- **Columns:** 12 (number, date, type, customer, amounts, status, payment info)

### 3. GL Traceability Testing
**File:** `extract-gl-traceability.ts`
- **Purpose:** Tests GL reconciliation on 50 random invoices
- **Output:** `exports/INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx`
- **Deliverable:** 2
- **Usage:** `npx ts-node scripts/phase2-invoice-extraction/extract-gl-traceability.ts`
- **Sample Size:** 50 invoices (random selection)
- **Sheets:** Summary + 50 detail sheets

### 4. MRA Compliance Checker
**File:** `check-mra-compliance.ts`
- **Purpose:** Verifies Mauritian tax compliance for all invoices
- **Output:** `exports/INVOICE_MRA_COMPLIANCE.md`
- **Deliverable:** 3
- **Usage:** `npx ts-node scripts/phase2-invoice-extraction/check-mra-compliance.ts`
- **Checks:** Numbering, required fields, VAT rates, duplicates
- **Format:** Markdown report

### 5. Outstanding Invoices Analysis
**File:** `extract-aging-analysis.ts`
- **Purpose:** Analyzes aging of unpaid invoices
- **Output:** `exports/AGING_ANALYSIS.xlsx`
- **Deliverable:** 4
- **Usage:** `npx ts-node scripts/phase2-invoice-extraction/extract-aging-analysis.ts`
- **Buckets:** 0-30, 31-60, 61-90, 91-120, 120+ days
- **Sheets:** Summary + 5 aging buckets + by type + strategy

---

## Configuration & Helpers

### Configuration File
**File:** `config.ts`
- **Purpose:** Central configuration for all extraction parameters
- **Contents:**
  - Period settings (default: 12 months)
  - GL sample size (default: 50)
  - VAT rates (0, 8, 19)
  - Tolerance for reconciliation (0.01 MUR)
  - Aging buckets
  - Success criteria
  - Excel formatting rules
  - MRA compliance rules
  - GL account mappings
  - Payment modes
  - Journal codes
- **Edit this to:** Change period, sample size, tolerance, or formatting

### Validation Helpers
**File:** `validation-helpers.ts`
- **Purpose:** Reusable validation functions for data quality
- **Functions:**
  - `validateInvoiceNumber()`
  - `validateInvoiceDate()`
  - `validateVATRate()`
  - `validateVATAmount()`
  - `validatePaymentStatus()`
  - `validateGLAccount()`
  - `validatePaymentMode()`
  - `validateInvoiceType()`
  - `validateGLReconciliation()`
  - `validateDaysOutstanding()`
  - `validateInvoiceRecord()` (comprehensive)
  - `summarizeValidation()`
- **Use this for:** Custom validation, rule checking, compliance verification

---

## Documentation

### User Guide
**File:** `README.md`
- **Audience:** End users, accountants, finance teams
- **Contents:**
  - Overview of all 4 deliverables
  - Detailed description of each deliverable
  - Setup instructions
  - Execution instructions (individual & batch)
  - Database schema overview
  - Output file structure
  - Validation & quality checks
  - Troubleshooting guide
  - Performance notes
- **Read this for:** How to run extractions and understand results

### Integration Guide
**File:** `INTEGRATION_GUIDE.md`
- **Audience:** Developers, DevOps, deployment teams
- **Contents:**
  - System architecture
  - Integration steps
  - API integration points
  - Scheduling & automation options
  - Performance optimization
  - Testing strategies
  - Deployment checklist
  - Monitoring & logging
  - Troubleshooting
  - Maintenance plan
- **Read this for:** How to integrate into production systems

### Project Summary
**File:** `PHASE2_TASK2C_DELIVERABLES.md`
- **Audience:** Project managers, stakeholders
- **Contents:**
  - Project overview
  - 4 deliverables with specs
  - File structure
  - Quick start guide
  - Key features
  - Success metrics
  - Next steps
  - Ongoing maintenance
- **Read this for:** Project status, deliverables, next steps

### This File
**File:** `INDEX.md`
- **Audience:** Everyone
- **Purpose:** Quick navigation to all files

---

## Database Tables Used

All scripts query these tables (read-only):

1. **factures**
   - invoice records
   - numero_facture, date_facture, type_facture, tiers
   - montant_ht, montant_ttc, montant_tva, taux_tva
   - statut (en_attente, partiel, paye, retard, annule)

2. **factures_paiements**
   - payment history
   - facture_id, date_paiement, montant_mur, reference
   - source (manuel, rapprochement, backfill)

3. **ecritures_comptables_v2**
   - GL entries
   - facture_id (link back to invoice)
   - date_ecriture, journal, numero_compte
   - debit_mur, credit_mur, ref_folio
   - created_at

---

## Output Files

All files are generated in `/exports/` directory:

| File | Format | Size* | Deliverable |
|------|--------|-------|------------|
| INVOICE_REGISTER_COMPLETE.csv | CSV | 50-500 KB | 1 |
| INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx | Excel | 100-500 KB | 2 |
| INVOICE_MRA_COMPLIANCE.md | Markdown | 10-50 KB | 3 |
| AGING_ANALYSIS.xlsx | Excel | 50-200 KB | 4 |

*Depends on number of invoices in system

---

## Execution Flow

```
┌─────────────────────────────────────┐
│  bash run-all.sh                    │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┬────────┬─────┐
    │                 │        │     │
    ▼                 ▼        ▼     ▼
extract-        extract-    check-  extract-
complete-       gl-         mra-    aging-
register.ts     traceability compliance analysis.ts
    │           .ts         .ts     │
    │           │           │       │
    ▼           ▼           ▼       ▼
    CSV         XLSX        MD      XLSX
```

---

## Environment Setup

Before running any scripts:

```bash
# 1. Set environment variables
export NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# 2. Verify they're set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# 3. Run extractions
bash scripts/phase2-invoice-extraction/run-all.sh
```

---

## File Sizes & Metrics

**Total Code:** 2,257 lines across 9 files

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| run-all.sh | Shell | 91 | Master runner |
| extract-complete-register.ts | TypeScript | 375 | Deliverable 1 |
| extract-gl-traceability.ts | TypeScript | 372 | Deliverable 2 |
| check-mra-compliance.ts | TypeScript | 309 | Deliverable 3 |
| extract-aging-analysis.ts | TypeScript | 335 | Deliverable 4 |
| config.ts | TypeScript | 321 | Configuration |
| validation-helpers.ts | TypeScript | 385 | Validation |
| README.md | Markdown | ~250 | User guide |
| INTEGRATION_GUIDE.md | Markdown | ~350 | Integration |

---

## Key Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",      // Database access
  "xlsx": "^0.18.x"                      // Excel generation
}
```

Both already installed in project.

---

## Quick Commands

```bash
# Run all extractions
bash scripts/phase2-invoice-extraction/run-all.sh

# Run individual extractions
npx ts-node scripts/phase2-invoice-extraction/extract-complete-register.ts
npx ts-node scripts/phase2-invoice-extraction/extract-gl-traceability.ts
npx ts-node scripts/phase2-invoice-extraction/check-mra-compliance.ts
npx ts-node scripts/phase2-invoice-extraction/extract-aging-analysis.ts

# View results
ls -lh exports/
cat exports/INVOICE_MRA_COMPLIANCE.md  # View compliance report

# Clean up exports (if needed)
rm -rf exports/
```

---

## Success Indicators

When execution completes successfully, you'll see:

```
✓ Complete invoice register exported to: /exports/INVOICE_REGISTER_COMPLETE.csv
✓ GL Traceability report exported to: /exports/INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx
✓ MRA Compliance report exported to: /exports/INVOICE_MRA_COMPLIANCE.md
✓ Aging analysis exported to: /exports/AGING_ANALYSIS.xlsx
```

---

## Next Steps

1. **Review Documentation**
   - Start with [PHASE2_TASK2C_DELIVERABLES.md](/PHASE2_TASK2C_DELIVERABLES.md)
   - Read [README.md](README.md) for user guide
   - Check [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) for deployment

2. **Run Extractions**
   - Set environment variables
   - Execute: `bash run-all.sh`
   - Review all 4 output files

3. **Validate Results**
   - Check invoice counts
   - Verify GL reconciliation
   - Review compliance issues
   - Analyze aging results

4. **Take Action**
   - Fix any MRA compliance issues
   - Investigate GL mismatches
   - Develop collection strategy
   - Set up automated runs (optional)

---

## Support

For issues:
1. Check [README.md](README.md) troubleshooting section
2. Review [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
3. Check script output for specific errors
4. Review [config.ts](config.ts) for business rules
5. Review [validation-helpers.ts](validation-helpers.ts) for compliance logic

---

**Version:** 1.0  
**Created:** 2026-05-22  
**Status:** Production Ready
