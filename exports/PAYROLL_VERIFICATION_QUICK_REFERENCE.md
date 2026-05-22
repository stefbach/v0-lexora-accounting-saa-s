# Payroll Verification Quick Reference Card

## MRA 2025 Tax Rates & Formulas

### PAYE (Pay As You Earn) — Annual Barème

| Annual Gross | Tax Rate | Monthly Formula |
|--------------|----------|-----------------|
| 0 - 390,000 | 0% | PAYE = 0 |
| 390,001 - 700,000 | 10% | PAYE = (Gross - 390k) × 0.10 ÷ 12 |
| 700,001+ | 15% | PAYE = (310k × 10% + (Gross - 700k) × 15%) ÷ 12 |

**Key:** Annualize monthly gross first, then apply barème, then divide by 12.

### CSG (Contribution Sociale Généralisée)

| Monthly Gross | Rate | Formula |
|---------------|------|---------|
| ≤ 50,000 MUR | 1.5% | CSG = Gross × 0.015 |
| > 50,000 MUR | 3.0% | CSG = Gross × 0.03 |

**Key:** Threshold is 50,000 MUR per month.

### NSF (National Savings Fund)

| Item | Rate | Cap |
|------|------|-----|
| Employee | 1.0% | 228,000 MUR/month |
| Employer | 2.5% | (separate) |

**Formula:** NSF = MIN(Gross, 228,000) × 0.01

**Key:** If Gross > 228k, cap at 228k × 1% = 2,280 MUR max.

### Net Salary Formula

```
Net = Gross - (PAYE + CSG + NSF + Other_Deductions)
```

---

## Quick Calculation Examples

### Sample 1: Mid-Level Employee (40k/month)

```
Monthly Gross:      40,000.00
Annual Gross:       480,000 (40k × 12)

PAYE: (480k - 390k) × 10% ÷ 12 = 90k × 10% ÷ 12 = 750.00
CSG:  40k ≤ 50k → 40k × 1.5% = 600.00
NSF:  40k < 228k → 40k × 1.0% = 400.00

Total Deductions:   1,750.00
Net Salary:         40,000 - 1,750 = 38,250.00
```

### Sample 2: Senior Employee (60k/month)

```
Monthly Gross:      60,000.00
Annual Gross:       720,000 (60k × 12)

PAYE: 310k @ 10% + (720k-700k) × 15% ÷ 12 = 31k + (20k × 15%) ÷ 12 = 2,883.33
CSG:  60k > 50k → 60k × 3.0% = 1,800.00
NSF:  60k < 228k → 60k × 1.0% = 600.00

Total Deductions:   5,283.33
Net Salary:         60,000 - 5,283.33 = 54,716.67
```

### Sample 3: High Earner (100k/month) — NSF Cap Applied

```
Monthly Gross:      100,000.00
Annual Gross:       1,200,000 (100k × 12)

PAYE: 310k @ 10% + (1.2M - 700k) × 15% ÷ 12 = 31k + (500k × 15%) ÷ 12 = 6,416.67
CSG:  100k > 50k → 100k × 3.0% = 3,000.00
NSF:  100k > 228k cap → 228k × 1.0% = 2,280.00 (CAPPED)

Total Deductions:   11,696.67
Net Salary:         100,000 - 11,696.67 = 88,303.33
```

---

## GL Posting Check (Per Payroll Period)

Verify these accounts match bulletin totals:

| Account | Type | Amount | Source |
|---------|------|--------|--------|
| 6411 | DEBIT | Gross Salary | `bulletins_paie.salaire_brut` |
| 4210 | CREDIT | Net Salary | `bulletins_paie.salaire_net` |
| 4330 | CREDIT | PAYE Payable | `bulletins_paie.paye` |
| 4311/4312 | CREDIT | CSG + NSF Salarié | `csg_salarie + nsf_salarie` |
| 6451 | DEBIT | CSG Patronal | `bulletins_paie.csg_patronal` |
| 6452 | DEBIT | NSF Patronal | `bulletins_paie.nsf_patronal` |
| 4321-4324 | CREDIT | CSG/NSF Patronal | `csg_patronal + nsf_patronal` |

