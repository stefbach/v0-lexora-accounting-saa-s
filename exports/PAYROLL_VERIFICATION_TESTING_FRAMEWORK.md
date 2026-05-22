# PHASE 4, Task 4D: Payroll Verification Testing Framework

## Mission
Hand-verify payroll calculations for 20 employees × 6 months (120 samples) to ensure compliance with MRA 2025 regulations and system accuracy.

**Timeline:** Weeks 7-8  
**Effort:** 20 hours  
**Owner:** HR + Finance + Tech

---

## DELIVERABLE 1: Sample Selection Strategy

### Stratified Sampling (20 Employees)

Employees must be selected to ensure diversity across:
1. **Salary Levels:** Junior (≤30k), Mid (30-45k), Senior (45-60k), Management (60k+)
2. **Employment Type:** Full-time (100%) vs. Part-time (50-99%)
3. **Deduction Complexity:** Various PAYE/CSG/NSF combinations
4. **Service Period:** Full 6 months vs. partial months (start/end during period)

### Sample Pool (OCC)
From `employes` table (2025 roster):

| Code | Name | Poste | Salaire | Level | Notes |
|------|------|-------|---------|-------|-------|
| 000001 | FRONTCZAK, Johanna | Directrice RH | 56,535 | Senior | Management |
| 000002 | JAUNKY, Jeyel | Technicien IT | 30,000 | Junior | Petrol allowance 5,500 |
| 000003 | CHAVETIAN, Stephano | Producteur Contenu | 40,535 | Mid | No allowances |
| 000004 | DESIRE, Marie | Secrétaire Médicale | 30,610 | Junior | No allowances |
| 000008 | GROODOYAL, Aditya | Dessinateur Concepteur | 55,000 | Senior | No allowances |
| 000009 | QUENETTE, Mégane | Productrice Contenu | 41,000 | Mid | Full 100% |
| 000015 | BEERACHEE, Shubham | Assistant Médical | 30,000 | Junior | Start: 2025-04-02 (partial) |
| 000021 | ARJOON, Bheshouma | Medical Secretary | 30,000 | Junior | Start: 2025-03-24 (partial) |
| 000023 | PURSOTY, Dhanika | Conseillère SAV | 35,000 | Mid | Start: 2025-04-28 (partial) |
| 000024 | PAUL, Cecilia | Responsable Production | 40,000 | Mid | End: 2025-08-21 (departed) |
| 000025 | SEKELY, Sheetal | Closer | 47,000 | Mid | Start: 2025-05-12 (partial) |

**Additional 9 employees:** Source from OCC payroll 2025 to reach n=20

### Justification
- **Salary diversity:** Ensures PAYE barème transitions (0%/10%/15%) are tested
- **CSG threshold testing:** Employees below/above 50k MUR threshold included
- **Full months:** Core employees (000001-000009) tested for all 6 months
- **Partial months:** New hires (000015, 000021, 000023, 000025) test proration logic
- **Departures:** Employee 000024 tests departure calculations (notice payable)

---

## DELIVERABLE 2: Per-Sample Calculation Steps (120 Total)

### Step 1: Gather Employee Data

**Source:** `employes` table + `bulletins_paie` table

For each sample (employee_id, periode):

```sql
SELECT 
  e.code, e.nom, e.poste, e.salaire_base,
  e.transport_allowance, e.petrol_allowance,
  bp.salaire_brut, bp.periode,
  bp.csg_salarie, bp.nsf_salarie, bp.paye,
  bp.total_deductions, bp.salaire_net,
  bp.csg_patronal, bp.nsf_patronal, bp.total_charges_patronales,
  bp.statut, bp.ia_valide
FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
WHERE e.code = ?
  AND bp.periode BETWEEN '2025-07-01' AND '2025-12-01'
ORDER BY bp.periode
```

**Document:**
- Employment contract (start date, base salary per contract)
- Deductions profile (tax category, insurance, loans)
- **No changes** in salary/deductions during 6-month period? ✓ / ✗

