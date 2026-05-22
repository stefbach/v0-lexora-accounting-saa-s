# PHASE 4, Task 4D: Payroll Verification Testing Framework — Complete Package

## Overview

This directory contains the complete framework for **hand-verifying 120 payroll calculations** (20 employees × 6 months) to ensure compliance with MRA 2025 regulations and Lexora system accuracy.

**Timeline:** Weeks 7-8 (20 hours total)  
**Owner:** HR + Finance + Tech  
**Success Criteria:** 100% calculations verified within ±0.01 MUR, 0 MRA violations

---

## Deliverable Files

### 1. PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md
**Complete methodology & requirements document (30 pages)**

Contents:
- Mission statement & success criteria
- Sample selection strategy (20 employees, stratified by salary)
- 7-step verification process for each sample
  1. Gather employee data
  2. Calculate expected gross
  3. Verify PAYE (MRA barème 0%/10%/15%)
  4. Verify CSG (1.5%/3% threshold at 50k)
  5. Verify NSF (1% subject to 228k cap)
  6. Calculate net salary
  7. Verify GL posting
- Excel workbook format (120 rows + summaries)
- Variance documentation template
- MRA compliance verification process
- Data quality checks (4 SQL validations)

**Use this for:** Understanding the complete framework, reference during verification

---

### 2. PAYROLL_VERIFICATION_EXECUTION_GUIDE.md
**Step-by-step execution checklist for Weeks 7-8**

Contents:
- Quick start checklist
- Week 7 setup tasks (4 tasks, 10 hours)
  - Sample selection & documentation
  - Gather employee data
  - Build verification workbook
  - Run data quality checks
- Week 8 verification tasks (6 tasks, 10 hours)
  - Hand-verify all 120 samples (detailed steps per sample)
  - Aggregate results
  - Document variances
  - MRA compliance verification
- Per-sample checklist (copy & use during verification)
- Timeline & pace recommendations
- Troubleshooting guide

**Use this for:** Daily execution, task assignments, progress tracking

---

### 3. PAYROLL_VERIFICATION_SQL_QUERIES.sql
**Ready-to-run SQL queries for all 8 verification steps**

Queries included:
1. Fetch all bulletins (base data)
2. PAYE calculation verification
3. CSG calculation verification
4. NSF calculation verification (with cap check)
5. Net salary verification
6. GL posting verification (match 6411, 4210, 4330, 4311)
7. MRA compliance — PAYE withholding vs. declarations
8. MRA compliance — CSG/NSF withholding vs. declarations
9. Data quality checks (4 checks: GL posting, missing deductions, balance, salary changes)

**Use this for:** Populating Excel data, verifying calculations, compliance checks

**How to use:**
```bash
# Copy queries to psql or SQL client
# Run queries against Lexora production database
# Export results as CSV
# Paste into Excel workbook
```

---

### 4. PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx
**Excel workbook template with 5 sheets (ready to populate)**

**Sheet 1: Detailed Verification (120 rows)**
- Columns: Employee, Period, Gross, PAYE, CSG, NSF, Net, GL matches, Status, Notes
- All 120 sample rows ready
- Formatting applied (headers, borders, currency format)
- To populate: Run SQL → Copy results → Verify calculations

**Sheet 2: Summary Statistics**
- Total samples, passed/failed counts, % pass rate
- Variance counts, GL error counts
- Auto-calculated from Sheet 1

**Sheet 3: Employee Summary (20 rows)**
- Per-employee totals: Samples, passed, failed, avg variance
- Salary level classification

**Sheet 4: Period Summary (6 rows)**
- Per-month totals: Employees, samples, gross, net, PAYE/CSG/NSF
- Trend analysis across months

**Sheet 5: MRA 2025 Rates Reference**
- PAYE barème (0%/10%/15%)
- CSG rates (1.5%/3%)
- NSF rates (1%/2.5%)
- Thresholds and caps
- For verification reference

**Use this for:** Recording verification results, aggregating summaries

---

### 5. PAYROLL_VERIFICATION_QUICK_REFERENCE.md
**One-page quick reference card for verification team**

Contents:
- MRA 2025 rates (table format)
- 3 calculation examples (junior, senior, high earner)
- GL posting check reference
- Pass/fail criteria per sample
- Data quality check commands
- Common errors & fixes
- Escalation triggers
- Pace recommendations

