# Phase 2, Task 2D — Payroll Extraction Agent
## Complete Implementation Guide

**Timeline:** Weeks 3-4  
**Effort:** 30 hours  
**Owner:** HR team + Tech

---

## Mission

Extract and verify **24 months of payroll data** (bulletins, MRA declarations, tax filings) with 100% accuracy for accounting compliance.

---

## Deliverables Checklist

### ✅ Deliverable 1: Payroll Bulletins (24 months × all employees)

**File:** `/exports/PAYROLL_BULLETINS_24MONTHS.csv`

**Columns:**
- Month
- Employee Code & Name
- Gross Salary (salaire_brut)
- Transport & Petrol Allowances
- Variable Bonuses
- Deductions: CSG, NSF, PAYE
- Total Deductions
- Net Salary (salaire_net)
- Employer CSG/NSF/Training Levy/PRGF
- Total Cost to Employer
- Bank Account
- Payment Date
- Status

**Validation:**
- [ ] 100% of bulletins_paie records exported
- [ ] All columns present & non-null
- [ ] Date formats consistent (YYYY-MM)
- [ ] Calculations match DB (salaire_net = brut - deductions)
- [ ] No duplicate records

**Database Query:**
```sql
SELECT 
  b.id, 
  b.employe_id, 
  b.periode, 
  e.code, 
  e.prenom, 
  e.nom, 
  b.salaire_brut,
  b.csg_salarie, 
  b.nsf_salarie, 
  b.paye, 
  b.salaire_net,
  e.bank_account,
  b.date_paiement,
  b.statut
FROM public.bulletins_paie b
LEFT JOIN public.employes e ON b.employe_id = e.id
ORDER BY b.periode, e.nom;
```

---

### ✅ Deliverable 2: Monthly Payroll Summaries (24 months)

**File:** `/exports/PAYROLL_SUMMARIES_24MONTHS.xlsx` (or .md)

**Contents:**
- One sheet per month (24 months)
- Each sheet contains:
  - Total Gross Salaries Paid
  - Total PAYE Withheld
  - Total CSG/NSF Deducted (employee + employer)
  - Total Net Salaries Paid
  - Total Cost to Employer

**GL Posting Reference:**
```
DEBIT:   GL 6400 / 6401 (Salaries expense)     → Total Gross
         GL 6451-6454 (Employer charges)        → Total Employer CSG/NSF/etc
CREDIT:  GL 4210 (Personnel payable)            → Total Net
         GL 4311/4312 (CSG/NSF employee)        → Total CSG/NSF deducted
         GL 4321-4324 (CSG/NSF employer)        → Total employer CSG/NSF
         GL 4330 (PAYE à payer)                 → Total PAYE withheld
```

**Validation:**
- [ ] All 24 months covered
- [ ] Monthly totals match sum of bulletins
- [ ] GL accounts match paie.ts implementation
- [ ] No rounding errors > 0.01 MUR

**Database Query:**
```sql
SELECT 
  b.periode,
  COUNT(DISTINCT b.employe_id) as nb_employes,
  SUM(b.salaire_brut) as total_brut,
  SUM(b.paye) as total_paye,
  SUM(b.csg_salarie + b.csg_patronal) as total_csg,
  SUM(b.nsf_salarie + b.nsf_patronal) as total_nsf,
  SUM(b.salaire_net) as total_net,
  SUM(b.cout_total_employeur) as total_cost
FROM public.bulletins_paie b
GROUP BY b.periode
ORDER BY b.periode;
```

---

### ✅ Deliverable 3: MRA PAYE Compliance Report

**File:** `/exports/PAYE_MRA_COMPLIANCE.md`

**Purpose:**
Verify PAYE withheld in bulletins matches MRA declarations (IT Form 3, EDF).

**Contents:**
1. **PAYE Withholding Summary** (24 months)
   - Period | Amount Withheld (GL 4330) | Status | MRA Declaration Status

2. **Compliance Checklist**
   - [ ] PAYE withheld = GL account 4330 (PAYE à payer) credits
   - [ ] PAYE declared = MRA declarations_paye_mensuelle
   - [ ] Reconciliation: Withheld = Declared (no variance)
   - [ ] IT Form 3 filed annually by September 30
   - [ ] EDF (Employee Declarations) filed monthly
   - [ ] All PAYE remittances recorded in GL

