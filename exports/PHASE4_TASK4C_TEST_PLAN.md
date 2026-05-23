# PHASE 4, Task 4C - Invoice Traceability Testing
## Comprehensive Test Plan & Execution Guide

**Timeline:** Weeks 7-8  
**Effort:** 20 hours  
**Owner:** Finance + Tech  
**Status:** Test Framework Ready

---

## MISSION
Test complete invoice-to-GL traceability on 50 sample invoices across multiple dimensions:
- Invoice data integrity
- GL account postings
- Amount matching
- Approval trail completeness
- MRA compliance

---

## DELIVERABLES

### 1. Sample Selection (50 Invoices)

**Stratification Strategy:**
- **Time Dimension:** Monthly distribution (12 months, ~4 invoices per month)
- **Document Type:** Mix of customer (411) and supplier (4401) invoices
- **Amount Ranges:**
  - < 100 MUR (micro transactions)
  - 100-500 MUR
  - 500-2,000 MUR
  - 2,000-10,000 MUR
  - > 10,000 MUR
- **Tax Treatments:** 19%, 8%, 0%, exempt

**Selection Logic:**
```sql
-- Stratified sampling by month, type, amount bucket, tax rate
-- 2 invoices per month per type = ~50 total
-- Sample selection performed in invoice_traceability_testing.sql
```

**Rationale:** This ensures broad coverage of business scenarios and edge cases.

---

### 2. Traceability Test for Each Invoice

#### Step 1: Locate Invoice in System
**Query:** `SELECT * FROM factures WHERE id = ?`

**Verification Checklist:**
- [ ] Invoice record exists
- [ ] Unique invoice number per type
- [ ] Date_facture populated
- [ ] Tiers (customer/supplier) identified
- [ ] Montant_ht, montant_tva, montant_ttc calculated

**Expected Result:** 100% of invoices located

---

#### Step 2: Verify Required Fields
**Fields Checked:**

| Field | Type | Requirement |
|-------|------|-------------|
| numero_facture | TEXT | Unique, sequential per type |
| date_facture | DATE | Required, not future-dated |
| tiers | TEXT | Customer/supplier name, not null |
| montant_ht | NUMERIC | > 0 |
| montant_tva | NUMERIC | >= 0, calculated per rate |
| montant_ttc | NUMERIC | = HT + VAT |
| taux_tva | NUMERIC | 0, 8, 19, or documented exception |
| created_by | UUID | User who created invoice |
| created_at | TIMESTAMPTZ | Invoice creation timestamp |

**Success Criteria:** All required fields present and valid

---

#### Step 3: Locate GL Entries
**Query:**
```sql
SELECT * FROM ecritures_comptables_v2
WHERE facture_id = '[INVOICE_ID]' OR ref_folio = '[INVOICE_NUMBER]'
```

**Expected Entries:** 2-3 GL entries per invoice

| Invoice Type | Expected GL Accounts |
|--------------|---------------------|
| **Customer** | 411 (receivable) + 706 (revenue) + 441 (VAT collected) |
| **Supplier** | 4401 (payable) + 6xx (expense) + 4456 (VAT paid) |

**Success Criteria:** All expected accounts posted

---

#### Step 4: Verify GL Account Postings
**Validation:**

| Invoice Type | Account | Expected Amount | GL Field |
|--------------|---------|-----------------|----------|
| **Customer** | 411 | Invoice HT | Debit |
| **Customer** | 706 | Invoice HT | Credit |
| **Customer** | 441 | Invoice VAT | Credit |
| **Supplier** | 4401 | Invoice HT | Credit |
| **Supplier** | 6xx | Invoice HT | Debit |
| **Supplier** | 4456 | Invoice VAT | Debit |

**Rounding Tolerance:** < 0.01 MUR (1 cent)

**Success Criteria:**
- Correct accounts posted for document type
- Amounts match invoice HT/VAT
- No rounding errors exceeding 1 cent

---

#### Step 5: Verify Amounts Match
**Calculation:**
```
GL Total Debit = GL Total Credit
GL Total Amount ≈ Invoice Montant_TTC (within 0.01 MUR)
```

**Example (Customer Invoice: 1,000 HT @ 19% VAT):**
```
Invoice: HT=1,000, VAT=190, TTC=1,190

GL Entries:
  411 Receivable      | Debit: 1,000 | Credit:        |
  706 Revenue         | Debit:       | Credit: 1,000  |
  441 VAT Collected   | Debit:       | Credit: 190    |
  ────────────────────────────────────────────────────
  Total Balance:        Debit: 1,000 | Credit: 1,190  ❌ IMBALANCE

CORRECTED GL:
  411 Receivable      | Debit: 1,190 | Credit:        |
  706 Revenue         | Debit:       | Credit: 1,000  |
  441 VAT Collected   | Debit:       | Credit: 190    |
  ────────────────────────────────────────────────────
  Total Balance:        Debit: 1,190 | Credit: 1,190  ✓ BALANCED
```