**Use this:** Print and keep at desk during verification

---

### 6. PAYROLL_VARIANCES.md
**To create during Week 8 — Variance documentation**

Use template from Framework document:
- For each variance > ±0.01 MUR
- Root cause analysis (barème change? rounding? data entry?)
- Materiality assessment
- Corrective action
- Sign-off by Finance

If no variances: Single "✓ NO VARIANCES DETECTED" summary

**Due:** End of Week 8

---

### 7. PAYROLL_MRA_COMPLIANCE_VERIFICATION.md
**To create during Week 8 — MRA compliance sign-off**

Contents:
- PAYE withheld vs. MRA declarations (match verification)
- CSG/NSF deductions vs. MRA declarations (match verification)
- No underpayment/overpayment check
- Final compliance certification (checklist + sign-off)
- Safe to present to auditor

**Due:** End of Week 8

---

## Getting Started

### Prerequisite: Confirm Data Quality

Run the 4 data quality checks from PAYROLL_VERIFICATION_SQL_QUERIES.sql:

```sql
-- Check 1: All bulletins have GL postings
SELECT COUNT(*) AS bulletins_without_gl FROM bulletins_paie
WHERE periode BETWEEN '2025-07-01' AND '2025-12-31'
AND NOT EXISTS (SELECT 1 FROM ecritures_comptables_v2 ...);
-- Expected: 0

-- Check 2: No missing deductions
SELECT COUNT(*) FROM bulletins_paie
WHERE (paye IS NULL OR csg_salarie IS NULL OR nsf_salarie IS NULL)
AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 0

-- Check 3: GL balanced
SELECT ABS(SUM(debit) - SUM(credit)) FROM ecritures_comptables_v2
WHERE journal = 'OD-PAIE' AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 0.00

-- Check 4: No unintended salary changes
SELECT COUNT(DISTINCT salaire_base) FROM bulletins_paie
WHERE employe_id IN (SELECT id FROM employes WHERE code IN (...))
AND periode BETWEEN '2025-07-01' AND '2025-12-31';
-- Expected: 1 per employee
```

**If any check fails:** Stop, document issue in DATA_QUALITY_ISSUES.md, escalate to Finance Director.

### Week 7 Tasks

1. **Sample Selection (HR Manager, 2 hours)**
   - Confirm 20-employee stratified sample
   - Create SAMPLE_SELECTION_20_EMPLOYEES.md with justification

2. **Gather Employee Data (HR + Tech, 2 hours)**
   - Export contracts, start dates, deduction profiles
   - Populate Excel "Employee_Data" sheet

3. **Build Verification Workbook (Tech Lead, 3 hours)**
   - Excel already created (see file 4 above)
   - Run SQL query 1, populate Sheet 1 columns

4. **Data Quality Checks (Finance, 1 hour)**
   - Execute 4 checks above
   - Confirm all pass (or resolve issues)

5. **Prepare Verification Kit (Finance, 2 hours)**
   - Print PAYROLL_VERIFICATION_QUICK_REFERENCE.md
   - Review PAYROLL_VERIFICATION_EXECUTION_GUIDE.md
   - Schedule verification sessions

### Week 8 Tasks

1. **Hand-Verify All 120 Samples (Finance + HR, 12 hours)**
   - Use PAYROLL_VERIFICATION_EXECUTION_GUIDE.md (detailed steps)
   - Verify each sample per 7-step process
   - Record calculations in Excel
   - 12 samples/day pace recommended (2 hours/day × 2 sessions)

2. **Aggregate Results (Finance, 1 hour)**
   - Finalize Excel summary sheets
   - Calculate % pass rate, variance stats

3. **Document Variances (Finance, 1 hour)**
   - For each variance > ±0.01 MUR
   - Create PAYROLL_VARIANCES.md
   - If no variances: Create "✓ NO VARIANCES" summary

4. **MRA Compliance Verification (Finance Director, 2 hours)**
   - Run compliance SQL queries (7-8 from SQL file)
   - Verify PAYE declared = PAYE withheld
   - Verify CSG/NSF declared = CSG/NSF withheld
   - Create PAYROLL_MRA_COMPLIANCE_VERIFICATION.md
   - Final sign-off checklist