**Journal Balance Check:**
```
Total Debits (6411, 6451, 6452) = Total Credits (4210, 4330, 4311-4312, 4321-4324)
```

---

## Pass/Fail Criteria per Sample

### PASS if:
✓ Gross_Match = ✓ (system matches expected)
✓ PAYE variance ≤ ±0.01 MUR
✓ CSG variance ≤ ±0.01 MUR
✓ NSF variance ≤ ±0.01 MUR
✓ Net variance ≤ ±0.01 MUR
✓ All GL accounts match ✓

### FAIL if:
✗ Any gross mismatch
✗ Any deduction variance > ±0.01 MUR
✗ Any GL posting missing/incorrect
✗ Cannot reconcile to expected values

---

## Data Quality Checks

Before starting verification, confirm:

```sql
-- Check 1: All bulletins have GL
SELECT COUNT(*) FROM bulletins_paie WHERE periode BETWEEN '2025-07-01' AND '2025-12-31'
EXCEPT SELECT COUNT(DISTINCT periode) FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE' AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 0

-- Check 2: No NULL deductions
SELECT COUNT(*) FROM bulletins_paie
WHERE (paye IS NULL OR csg_salarie IS NULL OR nsf_salarie IS NULL)
AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 0

-- Check 3: GL balanced
SELECT SUM(debit) - SUM(credit) FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE' AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 0.00

-- Check 4: No salary changes (core staff)
SELECT COUNT(DISTINCT salaire_base) FROM bulletins_paie
WHERE employe_id IN (SELECT id FROM employes WHERE code IN ('000001',...))
AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 1 per employee (no changes)
```

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| PAYE > Expected | Barème applied wrong | Re-annualize, check 390k/700k thresholds |
| CSG mismatch | Threshold check wrong | Is Gross > 50k exactly? Use > not ≥ |
| NSF over 2,280 | Cap not applied | Verify Gross > 228k, apply cap |
| Net off by X | Deduction sum wrong | Re-add: PAYE + CSG + NSF + Other |
| GL missing | No OD-PAIE entry | Check if `generer_ecritures_paie` RPC ran |
| GL amount mismatch | Rounding difference | Acceptable if < 0.01 MUR difference |

---

## Verification Pace

**120 samples ÷ 10 working days = 12 samples/day**

**Per day:**
- Morning (2 hours): 6 samples (Employee A, Months 1-6)
- Afternoon (2 hours): 6 samples (Employee B, Months 1-6)

**Materials needed:**
- Excel workbook (120 rows ready)
- SQL query results (for reference)
- Calculator (or Excel)
- MRA 2025 rates (printed reference card)

---

## Escalation Triggers

Stop and escalate if:

- [ ] Variance > ±1.00 MUR (material error)
- [ ] Multiple employees have same error pattern (system bug)
- [ ] GL posting completely missing for month
- [ ] Data quality check fails
- [ ] Cannot locate bulletin or GL entries
- [ ] Employee salary changed unexpectedly

**Escalate to:** Finance Director

---

## Sign-Off Checklist

After all 120 samples verified:

- [ ] Excel workbook 100% complete
- [ ] Summary statistics calculated
- [ ] All variances documented (if any)
- [ ] MRA compliance verified
- [ ] GL posting reconciled
- [ ] No outstanding data quality issues
- [ ] Report ready for auditor

**Sign:** _________________ Date: _____________

---

## Files & Locations

```
/exports/
├── PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md      (methodology)
├── PAYROLL_VERIFICATION_EXECUTION_GUIDE.md        (step-by-step)
├── PAYROLL_VERIFICATION_SQL_QUERIES.sql           (queries)
├── PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx (workbook)
├── PAYROLL_VERIFICATION_QUICK_REFERENCE.md        (THIS FILE)
├── PAYROLL_VARIANCES.md                           (TO CREATE)
└── PAYROLL_MRA_COMPLIANCE_VERIFICATION.md         (TO CREATE)
```

---

## Contact

- **Questions on Framework:** Finance Manager
- **Questions on SQL:** Tech Lead
- **Questions on MRA Rates:** HR Manager
- **Data Quality Issues:** Finance Director
- **Escalations:** Finance Director + HR Manager