**Success Criteria:**
- Debit total = Credit total
- No amounts missing or miscalculated
- Tax rate applied correctly

---

#### Step 6: Verify Approval Trail
**Checks:**

| Field | Requirement |
|-------|-------------|
| invoice.created_by | Non-null, valid user ID |
| invoice.created_at | Timestamp, not future |
| invoice.updated_at | >= created_at |
| ecriture.created_by | Non-null, valid user ID |
| Segregation of Duties | created_by ≠ approved_by |

**Success Criteria:**
- Creator identified and logged
- Separate approver (or documented override)
- Audit trail complete and logical

---

### 3. Traceability Report (Excel)

**File:** `/exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx`

**Structure:**

#### Sheet 1: Traceability Details
| Column | Description |
|--------|-------------|
| Invoice # | Invoice number |
| Date | Date_facture |
| Type | client \| fournisseur |
| Amount (HT) | Montant_ht |
| VAT | Montant_tva |
| Amount (TTC) | Montant_ttc |
| Tax Rate % | Taux_tva |
| Customer/Supplier | Tiers |
| GL Entries | Count of posted GL entries |
| Accounts Posted | Comma-separated account list |
| GL Debit | Total debit amount |
| GL Credit | Total credit amount |
| Balanced | YES \| NO |
| Amount Match | YES \| NO |
| **Status** | PASS \| FAIL (conditional formatting) |
| Approval Trail | YES \| NO |
| Creator | Email of created_by user |
| Exception | Exception type (if any) |

**Conditional Formatting:**
- **Status = PASS:** Green background
- **Status = FAIL:** Red background

#### Sheet 2: Summary Statistics
- Total invoices tested: 50
- Passed traceability: X (X%)
- Failed traceability: Y (Y%)
- Invoices with exceptions: Z
- Exception breakdown by type

**Success Criteria:**
- 100% of 50 invoices traced
- >= 95% pass rate (max 3 exceptions)
- All exceptions documented

---

### 4. Exception Documentation (Markdown)

**File:** `/exports/TRACEABILITY_EXCEPTIONS.md`

**Format per Exception:**

```markdown
### Exception #N: Invoice [NUMBER]

| Field | Value |
|-------|-------|
| Invoice Date | YYYY-MM-DD |
| Type | client / fournisseur |
| Amount (TTC) | XXXX.XX MUR |
| **Issue** | Description of problem |
| Root Cause | Why it happened |
| Corrective Action | How to fix it |
| Status | PENDING_REVIEW / RESOLVED |
```

**Root Cause Categories:**

1. **No GL Entries** (Type: CRITICAL)
   - Description: Invoice not posted to GL
   - Likely Cause: System bypass, manual invoice, deleted entries
   - Fix: Create missing GL entries

2. **Amount Mismatch** (Type: HIGH)
   - Description: GL total != Invoice total
   - Likely Cause: Rounding error, account mismatch, partial posting
   - Fix: Correct GL amounts

3. **GL Imbalance** (Type: HIGH)
   - Description: Debit total != Credit total
   - Likely Cause: Missing entry, double posting, wrong account
   - Fix: Verify and repost GL entries

4. **Missing Creator** (Type: MEDIUM)
   - Description: No created_by on invoice or GL entry
   - Likely Cause: Manual data entry, migration issue
   - Fix: Add audit trail metadata

5. **Segregation of Duties Violation** (Type: MEDIUM)
   - Description: Creator = Approver
   - Likely Cause: Single-user company or system default
   - Fix: Ensure different users for create/approve

---

### 5. MRA Compliance Check (Markdown)

**File:** `/exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md`

**Checks per Invoice:**

| Check | Requirement | MRA Justification |
|-------|-------------|-------------------|
| Sequential Numbering | No gaps per type | Invoice traceability & audit trail |
| Date Present | Not null, not future | GL posting date & revenue recognition |
| Customer/Supplier Name | Tiers identified | Master data for VAT reporting |
| SIRET/VAT Number | Where applicable | Cross-checking supplier legitimacy |
| Tax Rate Valid | 0%, 8%, 19% | Standard MRA rates |
| HT/VAT Separation | Clear amounts | VAT return calculation |
| GL Account Coding | To CoA | Tax compliance & reporting |
| Approval Trail | Created by ≠ Approved by | Segregation of duties |

**Compliance Metrics:**

```
Overall Compliance Rate = (Invoices with all checks OK / Total invoices) × 100%

Target: >= 98% (max 1 non-compliant invoice)
```

**MRA Declarations Affected:**
- Form 3 (Income/VAT Return)
- NSF/CSG Contributions
- TDS Reporting

---