5. **Final Sign-off (All, 1 hour)**
   - Finance Director reviews all deliverables
   - HR Manager confirms employee data accuracy
   - Tech Lead confirms GL posting reconciliation
   - Certification: Ready for external auditor

---

## MRA 2025 Reference Rates

### PAYE (Annual Barème)
- 0 - 390,000 MUR: 0%
- 390,001 - 700,000 MUR: 10% (on amount above 390k)
- 700,001+ MUR: 15% (on amount above 700k)

### CSG (Salarié)
- ≤ 50,000 MUR/month: 1.5%
- > 50,000 MUR/month: 3.0%

### NSF (Salarié)
- Rate: 1.0%
- Cap: 228,000 MUR/month insurable earnings

### GL Accounts
| Account | Description | Type |
|---------|-------------|------|
| 6411 | Salaires bruts | Expense (debit) |
| 4210 | Salaires à payer | Liability (credit) |
| 4330 | PAYE à verser | Liability (credit) |
| 4311/4312 | CSG/NSF salarié | Liability (credit) |
| 6451-6453 | Employer social charges | Expense (debit) |
| 4321-4324 | Employer CSG/NSF | Liability (credit) |

---

## Success Criteria Checklist

Before submitting to auditor, confirm:

- [ ] 120 payroll calculations verified (20 employees × 6 months)
- [ ] 100% of calculations match system within ±0.01 MUR
- [ ] 0 MRA compliance violations detected
- [ ] All variances (if any) documented and explained
- [ ] PAYE withheld total = MRA PAYE declaration
- [ ] CSG/NSF withheld totals = MRA CSG/NSF declarations
- [ ] GL posting reconciliation complete
- [ ] Employee net salary correctly calculated (all 120)
- [ ] Excel workbook 100% complete with summaries
- [ ] All files ready: Framework ✓, Guide ✓, Variances ✓, Compliance ✓
- [ ] Sign-off by Finance Director, HR Manager, Tech Lead

---

## Timeline Summary

| Week | Hours | Tasks | Owner |
|------|-------|-------|-------|
| 7 | 10 | Sample selection, data gathering, workbook setup, QA checks | HR + Finance + Tech |
| 8 | 10 | Hand-verify 120 samples, aggregate, compliance, sign-off | Finance + HR |
| **Total** | **20** | | |

---

## File Checklist

Ready to distribute:

- [ ] PAYROLL_VERIFICATION_TESTING_FRAMEWORK.md (complete methodology)
- [ ] PAYROLL_VERIFICATION_EXECUTION_GUIDE.md (week-by-week tasks)
- [ ] PAYROLL_VERIFICATION_SQL_QUERIES.sql (ready-to-run queries)
- [ ] PAYROLL_CALCULATION_VERIFICATION_120_SAMPLES.xlsx (verification workbook)
- [ ] PAYROLL_VERIFICATION_QUICK_REFERENCE.md (quick card)
- [ ] README_PAYROLL_VERIFICATION_PHASE4.md (this file)

To create during execution:

- [ ] SAMPLE_SELECTION_20_EMPLOYEES.md (Week 7 output)
- [ ] DATA_QUALITY_ISSUES.md (if needed, Week 7)
- [ ] PAYROLL_VARIANCES.md (Week 8 output)
- [ ] PAYROLL_MRA_COMPLIANCE_VERIFICATION.md (Week 8 output)

---

## Contact & Escalation

- **Framework questions:** Finance Manager
- **SQL questions:** Tech Lead
- **MRA rate questions:** HR Manager
- **Data quality issues:** Finance Director
- **Urgent escalations:** Finance Director + HR Manager

---

## Final Notes

This framework is designed to be **comprehensive, auditor-ready, and repeatable** for future periods.

Key principles:
- **Deterministic verification:** Each calculation follows exact MRA 2025 barème
- **100% coverage:** All 120 samples hand-verified (no sampling assumptions)
- **Tolerance:** ±0.01 MUR (currency precision)
- **Documentation:** Every variance explained
- **Compliance:** MRA declarations reconciled to bulletins

Upon completion, you will have:
✓ Verified payroll system accuracy
✓ Confirmed MRA compliance
✓ Documented any issues
✓ Created auditor-ready report

---

**Status:** Ready to execute
**Last Updated:** 2025-05-22
**Version:** 1.0 — Phase 4 Task 4D