### Step 2: Calculate Expected Gross Salary

**Formula:**
```
Expected_Gross = 
  Base_Salary 
  + Increment_Salaire (if any)
  + Transport_Allowance
  + Petrol_Allowance
  + Special_Allowances_1/2/3 (if any)
  + Overtime_Montant (if any)
  + Other_Refund
  + EOY_Bonus (if applicable)
  + Departure_Notice (if applicable)
```

**Source:** `bulletins_paie` columns:
- `salaire_base`
- `increment_salaire`
- `transport_allowance`
- `petrol_allowance`
- `special_allowance_1`, `special_allowance_2`, `special_allowance_3`
- `heures_sup_montant`
- `other_refund`
- `eoy_bonus`
- `departure_notice`

**Verify:** System `salaire_brut` = calculated gross within ±0.01 MUR

### Step 3: Verify PAYE Calculation

**MRA 2025 PAYE Barème (Annual → Monthly):**

| Annual Gross | Tax Rate | Formula |
|--------------|----------|---------|
| 0 - 390,000 | 0% | PAYE = 0 |
| 390,001 - 700,000 | 10% | PAYE = (Gross - 390,000) × 0.10 ÷ 12 |
| 700,001+ | 15% | PAYE = (390k to 700k @ 10%) + (Gross - 700k) × 0.15 ÷ 12 |

**Steps:**
1. **Calculate annualized gross:** Monthly_Gross × 12
2. **Apply barème:** Select the appropriate tax bracket
3. **Calculate annual tax:** Apply formula above
4. **Derive monthly PAYE:** Annual_PAYE ÷ 12, round to nearest 0.01 MUR
5. **Compare:** System `paye` value = calculated PAYE

**Example:**
- Monthly gross: 50,000 MUR
- Annual gross: 600,000 MUR
- Tax bracket: 390k-700k @ 10%
- Taxable amount: 600,000 - 390,000 = 210,000
- Annual PAYE: 210,000 × 0.10 = 21,000
- Monthly PAYE: 21,000 ÷ 12 = **1,750.00 MUR**

**MRA Documentation:**
- Barème version used: **MRA 2025** (from `parametres_paie_mra.annee = 2025`)
- Thresholds: 390,000 | 700,000 MUR
- Tolerance: ±0.01 MUR

### Step 4: Verify CSG Calculation

**MRA 2025 CSG Rates (Salarié):**

| Gross Salary | Rate | Formula |
|--------------|------|---------|
| ≤ 50,000 MUR | 1.5% | CSG = Gross × 0.015 |
| > 50,000 MUR | 3.0% | CSG = Gross × 0.03 |

**Steps:**
1. **Check salary level:** Is monthly gross ≤ or > 50,000?
2. **Apply rate:** Calculate CSG = Gross × (1.5% or 3%)
3. **Round:** Round to nearest 0.01 MUR
4. **Compare:** System `csg_salarie` = calculated CSG

**Example:**
- Monthly gross: 50,000 MUR (at threshold)
- Rate: 1.5% (threshold applies to ≤ 50k)
- CSG = 50,000 × 0.015 = **750.00 MUR**

**MRA Documentation:**
- Salarié rate: 1.5% (≤50k) | 3.0% (>50k)
- Seuil: 50,000 MUR
- Patronal rate: 3-6% (not employee deduction)

### Step 5: Verify NSF Calculation

**MRA 2025 NSF Rates (Salarié):**

| Base | Rate | Cap | Formula |
|------|------|-----|---------|
| Gross | 1.0% | Monthly ceiling per barème | NSF = Gross × 0.01 (if under cap) |

**Check barème cap:**
- Source: `nsf_baremes` table (migration 212)
- 2025 monthly maximum insurable earnings: ~228,000 MUR (verify)
- If Gross > cap: NSF = Cap × 1.0%