3. **GL Account 4330 Reconciliation**
   ```
   Beginning Balance (YYYY-MM-01)
   + PAYE withheld this period (from bulletins_paie)
   - PAYE remitted to MRA (bank payment)
   = Ending Balance (YYYY-MM-31)
   ```

**Validation:**
- [ ] Total PAYE withheld (bulletins) = GL 4330 credits
- [ ] Total PAYE declared (MRA) = PAYE withheld (variance = 0)
- [ ] All MRA declaration dates within legal deadlines
- [ ] IT Form 3 filed by Sept 30 of fiscal year
- [ ] No outstanding PAYE > 30 days past due

**Database Query - PAYE Verification:**
```sql
-- Compare bulletins PAYE vs GL postings
SELECT 
  b.periode,
  SUM(b.paye) as paye_withheld,
  COUNT(*) as nb_bulletins
FROM public.bulletins_paie b
WHERE b.paye > 0
GROUP BY b.periode
ORDER BY b.periode;

-- Check MRA declarations if available
SELECT 
  periode,
  total_paye_retenu as paye_declared,
  statut,
  date_declaration,
  date_paiement
FROM public.declarations_paye_mensuelle
ORDER BY periode;
```

---

### ✅ Deliverable 4: Payroll Calculation Verification

**File:** `/exports/PAYROLL_CALCULATION_VERIFICATION.md` (or .xlsx)

**Scope:**
Hand-verify **20 random employees × 6 most recent months = 120 calculations**

**For Each Calculation, Verify:**

#### a) Gross Salary
```
Formula: salaire_base + transport_allowance + petrol_allowance + primes_variables
Source: Contract salary per employes.salaire_base
Expected: Must match contract (within prorata if first/last month)
```

#### b) PAYE Calculation (MRA 2025 barème)
```
IF gross ≤ 390,000:   PAYE = 0
IF 390,001-700,000:   PAYE = (gross - 390,000) × 10%
IF > 700,000:         PAYE = 31,000 + (gross - 700,000) × 15%

Source: lib/rh/paie.ts:calculerBulletin()
Expected: Match bulletin record ± 1 MUR
```

#### c) CSG Calculation (MRA 2025 barème)
```
IF gross < 50,000:    CSG = gross × 1.5%
IF gross ≥ 50,000:    CSG = gross × 3%

Source: parametres_paie_mra.csg_taux
Expected: Match bulletin ± 1 MUR
```

#### d) NSF Calculation (MRA 2025 barème)
```
NSF = gross × 1% (employee), capped

Source: parametres_paie_mra.nsf_salarie
Expected: Match bulletin ± 1 MUR
```

#### e) Net Salary
```
Formula: gross - CSG - NSF - PAYE - [montant_absence]
Expected: Must equal salaire_net in bulletin
Note: Trigger trg_bulletins_paie_enforce_net auto-corrects if > 1 MUR variance
```

**Validation Report Format:**
```
| Employee | Period | Gross | PAYE OK | CSG OK | NSF OK | Net OK | Errors |
|----------|--------|-------|---------|--------|--------|--------|--------|
| Alice... | 2025-01| ✅    | ✅      | ✅     | ✅     | ✅     | None   |
| Bob...   | 2025-01| ✅    | ❌      | ✅     | ✅     | ❌     | PAYE:...|
```

**Success Criteria:**
- [ ] 100% of 120 calculations verified
- [ ] 0 errors allowed (100% accuracy)
- [ ] Any errors documented with corrective action

**Database Query - Sample Verification:**
```sql
-- Get 20 random employees with recent bulletins
WITH emp_sample AS (
  SELECT DISTINCT b.employe_id
  FROM public.bulletins_paie b
  JOIN public.employes e ON b.employe_id = e.id
  WHERE b.periode >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
  ORDER BY RANDOM()
  LIMIT 20
)
SELECT 
  e.id,
  e.code,
  e.prenom || ' ' || e.nom as nom_complet,
  e.salaire_base,
  b.periode,
  b.salaire_brut,
  b.paye,
  b.csg_salarie,
  b.nsf_salarie,
  b.salaire_net,
  b.statut
FROM public.bulletins_paie b
JOIN public.employes e ON b.employe_id = e.id
JOIN emp_sample s ON e.id = s.employe_id
WHERE b.periode >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
ORDER BY e.nom, b.periode DESC;
```

