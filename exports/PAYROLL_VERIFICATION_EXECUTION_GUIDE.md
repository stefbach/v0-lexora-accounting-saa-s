# PHASE 4, Task 4D: Payroll Verification Testing — Execution Guide

## Quick Start Checklist

- [ ] Review PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md (comprehensive requirements)
- [ ] Execute SQL queries from PAYROLL_VERIFICATION_SQL_QUERIES.sql
- [ ] Populate Excel workbook: PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx
- [ ] Hand-verify 120 samples (20 employees × 6 months)
- [ ] Document all variances (> ±0.01 MUR) in PAYROLL_VARIANCES.md
- [ ] Create MRA compliance report: PAYROLL_MRA_COMPLIANCE_VERIFICATION.md
- [ ] Deliver to auditor

---

## File Locations

All deliverables are in: `/exports/`

| File | Purpose | Status |
|------|---------|--------|
| PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md | Complete methodology | READY |
| PAYROLL_VERIFICATION_SQL_QUERIES.sql | SQL verification queries | READY |
| PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx | Hand-verification workbook | TEMPLATE READY |
| PAYROLL_VARIANCES.md | Variance documentation | TO CREATE |
| PAYROLL_MRA_COMPLIANCE_VERIFICATION.md | MRA compliance sign-off | TO CREATE |

---

## Week 7: Setup Phase

### Task 7.1: Sample Selection & Documentation (2 hours)

**Owner:** HR Manager

1. **Confirm 20-employee sample:**
   ```sql
   SELECT code, nom, poste, salaire_base FROM employes
   WHERE societe_id = (SELECT id FROM societes WHERE code = 'OCC')
   AND date_depart IS NULL
   LIMIT 20;
   ```

2. **Stratify by salary level:**
   - [ ] Junior (≤30k): 5 employees
   - [ ] Mid (30-45k): 7 employees
   - [ ] Senior (45-60k): 5 employees
   - [ ] Management (60k+): 3 employees

3. **Confirm employment dates:**
   ```sql
   SELECT code, nom, date_arrivee, date_depart, salaire_base
   FROM employes
   WHERE code IN ('000001', '000002', '000003', '000004', '000008', '000009',
                  '000015', '000021', '000023', '000024', '000025', ...)
   ORDER BY code;
   ```

4. **Document justification:**
   - Create file: `/exports/SAMPLE_SELECTION_20_EMPLOYEES.md`
   - Include employee list with stratification rationale
   - Flag partial months (new hires, departures)

### Task 7.2: Gather Employee Data (2 hours)

**Owner:** HR + Tech

1. **Export employment contracts:**
   - Per employee: contract start date, base salary per contract
   - Deductions profile: PAYE category, insurance, loans
   - Any salary changes during 2025-07 to 2025-12? Flag if YES

2. **Query employment data:**
   ```sql
   SELECT
     e.code, e.nom, e.prenom, e.poste,
     e.date_arrivee, e.date_depart,
     e.salaire_base, e.transport_allowance, e.petrol_allowance,
     e.csg_categorie
   FROM employes e
   WHERE e.societe_id = (SELECT id FROM societes WHERE code = 'OCC')
   AND e.code IN ('000001', '000002', ... )
   ORDER BY e.code;
   ```

3. **Document in Excel Sheet "Employee_Data":**
   - Employee code, name, start date, salary level
   - Allowances (transport, petrol)
   - CSG category
   - Service period (full 6 months or partial)

### Task 7.3: Build Verification Workbook (3 hours)

**Owner:** Tech Lead

1. **Excel workbook already created:**
   - Location: `/exports/PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx`
   - 4 sheets ready: Detailed Verification, Summary, Employee Summary, Period Summary, MRA Rates

2. **Populate "Detailed Verification" sheet:**
   - Use SQL query: `PAYROLL_VERIFICATION_SQL_QUERIES.sql` (first query)
   - Export results to CSV
   - Copy to Excel Sheet 1
   - Fill columns: Employee_Code, Employee_Name, Period, Poste, Salary_Level
   - Leave calculation columns blank (to be filled during verification)

3. **Copy MRA 2025 rates to reference sheet:**
   - PAYE barème: 0% (≤390k), 10% (390k-700k), 15% (>700k)
   - CSG: 1.5% (≤50k), 3% (>50k)
   - NSF: 1% salarié, 2.5% patronal
   - NSF cap: 228,000 MUR/month (verify from nsf_baremes)

### Task 7.4: Run Data Quality Checks (1 hour)

**Owner:** Finance

Execute 4 data quality checks from SQL file:

```bash
# Check 1: All bulletins have GL postings
psql -d lexora_prod -c "SELECT COUNT(*) AS bulletins_without_gl FROM bulletins_paie ..."

# Check 2: No missing deductions
psql -d lexora_prod -c "SELECT ... FROM bulletins_paie WHERE paye IS NULL OR ..."

# Check 3: GL balanced
psql -d lexora_prod -c "SELECT ... FROM ecritures_comptables_v2 WHERE journal = 'OD-PAIE' HAVING ABS(...) > 0.01"

# Check 4: No unintended salary changes
psql -d lexora_prod -c "SELECT ... FROM bulletins_paie WHERE code IN (...) HAVING COUNT(DISTINCT salaire_base) > 1"
```

**Expected results:**
- Check 1: 0 rows ✓
- Check 2: 0 rows ✓
- Check 3: 0 rows ✓
- Check 4: 0 rows ✓

**If any check fails:**
- Investigate root cause
- Document issue in `/exports/DATA_QUALITY_ISSUES.md`
- Do NOT proceed to Week 8 until resolved

---

## Week 8: Verification Phase

### Task 8.1: Hand-Verify All 120 Samples (12 hours)

**Owner:** Finance + HR (parallel)

#### For Each Sample (employee_code, period):

**Step 1: Fetch bulletin data**
```sql
SELECT * FROM bulletins_paie
WHERE employe_id = ? AND periode = ?;
```

**Step 2: Calculate Expected Gross**
- Formula: Base + Increment + Transport + Petrol + Special_Allowances + Overtime + Other_Refund + EOY_Bonus + Departure_Notice
- Expected: Match system `salaire_brut`
- Tolerance: ±0.01 MUR
- Record in Excel: Gross_Calculated, Gross_System, Gross_Match (✓/✗)

**Step 3: Verify PAYE**
- Annualize: Gross × 12
- Apply barème:
  - 0-390k: 0%
  - 390k-700k: (Gross - 390k) × 10% ÷ 12
  - 700k+: (310k × 10% + (Gross - 700k) × 15%) ÷ 12
- Expected PAYE: [calculated amount]
- System PAYE: `bulletins_paie.paye`
- Variance: System - Calculated
- Record: PAYE_Calculated, PAYE_System, PAYE_Variance

**Example PAYE Verification:**
```
Sample: 000001, 2025-07
Gross: 56,535 MUR
Annual: 678,420 MUR
Bracket: 390k-700k (10%)
Taxable: 678,420 - 390,000 = 288,420
Annual PAYE: 288,420 × 10% = 28,842
Monthly PAYE: 28,842 ÷ 12 = 2,403.50 MUR
System PAYE: 2,403.50 ✓ MATCH
```

**Step 4: Verify CSG**
- Check threshold: Is Gross > 50,000?
  - If ≤ 50k: CSG = Gross × 1.5%
  - If > 50k: CSG = Gross × 3.0%
- Expected CSG: [calculated]
- System CSG: `bulletins_paie.csg_salarie`
- Variance: System - Calculated
- Record: CSG_Calculated, CSG_System, CSG_Variance

**Example CSG Verification:**
```
Gross: 56,535 MUR (> 50,000)
CSG Rate: 3.0%
Expected CSG: 56,535 × 0.03 = 1,696.05
System CSG: 1,696.05 ✓ MATCH
```

**Step 5: Verify NSF**
- Check NSF barème cap for period (query `nsf_baremes`)
- If Gross > cap: NSF = Cap × 1%
- If Gross ≤ cap: NSF = Gross × 1%
- Expected NSF: [calculated]
- System NSF: `bulletins_paie.nsf_salarie`
- Variance: System - Calculated
- Record: NSF_Calculated, NSF_System, NSF_Variance

**Example NSF Verification:**
```
Gross: 56,535 MUR
NSF Cap (2025): 228,000 MUR (Gross under cap)
Expected NSF: 56,535 × 0.01 = 565.35
System NSF: 565.35 ✓ MATCH
```

**Step 6: Calculate Net**
- Formula: Gross - (PAYE + CSG + NSF + Other_Deductions)
- Expected Net: [calculated]
- System Net: `bulletins_paie.salaire_net`
- Variance: System - Calculated
- Record: Net_Calculated, Net_System, Net_Variance

**Example Net Verification:**
```
Gross: 56,535.00
PAYE: 2,403.50
CSG: 1,696.05
NSF: 565.35
Total Deductions: 4,664.90
Expected Net: 56,535 - 4,664.90 = 51,870.10
System Net: 51,870.10 ✓ MATCH
```