**Steps:**
1. **Fetch NSF barème for period:** Query `nsf_baremes` for periode date
2. **Check cap:** Is monthly gross under `monthly_max`?
3. **Apply rate:** NSF = Gross × 0.01 (or Cap × 0.01 if over)
4. **Round:** Round to nearest 0.01 MUR
5. **Compare:** System `nsf_salarie` = calculated NSF

**Example:**
- Monthly gross: 50,000 MUR
- NSF cap: 228,000 MUR (under cap)
- NSF = 50,000 × 0.01 = **500.00 MUR**

**MRA Documentation:**
- Salarié rate: 1.0% (subject to insurable earnings cap)
- Patronal rate: 2.5%
- Barème: 2025 (verify cap amount)

### Step 6: Calculate Net Salary

**Formula:**
```
Net_Salary = Gross_Salary - Total_Deductions

Total_Deductions = 
  PAYE 
  + CSG_Salarié 
  + NSF_Salarié 
  + Montant_Absence (if any)
  + [Other deductions: insurance, loans, etc.]
```

**Steps:**
1. **Sum deductions:** PAYE + CSG + NSF + other_deductions
2. **Calculate net:** Gross - Total_Deductions
3. **Round:** To nearest 0.01 MUR
4. **Compare:** System `salaire_net` = calculated net

**Tolerance:** ±0.01 MUR per calculation

**Example:**
- Gross: 50,000 MUR
- PAYE: 1,750.00
- CSG: 750.00
- NSF: 500.00
- Total deductions: 3,000.00
- Net: 50,000 - 3,000 = **47,000.00 MUR**

### Step 7: Verify GL Posting

**Expected GL Entries (per payroll cycle, after `generer_ecritures_paie` RPC):**

| Account | Description | Debit | Credit | Amount |
|---------|-------------|-------|--------|--------|
| 6411 | Salaires bruts | ✓ | | Gross_Salary |
| 6451 | CSG patronal | ✓ | | CSG_Patronal |
| 6452 | NSF patronal | ✓ | | NSF_Patronal |
| 6453 | Training Levy | ✓ | | Training_Levy |
| 4210 | Salaires à payer | | ✓ | Net_Salary |
| 4311/4312 | CSG salarié | | ✓ | CSG_Salarié |
| 4321-4324 | CSG/NSF patronal | | ✓ | CSG_Patronal + NSF_Patronal |
| 4330 | PAYE à verser | | ✓ | PAYE |

**Verify:**
1. **Fetch ecritures for period:** Query `ecritures_comptables_v2` where `journal = 'OD-PAIE'` and `periode = ?`
2. **Sum by account:** Aggregate debit and credit by account code
3. **Match amounts:** Ensure GL totals = bulletin amounts
4. **Check balancing:** Total debits = Total credits (journal balance)

**SQL Example:**
```sql
SELECT 
  compte, 
  SUM(debit) as debit_total, 
  SUM(credit) as credit_total,
  (SUM(debit) - SUM(credit)) as solde
FROM ecritures_comptables_v2
WHERE periode = '2025-07-31'
  AND journal = 'OD-PAIE'
  AND societe_id = ?
GROUP BY compte
ORDER BY compte
```

---

## DELIVERABLE 3: Calculation Verification Report

### Output: `/exports/PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx`

**Format:** Microsoft Excel workbook

**Sheet 1: Detailed Verification (120 rows)**