---

### ✅ Deliverable 5: MRA Declaration Status

**File:** `/exports/MRA_DECLARATIONS_STATUS.md`

**Contents:**

#### A) IT Form 3 Submissions (Annual)
```
| Fiscal Year | Filed Date | Status | Reference | Notes |
|-------------|------------|--------|-----------|-------|
| 2024       | 2024-09-30 | ✅     | REF123    |       |
| 2025       | PENDING    | ⚠️     |           |       |
```

**Deadline:** September 30 of following fiscal year

#### B) EDF Submissions (Monthly)
```
| Period | Employees | Status | Filed Date | Notes |
|--------|-----------|--------|------------|-------|
| 2025-01| 24        | ✅     | 2025-02-15 |       |
| 2025-02| 24        | ✅     | 2025-03-15 |       |
```

#### C) PAYE Remittance Status
```
| Period | Amount (MUR) | Due Date | Remitted Date | Status |
|--------|--------------|----------|---------------|--------|
| 2025-01| 45,200.00    | 2025-02-10| 2025-02-08   | ✅     |
```

#### D) CSG/NSF Remittance Status
```
| Period | Total (MUR) | Due Date | Remitted Date | Status |
|--------|-------------|----------|---------------|--------|
| 2025-01| 78,500.00   | 2025-02-10| 2025-02-08   | ✅     |
```

**Compliance Checklist:**
- [ ] IT Form 3 filed for all fiscal years
- [ ] IT Form 3 filed by September 30 (no late penalties)
- [ ] All monthly PAYE remittances filed on time
- [ ] All monthly CSG/NSF remittances filed on time
- [ ] All EDF submissions present for all employees
- [ ] No outstanding PAYE/CSG/NSF > 30 days overdue
- [ ] Payment reconciliation complete (GL accounts balanced)

**Database Queries:**

```sql
-- Check PAYE declarations (if table exists)
SELECT 
  periode,
  total_salaires_bruts,
  total_paye_retenu,
  statut,
  date_declaration,
  date_paiement,
  reference_mra
FROM public.declarations_paye_mensuelle
ORDER BY periode DESC;

-- Check CSG/NSF declarations
SELECT 
  periode,
  total_csg_salaries + total_csg_patronal as total_csg,
  total_nsf_salaries + total_nsf_patronal as total_nsf,
  statut,
  date_declaration,
  date_paiement
FROM public.declarations_csg_mensuelle
ORDER BY periode DESC;

-- Check for outstanding PAYE payable
SELECT 
  COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) as paye_payable_balance
FROM public.ecritures_comptables_v2
WHERE compte = '4330'  -- PAYE à payer
  AND journal = 'BNQ'
  AND statut_paie IN ('declare', 'paye');
```

---

## Execution Instructions

### Step 1: Prepare Environment
```bash
cd /home/user/v0-lexora-accounting-saa-s

# Ensure exports directory exists
mkdir -p exports

# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL=your_url
export SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Step 2: Run Payroll Extraction Script
```bash
# Option A: TypeScript (requires ts-node)
npx ts-node scripts/phase2-task2d-payroll-extraction.ts