## SUCCESS CRITERIA (HARD TARGETS)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| 50 invoices traced | 100% | All 50 in sample located & tested |
| Amount matching | 100% | Zero unresolved discrepancies |
| GL balance | 100% | Debit = Credit for all entries |
| Approval trail | 100% | Creator ≠ Approver (or justified) |
| Exception count | 0-3 | Max 3 unresolved issues |
| MRA compliance | >= 98% | Max 1 non-compliant invoice |
| Report completeness | 100% | All 3 reports delivered |

---

## EXECUTION WORKFLOW

### Prerequisites
- [ ] Access to Supabase database
- [ ] ExcelJS npm package installed
- [ ] Write access to `/exports` directory
- [ ] Test data: >= 50 invoices in database

### Steps

1. **Execute SQL Test Script**
   ```bash
   psql -d supabase_db -f scripts/invoice_traceability_testing.sql > /tmp/test_results.json
   ```

2. **Generate Reports**
   ```bash
   npx ts-node scripts/invoice_traceability_report.ts
   ```

3. **Review Outputs**
   - Open `/exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx`
   - Review `/exports/TRACEABILITY_EXCEPTIONS.md`
   - Check `/exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md`

4. **Verify Success Criteria**
   - [ ] 50 invoices present in report
   - [ ] PASS rate >= 95%
   - [ ] All exceptions documented
   - [ ] Zero compliance violations (or justified)

5. **Escalate Exceptions** (if any)
   - Document root cause
   - Assign corrective action owner
   - Schedule follow-up testing

---

## TRACEABILITY MATRIX

### Invoice Data → GL Mapping

#### Customer Invoice (Facture Client)
```
INVOICE DATA:
  Numero: INV-2025-001
  Date: 2025-01-15
  Customer: ACME Corp
  HT: 1,000 MUR
  VAT (19%): 190 MUR
  TTC: 1,190 MUR

GL MAPPING:
  411 (Receivable)   | Debit 1,190  | Customer account
  706 (Revenue)      | Credit 1,000 | Sales revenue
  441 (VAT Collected)| Credit 190   | Output VAT
  
TRACEABILITY LINK:
  ecritures_comptables_v2.facture_id = factures.id
  ecritures_comptables_v2.ref_folio = factures.numero_facture
```

#### Supplier Invoice (Facture Fournisseur)
```
INVOICE DATA:
  Numero: SUPP-2025-001
  Date: 2025-01-20
  Supplier: ABC Services
  HT: 500 MUR
  VAT (19%): 95 MUR
  TTC: 595 MUR

GL MAPPING:
  4401 (Payable)     | Credit 595  | Supplier account
  617 (Services)     | Debit 500   | Service expense
  4456 (VAT Paid)    | Debit 95    | Input VAT
  
TRACEABILITY LINK:
  ecritures_comptables_v2.facture_id = factures.id
  ecritures_comptables_v2.ref_folio = factures.numero_facture
```

---

## TESTING NOTES

### Edge Cases Covered
- Zero-amount invoices (excluded from test)
- Invoices with missing GL entries
- Invoices with partial GL postings
- Invoices with GL imbalances
- Invoices with incorrect tax rates
- Invoices with missing approval data
- Multi-currency invoices (if applicable)

### Known Limitations
- SQL test assumes `facture_id` FK populated (migration 133)
- If `ref_folio` is only match, may have duplicates
- Approval trail relies on `created_by` populate (audit requirement)
- Tax rate validation based on Mauritian standard rates (0%, 8%, 19%)

### Retry Logic
- Failed queries logged to console
- Manual query execution available for debugging
- Exception details captured for post-test analysis

---

## ARTIFACTS & HANDOFF

**Deliverables:**
1. ✅ `/exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx` — Detailed test results (Excel)
2. ✅ `/exports/TRACEABILITY_EXCEPTIONS.md` — Exception analysis & corrective actions (Markdown)
3. ✅ `/exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md` — MRA compliance validation (Markdown)

**Next Steps:**
- [ ] Auditor reviews reports
- [ ] Finance team addresses exceptions
- [ ] IT implements corrective actions
- [ ] Retest on corrected data (if needed)
- [ ] Sign-off for GL close procedures

**Audit Trail:**
```
Tested By: Finance + Tech Team
Test Date: 2025-05-22
Sample Size: 50 invoices
Pass Rate: TBD (after execution)
Auditor: TBD (external review)
```

---

## REFERENCES

- **Migration 133:** `ecritures_comptables_v2.facture_id` link
- **Migration 237:** `factures_paiements` traceability
- **Mauritian VAT:** Standard rate 19%, reduced 8%, zero 0%
- **GL Chart of Accounts:** See company CoA documentation
- **MRA Requirements:** Form 3, NSF, CSG, TDS

---

**Status:** Framework Ready for Execution  
**Next Action:** Execute scripts and generate reports  
**Owner:** Finance + Tech Team  
**Deadline:** End of Week 8