| Column | Description | Example |
|--------|-------------|---------|
| Employee_Code | From `employes.code` | 000001 |
| Employee_Name | From `employes.nom, prenom` | FRONTCZAK, Johanna |
| Period | Month of payroll | 2025-07 |
| Poste | Job title | Directrice RH |
| Gross_Calculated | Expected gross (formula) | 56,535.00 |
| Gross_System | From `bulletins_paie.salaire_brut` | 56,535.00 |
| Gross_Match | ✓ or ✗ | ✓ |
| PAYE_Calculated | From barème 2025 | 1,750.00 |
| PAYE_System | From `bulletins_paie.paye` | 1,750.00 |
| PAYE_Variance | System - Calculated | 0.00 |
| CSG_Calculated | Gross × (1.5% or 3%) | 750.00 |
| CSG_System | From `bulletins_paie.csg_salarie` | 750.00 |
| CSG_Variance | System - Calculated | 0.00 |
| NSF_Calculated | Gross × 1% (under cap) | 500.00 |
| NSF_System | From `bulletins_paie.nsf_salarie` | 500.00 |
| NSF_Variance | System - Calculated | 0.00 |
| Total_Deductions_Calculated | PAYE + CSG + NSF + other | 3,000.00 |
| Total_Deductions_System | From `bulletins_paie.total_deductions` | 3,000.00 |
| Net_Calculated | Gross - Deductions | 53,535.00 |
| Net_System | From `bulletins_paie.salaire_net` | 53,535.00 |
| Net_Variance | System - Calculated | 0.00 |
| GL_6411_Match | ✓ or ✗ | ✓ |
| GL_4210_Match | ✓ or ✗ | ✓ |
| GL_4330_Match | ✓ or ✗ | ✓ |
| GL_4311_Match | ✓ or ✗ | ✓ |
| Verification_Status | PASS / FAIL | PASS |
| Notes | Any discrepancies | |

**Sheet 2: Summary Statistics**

| Metric | Value |
|--------|-------|
| Total Samples | 120 |
| Passed Verification | 120 |
| Failed Verification | 0 |
| % Pass Rate | 100% |
| Variance > 0.01 MUR | 0 |
| Variance ≤ 0.01 MUR | 0 |
| GL Posting Errors | 0 |
| Barème Errors | 0 |
| Missing GL Entries | 0 |

**Sheet 3: Employee Summary (20 rows)**

| Employee | Samples | Passed | Failed | Avg Variance | Notes |
|----------|---------|--------|--------|--------------|-------|
| 000001 | 6 | 6 | 0 | 0.00 | All months verified |
| ... | ... | ... | ... | ... | |

**Sheet 4: Period Summary (6 rows)**

| Period | Employees | Samples | Passed | Failed | Total_Gross | Total_Net | Notes |
|--------|-----------|---------|--------|--------|-------------|-----------|-------|
| 2025-07 | 20 | 20 | 20 | 0 | X | Y | All OK |
| 2025-08 | 19 | 19 | 19 | 0 | X | Y | 000024 departed |
| ... | ... | ... | ... | ... | ... | ... | |

---

## DELIVERABLE 4: Variance Documentation

### Output: `/exports/PAYROLL_VARIANCES.md`

For **any calculation with variance > ±0.01 MUR**, document:

```markdown
## Variance: [Employee] — [Period]

**Discrepancy Details:**
- Calculation: [E.g., PAYE]
- Expected: [Amount]
- System: [Amount]
- Variance: [Amount]
- Relative %: [(Variance / Expected) × 100]%

**Root Cause Analysis:**
1. [Barème change during month? Salary adjustment? Rounding rules?]
2. [System logic deviation from MRA rules?]
3. [Data entry error in bulletin?]

**Materiality Assessment:**
- Is variance ≥ 0.50 MUR? → **Material** (requires correction)
- Is variance < 0.50 MUR? → **Immaterial** (rounding tolerance)
- Impact on employee net: [+/- X MUR]

**Corrective Action:**
- [ ] Rerun payroll for period
- [ ] Correct manual entry in `bulletins_paie`
- [ ] Update system logic (if barème misapplied)
- [ ] Close as rounding difference
- [ ] Escalate to Finance (if > 10 MUR)

**Sign-off:**
- Date: YYYY-MM-DD
- Reviewed by: [HR/Finance]
- Approved by: [Finance Director]
```

**If no variances found:** Create single file stating:
```markdown
# Payroll Variance Report

**Status:** ✓ NO VARIANCES DETECTED

All 120 payroll calculations verified within ±0.01 MUR tolerance.

- Gross salary: 100% match
- PAYE deductions: 100% match
- CSG deductions: 100% match
- NSF deductions: 100% match
- Net salary: 100% match
- GL posting: 100% match

**Verification Date:** YYYY-MM-DD  
**Verified by:** [HR + Finance]
```