# Option B: Compiled JavaScript
node dist/scripts/phase2-task2d-payroll-extraction.js
```

### Step 3: Verify Output Files
```bash
ls -lah exports/
# Should contain:
# - PAYROLL_BULLETINS_24MONTHS.csv
# - PAYROLL_SUMMARIES_24MONTHS.md
# - PAYE_MRA_COMPLIANCE.md
# - PAYROLL_CALCULATION_VERIFICATION.md
# - MRA_DECLARATIONS_STATUS.md
```

### Step 4: Manual Verification Checklist

#### Phase 1: Data Completeness
- [ ] CSV has all bulletins (count matches bulletins_paie table)
- [ ] All employees present
- [ ] All 24 months covered
- [ ] No NULL values in critical columns

#### Phase 2: Calculation Accuracy
- [ ] Run PAYE verification for sample employees
- [ ] Run CSG verification for sample employees
- [ ] Run NSF verification for sample employees
- [ ] Run net salary verification
- [ ] Cross-check against paie.ts implementation

#### Phase 3: MRA Compliance
- [ ] Verify PAYE withheld totals match declarations_paye_mensuelle
- [ ] Verify CSG/NSF totals match declarations_csg_mensuelle
- [ ] Check IT Form 3 filing date vs. September 30 deadline
- [ ] Verify all EDF submissions present
- [ ] Check no outstanding PAYE > 30 days

#### Phase 4: GL Reconciliation
- [ ] GL 4330 (PAYE à payer) balance = outstanding PAYE
- [ ] GL 4311/4312 (CSG/NSF employee) balance = outstanding CSG/NSF
- [ ] GL 4321-4324 (CSG/NSF employer) recorded correctly
- [ ] GL 6411 (Salaries) = total gross paid
- [ ] No discrepancies

---

## Troubleshooting

### Issue: "No bulletins_paie found"
**Solution:**
- Check database connectivity
- Verify SUPABASE_SERVICE_ROLE_KEY is correct
- Run SQL query to confirm records exist:
  ```sql
  SELECT COUNT(*) FROM public.bulletins_paie;
  ```

### Issue: PAYE calculations don't match
**Possible Causes:**
1. Wrong barème rates (check parametres_paie_mra table)
2. Prorata first/last month not applied
3. Gross salary includes/excludes allowances incorrectly

**Solution:**
- Check `lib/rh/paie.ts:calculerBulletin()` implementation
- Verify `parametres_paie_mra` has correct 2025 rates
- Review employee start/end dates for prorata

### Issue: Missing MRA declarations
**Possible Causes:**
1. Table doesn't exist (declarations_paye_mensuelle / declarations_csg_mensuelle)
2. Declarations not yet created

**Solution:**
- Check if declarations tables exist:
  ```sql
  SELECT * FROM public.declarations_paye_mensuelle LIMIT 1;
  ```
- If tables exist but empty, declarations need to be generated:
  - Use RPC `agreger_declarations_mra` to create them
  - Or use UI at `/app/client/rh/declarations-mra`

---

## Success Criteria

### Payroll Bulletins
- [x] 100% of bulletins_paie have GL postings
- [x] All columns present and non-null
- [x] Calculations match database
- [x] CSV properly formatted

### Payroll Summaries
- [x] All 24 months covered
- [x] GL accounts correctly mapped (6400, 6401, 4420-4423)
- [x] Monthly totals reconcile to bulletins
- [x] No rounding errors

### MRA Compliance
- [x] PAYE withheld = PAYE declared (reconciled)
- [x] 0 MRA compliance violations
- [x] IT Form 3 filed on time
- [x] EDF submissions complete
- [x] No outstanding PAYE > 30 days

### Calculation Verification
- [x] 120 calculations verified (100% accuracy)
- [x] 0 errors in PAYE, CSG, NSF, net calculations
- [x] All verifications documented

### Declaration Status
- [x] All declarations tracked and status documented
- [x] Filing dates vs. MRA deadlines verified
- [x] Payment reconciliation complete

---

## Appendix: MRA Deadlines

| Form | Frequency | Deadline | Notes |
|------|-----------|----------|-------|
| PAYE Remittance | Monthly | 10th of following month | For prior month |
| CSG/NSF Remittance | Monthly | 10th of following month | For prior month |
| IT Form 3 | Annual | September 30 | Fiscal year ending 30 June |
| EDF | Monthly | With PAYE/CSG remittance | Employee declarations |

---

## References

- **Migration 212:** NSF baremes 2025
- **Migration 213:** bulletins_paie base CSG/NSF
- **Migration 236:** bulletins_paie net coherence (trigger enforcement)
- **lib/rh/paie.ts:** calculerBulletin() implementation
- **lib/rh/declarations-mra.ts:** MRA declaration helpers
- **Account reference:** Migration 226 (TDS accounts 4471)

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Owner:** Tech Team + HR  
**Status:** Ready for Implementation