**Step 7: Verify GL Posting**
- Query GL entries for period/journal='OD-PAIE'
- Confirm:
  - Account 6411 (debit) = Gross ✓
  - Account 4210 (credit) = Net ✓
  - Account 4330 (credit) = PAYE ✓
  - Account 4311/4312 (credit) = CSG + NSF ✓
- Record: GL_6411_Match, GL_4210_Match, GL_4330_Match, GL_4311_Match

**Step 8: Final Status**
- If Gross_Match = ✓ AND PAYE_Variance ≤ 0.01 AND CSG_Variance ≤ 0.01 AND NSF_Variance ≤ 0.01 AND Net_Variance ≤ 0.01 AND all GL match = ✓
  - Status: **PASS**
- Otherwise:
  - Status: **FAIL**
  - Document in PAYROLL_VARIANCES.md

#### Verification Pace

- **120 samples total**
- **Recommended pace: 15 samples per day** (2 hours/day × 5 days = 10 hours)
- Parallel work by HR + Finance to verify in parallel

### Task 8.2: Aggregate Results (1 hour)

**Owner:** Finance Lead

After all 120 samples verified:

1. **Summary Statistics Sheet:**
   - Total Samples: 120
   - Passed: [count where Status = PASS]
   - Failed: [count where Status = FAIL]
   - % Pass Rate: (Passed / 120) × 100
   - Variances > 0.01 MUR: [count]

2. **Employee Summary Sheet:**
   - Per employee: Samples, Passed, Failed, Avg Variance, Notes

3. **Period Summary Sheet:**
   - Per month: Employees, Samples, Passed, Failed, Totals

4. **Save and review:** `/exports/PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx`

### Task 8.3: Document Variances (1 hour)

**Owner:** Finance

For ANY calculation with variance > ±0.01 MUR:

1. **Create file:** `/exports/PAYROLL_VARIANCES.md`

2. **For each variance:**

```markdown
## Variance: [Employee] — [Period] — [Type: PAYE/CSG/NSF/Net]

**Discrepancy:**
- Calculation: [Field affected]
- Expected: [Amount]
- System: [Amount]
- Variance: [Amount]
- Relative %: [(Variance / Expected) × 100]%

**Root Cause:**
1. Barème change during month?
2. Salary adjustment?
3. Rounding rule deviation?
4. System logic error?
5. Data entry mistake?

[Diagnosis: ...]

**Materiality:**
- Amount: [Variance]
- Threshold: 0.50 MUR (material)
- Assessment: [Material / Immaterial]
- Impact on employee net: [+/- X MUR]

**Correction:**
- [ ] Rerun payroll
- [ ] Correct bulletin data
- [ ] Update system logic
- [ ] Accept as rounding
- [ ] Escalate to Finance Director

**Sign-off:**
- Date: YYYY-MM-DD
- Verified by: [Name]
- Approved by: [Finance Director]
```

**If NO variances found:**
```markdown
# Payroll Variance Report

Status: ✓ NO VARIANCES

All 120 samples verified within ±0.01 MUR tolerance.
- Gross salary: 100% match
- PAYE deductions: 100% match
- CSG deductions: 100% match
- NSF deductions: 100% match
- Net salary: 100% match
- GL posting: 100% match

**Verification Date:** [Date]
**Verified by:** [HR + Finance names]
```

### Task 8.4: MRA Compliance Verification (2 hours)

**Owner:** Finance Director + Comptable

1. **PAYE Compliance:**
   - Execute SQL: "MRA Compliance — PAYE Withholding vs. Declarations"
   - Verify: Total PAYE withheld (bulletins) = MRA declaration
   - Result: ✓ COMPLIANT or ✗ VARIANCE

2. **CSG/NSF Compliance:**
   - Execute SQL: "MRA Compliance — CSG/NSF Withholding vs. Declarations"
   - Verify: Total CSG withheld = MRA declaration
   - Verify: Total NSF withheld = MRA declaration
   - Result: ✓ COMPLIANT or ✗ VARIANCE

3. **GL Reconciliation:**
   - Query account 4330 (PAYE) total balance = MRA PAYE declaration ✓
   - Query accounts 4311-4312, 4321-4324 totals = MRA CSG/NSF declaration ✓

4. **Create Compliance Report:**
   - File: `/exports/PAYROLL_MRA_COMPLIANCE_VERIFICATION.md`
   - Sections:
     1. PAYE Withheld vs. MRA Declaration
     2. CSG/NSF Deductions vs. MRA Declarations
     3. No Underpayment/Overpayment Check
     4. Final Compliance Certification