---

## DELIVERABLE 5: MRA Compliance Verification

### Output: `/exports/PAYROLL_MRA_COMPLIANCE_VERIFICATION.md`

**Section 1: PAYE Compliance**

```markdown
## 1. PAYE Withheld vs. MRA Declaration

### Summary
- Period: 2025-07 to 2025-12 (6 months)
- Total employees processed: 20
- Total PAYE withheld (bulletins): X MUR
- Total PAYE declared to MRA: Y MUR
- Match: ✓ / ✗

### Detailed Breakdown

| Period | Employees | Total_PAYE_Withheld | PAYE_Declared_MRA | Variance | Status |
|--------|-----------|-------------------|-------------------|----------|--------|
| 2025-07 | 20 | A | B | B-A | ✓ |
| 2025-08 | 19 | A | B | B-A | ✓ |
| ... | ... | ... | ... | ... | ... |

**Total 6 months:** X MUR withheld = Y MUR declared ✓

### Verification Steps
1. Query `bulletins_paie` for SUM(paye) by periode ✓
2. Query `declarations_paye_mensuelle` for total_paye_retenu ✓
3. Confirm match to MRA bordereau (if filed) ✓
4. Check GL account 4330 (PAYE payable) reconciliation ✓

**Status:** ✓ COMPLIANT
- No underpayment of taxes
- No overpayment of taxes
- All monthly PAYE declared timely
```

**Section 2: CSG/NSF Compliance**

```markdown
## 2. CSG/NSF Deductions vs. MRA Declarations

### CSG Summary

| Category | Salarié | Patronal | Total | Cap | Status |
|----------|---------|----------|-------|-----|--------|
| Withheld (bulletins) | X | Y | Z | — | ✓ |
| Declared (CSG form) | X | Y | Z | — | ✓ |
| Variance | 0 | 0 | 0 | — | ✓ |

**Threshold Compliance (50k):**
- Employees ≤ 50k: 1.5% applied ✓
- Employees > 50k: 3.0% applied ✓
- Threshold correctly identified: ✓

### NSF Summary

| Item | Amount | Cap | Status |
|------|--------|-----|--------|
| Total NSF withheld | X MUR | Per barème | ✓ |
| Insurable earnings ceiling applied | Yes | 228,000/mois | ✓ |
| Employees over cap | 0 | — | ✓ |
| Patronal NSF (2.5%) | Y MUR | — | ✓ |

**Status:** ✓ COMPLIANT

### Verification Steps
1. Query `bulletins_paie` for SUM(csg_salarie, csg_patronal, nsf_salarie, nsf_patronal) ✓
2. Query `declarations_csg_mensuelle` for totals ✓
3. Verify `nsf_baremes.monthly_max` cap applied ✓
4. Confirm GL accounts 4311/4312, 4321-4324 ✓
```

**Section 3: No Underpayment/Overpayment**

```markdown
## 3. Underpayment / Overpayment Check

### Payroll Tax Underpayment (per employee)

| Employee | Total_PAYE_Withheld | Min_Legal_Withholding | Underpaid | Status |
|----------|-------------------|----------------------|-----------|--------|
| 000001 | X | Y | 0 | ✓ |
| ... | ... | ... | 0 | ✓ |

**Result:** ✓ NO UNDERPAYMENTS

### CSG/NSF Underpayment (aggregate)

- Total CSG withheld: X MUR (actual)
- CSG legal minimum: Y MUR (expected)
- Underpayment: 0 MUR ✓

- Total NSF withheld: X MUR (actual)
- NSF legal minimum: Y MUR (expected)
- Underpayment: 0 MUR ✓

**Status:** ✓ NO UNDERPAYMENTS OR OVERPAYMENTS

### Risk Assessment
- All deductions applied correctly ✓
- No systematic error in calculation ✓
- No evidence of fraud or misclassification ✓
- Compensation should be paid to employees if overpaid ✗ (no evidence)
```

