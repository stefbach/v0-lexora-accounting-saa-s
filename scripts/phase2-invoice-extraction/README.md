# PHASE 2, Task 2C — Invoice Extraction Agent

**Timeline:** Weeks 3-4  
**Effort:** 25 hours  
**Owner:** Finance team + Tech  

**Mission:** Extract and verify complete invoice register (all 12 months) for traceability audit.

---

## Deliverables

### 1. Complete Invoice Register (12 months)

**File:** `INVOICE_REGISTER_COMPLETE.csv`

Extracts ALL factures records from the past 12 months with complete details:

- **Columns:**
  - `invoice_number` — Numéro facture
  - `invoice_date` — Date facture
  - `type_facture` — Type (client, fournisseur)
  - `tiers` — Customer/supplier name
  - `amount_ht` — Montant HT (excluding VAT)
  - `amount_ttc` — Montant TTC (including VAT)
  - `tva_amount` — VAT amount
  - `tva_rate` — VAT rate (0%, 8%, 19%)
  - `status` — Payment status (en_attente, partiel, paye, retard, annule)
  - `last_payment_date` — Date of last payment
  - `payment_reference` — Payment reference(s)
  - `days_outstanding` — Days since invoice date (for unpaid invoices)

- **Sorting:** By date, then by type
- **Format:** CSV (UTF-8, comma-separated, quoted fields)
- **Success Criteria:**
  - 100% of invoices from past 12 months
  - Complete payment status tracking
  - Days outstanding calculated for aging

---

### 2. Invoice-to-GL Traceability (50-sample test)

**File:** `INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx`

Detailed traceability testing for 50 random invoices across 12 months.

For each sample invoice:
- Invoice details (number, date, amount)
- GL entries created (ref_folio links)
- Account postings (411, 706, 512, etc.)
- Amount reconciliation (invoice amount = GL entry total)
- Approval trail (created_by, approved_by, timestamps)

**Excel Structure:**
- Sheet 1: Summary (all 50 invoices, reconciliation status)
- Sheets 2-51: Detail for each invoice
  - GL entry breakdown
  - Account postings
  - Reconciliation check

**Success Criteria:**
- 100% of sampled invoices have GL postings
- 100% of invoice amounts match GL entries (within 0.01 MUR tolerance)
- All 50-sample items reconciled perfectly

---

### 3. MRA Invoice Compliance

**File:** `INVOICE_MRA_COMPLIANCE.md`

Comprehensive compliance check for Mauritian tax requirements:

**Checks Performed:**
1. **Sequential Numbering**
   - Invoice numbers are sequential per type
   - No duplicates per type
   - Detect numbering gaps

2. **Required Fields**
   - Invoice number (numero_facture)
   - Invoice date (date_facture)
   - Customer/supplier name (tiers)
   - SIRET/BRN for suppliers

3. **Tax Treatment**
   - VAT rates are valid (0%, 8%, 19%, or exempt)
   - VAT amounts match calculations
   - Proper tax classification

4. **Supplier Registration**
   - All suppliers have valid MRA registrations
   - VAT registration numbers present where applicable

**Report Format:**
- Markdown document
- Summary of issues (errors vs. warnings)
- Breakdown by invoice type
- Recommendations for remediation

**Success Criteria:**
- 0 critical MRA compliance violations
- 0 missing required fields
- 0 invalid VAT rates
- Complete audit trail

---

### 4. Outstanding Invoices Analysis (Aging Report)

**File:** `AGING_ANALYSIS.xlsx`

Aging report for all outstanding (unpaid) invoices:

**Excel Sheets:**

1. **Summary Dashboard**
   - Breakdown by aging bucket (0-30, 31-60, 61-90, 91-120, 120+ days)
   - Total count and amount per bucket
   - Risk assessment
   - Overdue percentage

2. **Detail by Aging Bucket** (5 sheets)
   - One sheet per age range
   - Invoice-level details
   - Days outstanding
   - Payment status (pending, partial, overdue)

3. **By Type**
   - Breakdown: Client invoices vs. Supplier invoices
   - Average days outstanding per type
   - Risk by type

4. **Collection Strategy**
   - Recommended actions per aging bucket
   - Current amount and count
   - Escalation path

**Aging Buckets:**
- **0-30 days:** Standard reminders
- **31-60 days:** Follow-up calls
- **61-90 days:** Formal payment demands
- **91-120 days:** Legal notices
- **120+ days:** Escalation/Legal action (HIGH RISK)

**Success Criteria:**
- All outstanding invoices captured
- Accurate age calculations
- Clear collection priority
- Risk level assessment

---

## Setup & Execution

### Prerequisites

1. **Environment Variables**

   Ensure these are set in your shell:
   ```bash
   export NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

   Or set in `.env.local` and source them:
   ```bash
   source .env.local
   ```

2. **Dependencies**

   The project already has `xlsx` (SheetJS) and `@supabase/supabase-js` installed.

### Run All Extractions

```bash
bash scripts/phase2-invoice-extraction/run-all.sh
```

This will:
1. Create `/exports` directory
2. Run all 4 extractions in sequence
3. Display summary of results
4. List all exported files

### Run Individual Extractions

If you need to run one extraction at a time:

```bash
# 1. Complete Invoice Register
npx ts-node scripts/phase2-invoice-extraction/extract-complete-register.ts