5. **Certification Checklist:**
   - [ ] PAYE withheld matches MRA declarations
   - [ ] CSG deductions per MRA rates (1.5%/3%)
   - [ ] NSF deductions per MRA rates (1%)
   - [ ] No underpayment of taxes
   - [ ] All GL entries balanced
   - [ ] Employee net correctly calculated
   - [ ] Payroll data complete and auditable

6. **Sign-off:**
   - By: HR Manager + Finance Manager + Tech Lead
   - Date: [Date]
   - Status: **APPROVED FOR AUDIT**

---

## Verification Checklist for Each Sample

Use this checklist while verifying each sample:

```
Sample: [Employee_Code] — [Period]

GROSS SALARY:
[ ] Gross = Base + Allowances + Overtime + Bonuses
[ ] Gross_Calculated == Gross_System (±0.01 MUR)
[ ] No unscheduled changes

PAYE CALCULATION:
[ ] Annual gross = Monthly gross × 12
[ ] Correct bracket applied (0%/10%/15%)
[ ] PAYE_Calculated within ±0.01 MUR of System
[ ] MRA 2025 barème (390k / 700k) used

CSG CALCULATION:
[ ] Threshold check: Gross > 50k? (rate 3%) or (rate 1.5%)
[ ] CSG_Calculated within ±0.01 MUR of System
[ ] CSG % correctly applied (1.5% or 3%)

NSF CALCULATION:
[ ] NSF barème cap fetched (typically 228k)
[ ] Gross <= cap? (NSF = Gross × 1%)
[ ] Gross > cap? (NSF = Cap × 1%)
[ ] NSF_Calculated within ±0.01 MUR of System

NET SALARY:
[ ] Total_Deductions = PAYE + CSG + NSF + Other
[ ] Net = Gross - Total_Deductions
[ ] Net_Calculated within ±0.01 MUR of System

GL POSTING:
[ ] 6411 (Salaires) debit = Gross ✓
[ ] 4210 (Salaires à payer) credit = Net ✓
[ ] 4330 (PAYE) credit = PAYE ✓
[ ] 4311-4312 (CSG/NSF) credit = CSG + NSF ✓

STATUS:
[ ] All checks pass → PASS
[ ] Any variance > 0.01 MUR → FAIL (document)
```

---

## Timeline

| Week | Day | Task | Hours | Owner | Status |
|------|-----|------|-------|-------|--------|
| 7 | Mon | Sample selection & docs | 2 | HR | TODO |
| 7 | Tue | Gather employee data | 2 | HR/Tech | TODO |
| 7 | Wed | Build Excel workbook | 3 | Tech | ✓ DONE |
| 7 | Thu | Data quality checks | 1 | Finance | TODO |
| 7 | Fri | Prepare verification kit | 2 | Finance | TODO |
| 8 | Mon-Fri | Hand-verify 120 samples | 12 | Finance/HR | TODO |
| 8 | Fri | Aggregate results | 1 | Finance | TODO |
| 8 | Fri | Document variances | 1 | Finance | TODO |
| 8 | Fri | MRA compliance review | 2 | Finance Director | TODO |
| 8 | Fri | Final sign-off | 1 | All | TODO |

**Total effort: 20 hours**

---

## Success Criteria

Upon completion, you will have:

✓ **120 payroll calculations verified** (20 × 6 months)
✓ **100% match within ±0.01 MUR** tolerance
✓ **0 MRA compliance violations**
✓ **All variances documented & explained**
✓ **PAYE withheld = MRA declarations**
✓ **Report ready for external auditor**

---

## Troubleshooting

**Issue: SQL queries fail**
- Check Supabase connectivity
- Verify societe_id for 'OCC'
- Confirm periods exist in bulletins_paie

**Issue: Variances found in multiple samples**
- Potential system-wide error (barème misapplied?)
- Check calculation function in system
- Review MRA rates — were they updated?

**Issue: GL postings missing**
- Check if `generer_ecritures_paie` RPC was run
- Verify journal = 'OD-PAIE' in ecritures_comptables_v2
- Re-trigger GL generation if needed

**Issue: Data quality checks fail**
- Do NOT proceed to verification
- Document issue in DATA_QUALITY_ISSUES.md
- Escalate to Finance Director

---

## References

- **Framework:** PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md
- **SQL Queries:** PAYROLL_VERIFICATION_SQL_QUERIES.sql
- **Excel Workbook:** PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx
- **MRA 2025 Rates:** Embedded in Excel Sheet 5
- **Lexora DB Schema:** Migrations 016, 143, 212, 213

**Next Steps:** Schedule kickoff meeting with HR, Finance, Tech to confirm timeline and roles.