**Section 4: Final Compliance Sign-off**

```markdown
## 4. Final MRA Compliance Certification

**Period:** 2025-07-01 to 2025-12-31
**Verified by:** [HR Manager], [Finance Manager], [Tech Lead]
**Verification Date:** YYYY-MM-DD

### Compliance Checklist
- [ ] PAYE withheld matches MRA declarations
- [ ] CSG deductions per MRA 2025 rates (1.5%/3%)
- [ ] NSF deductions per MRA 2025 rates (1%)
- [ ] No underpayment of taxes
- [ ] All GL entries balanced (6411 = 4210 + 4330 + 4311-4312)
- [ ] Employee net salary correctly calculated
- [ ] Payroll data complete and auditable

**Certification:** ✓ APPROVED FOR AUDIT

All payroll calculations verified compliant with MRA 2025 regulations.
Safe to present to auditor.
```

---

## DELIVERABLE 6: Data Quality Checks

### Automated Validation

```sql
-- Check 1: All bulletins_paie have GL postings
SELECT 
  COUNT(*) as bulletins_without_gl
FROM bulletins_paie bp
WHERE NOT EXISTS (
  SELECT 1 FROM ecritures_comptables_v2 ec
  WHERE ec.periode = bp.periode
    AND ec.journal = 'OD-PAIE'
    AND ec.societe_id = bp.societe_id
)
-- Expected: 0

-- Check 2: No missing employee deductions
SELECT 
  COUNT(*) as incomplete_bulletins
FROM bulletins_paie
WHERE paye IS NULL 
   OR csg_salarie IS NULL 
   OR nsf_salarie IS NULL
-- Expected: 0

-- Check 3: No salary changes during 6-month period (for core staff)
SELECT 
  e.code, 
  e.nom,
  COUNT(DISTINCT bp.salaire_base) as salary_changes
FROM employes e
JOIN bulletins_paie bp ON e.id = bp.employe_id
WHERE e.code IN ('000001', '000002', '000003', '000004', '000008', '000009')
  AND bp.periode BETWEEN '2025-07-01' AND '2025-12-01'
GROUP BY e.id, e.code, e.nom
HAVING COUNT(DISTINCT bp.salaire_base) > 1
-- Expected: 0

-- Check 4: GL entries balanced (debits = credits) per period
SELECT 
  periode,
  SUM(debit) as total_debit,
  SUM(credit) as total_credit,
  (SUM(debit) - SUM(credit)) as imbalance
FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE'
  AND periode BETWEEN '2025-07-31' AND '2025-12-31'
GROUP BY periode
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
-- Expected: 0 rows (all balanced)
```

---

## Success Criteria

✓ **120 payroll calculations verified** (20 employees × 6 months)  
✓ **100% match within ±0.01 MUR** tolerance  
✓ **0 MRA compliance violations** detected  
✓ **All variances documented & explained**  
✓ **PAYE withheld = MRA declarations**  
✓ **Report ready for external auditor**  

---

## Timeline

| Week | Task | Owner | Status |
|------|------|-------|--------|
| 7 | Sample selection + documentation | HR | TODO |
| 7 | Gather employee data & contracts | HR | TODO |
| 7 | Build verification workbook | Tech | TODO |
| 8 | Hand-verify all 120 samples | Finance | TODO |
| 8 | Document variances | Finance | TODO |
| 8 | MRA compliance certification | Finance | TODO |
| 8 | Deliver final report | Finance | TODO |

---

## References

- **MRA 2025 PAYE Barème:** 0% (≤390k), 10% (390k-700k), 15% (>700k)
- **CSG 2025:** 1.5% (≤50k) | 3% (>50k) salarié
- **NSF 2025:** 1% salarié | 2.5% patronal
- **Lexora migrations:** 016 (paie structure), 143 (params 2026), 212 (NSF baremes), 213 (base CSG/NSF)
- **GL accounts:** 6411 (salaires), 4210 (dettes), 4330 (PAYE), 4311-4312 (CSG/NSF)