# 2. GL Traceability (50-sample)
npx ts-node scripts/phase2-invoice-extraction/extract-gl-traceability.ts

# 3. MRA Compliance Check
npx ts-node scripts/phase2-invoice-extraction/check-mra-compliance.ts

# 4. Aging Analysis
npx ts-node scripts/phase2-invoice-extraction/extract-aging-analysis.ts
```

---

## Database Schema Overview

The extraction scripts use these tables:

### `factures` (Invoices)
```sql
id UUID
numero_facture TEXT
date_facture DATE
type_facture TEXT ('client' | 'fournisseur')
tiers TEXT
montant_ht NUMERIC
montant_ttc NUMERIC
montant_tva NUMERIC
taux_tva NUMERIC
statut TEXT ('en_attente', 'partiel', 'paye', 'retard', 'annule')
created_at TIMESTAMPTZ
```

### `factures_paiements` (Payment History)
```sql
id UUID
facture_id UUID
date_paiement DATE
montant_mur NUMERIC
reference TEXT
source TEXT ('manuel', 'rapprochement', 'backfill')
created_at TIMESTAMPTZ
```

### `ecritures_comptables_v2` (GL Entries)
```sql
id UUID
facture_id UUID (nullable)
date_ecriture DATE
journal TEXT
numero_compte TEXT
debit_mur NUMERIC
credit_mur NUMERIC
ref_folio TEXT
created_at TIMESTAMPTZ
```

---

## Output Files Structure

All files are exported to `/exports/`:

```
exports/
├── INVOICE_REGISTER_COMPLETE.csv              (Deliverable 1)
├── INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx     (Deliverable 2)
├── INVOICE_MRA_COMPLIANCE.md                  (Deliverable 3)
└── AGING_ANALYSIS.xlsx                        (Deliverable 4)
```

---

## Validation & Quality Checks

### Complete Register
- Count matches factures table total
- All required columns populated
- No NULL values in critical fields (number, date, amount)
- Payment dates are later than invoice dates

### GL Traceability
- Every sampled invoice has at least one GL entry
- Invoice amount = sum of GL entries (within tolerance)
- GL entries have valid journal codes (ACH, VTE, BQ, OD, SAL)
- Timestamps are chronologically valid

### MRA Compliance
- No invoice numbers missing
- No duplicate invoice numbers per type
- All VAT rates are valid (0, 8, 19)
- VAT calculation matches: (HT * rate) = VAT ±0.01

### Aging Analysis
- Only unpaid/partially-paid invoices included
- Days outstanding calculated from invoice date to today
- Buckets are mutually exclusive and exhaustive
- Total amount = sum of all bucket amounts

---

## Common Issues & Troubleshooting

### Missing Environment Variables
```
ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
```

**Solution:**
```bash
# Check if variables are set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# If not, set them
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
```

### Database Connection Error
```
Error: Failed to fetch from Supabase
```

**Solution:**
- Verify the URL is correct (use `https://...supabase.co`)
- Verify the service role key is valid
- Check network connectivity
- Ensure Supabase project is active

### No Data Found
```
No invoices found in past 12 months
```

**Likely Causes:**
- No invoices created yet
- Invoice dates are not in the past 12 months
- Wrong date range in the script

**Solution:**
- Create test invoices or adjust date range in scripts

### GL Mismatch in Traceability Report
```
Mismatches found: 3
```

**Investigation:**
1. Check the detailed invoice sheets in the Excel file
2. Look at GL entries linked to that invoice
3. Verify invoice amount = sum of GL debit - credit
4. Check for partial payments or reversals

---

## Recommendations

### Short-term (Week 3-4)
1. Run all 4 extractions
2. Address any critical MRA compliance issues
3. Investigate GL mismatches (if any)
4. Review aging report and develop collection strategy

### Medium-term (Month 2)
1. Implement automated compliance checks (monthly)
2. Set up alerts for overdue invoices (60+ days)
3. Establish invoice number validation rules
4. Document any deviations from MRA requirements

### Long-term (Ongoing)
1. Monthly aging analysis and collection updates
2. Quarterly MRA compliance audits
3. GL traceability spot-checks (random 10-20 invoices)
4. Supplier registration verification

---

## Performance Notes

- **Complete Register:** ~5-10 seconds (depends on invoice count)
- **GL Traceability:** ~30-60 seconds (queries GL for each of 50 invoices)
- **MRA Compliance:** ~5-10 seconds
- **Aging Analysis:** ~5-10 seconds
- **Total runtime:** ~1-2 minutes for all extractions

For large datasets (>10k invoices), consider:
- Running extractions during off-peak hours
- Adjusting the sample size in GL traceability
- Using date range filters

---

## Support & Questions

For technical issues or questions:
1. Check the script logs for specific error messages
2. Verify environment variables and database connectivity
3. Review the database schema and table relationships
4. Contact the Lexora technical team

---

**Last Updated:** 2026-05-22  
**Version:** 1.0
