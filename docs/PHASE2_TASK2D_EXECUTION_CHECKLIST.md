# Phase 2, Task 2D — Payroll Extraction Agent
## HR Team Execution Checklist

**Timeline:** Weeks 3-4  
**Effort:** 30 hours  
**Owner:** HR team + Tech

---

## Week 1 — Preparation & Data Validation (Hours 1-8)

### [ ] Monday — Kickoff & Environment Setup

**Tech Team:**
- [ ] Clone/update repository
- [ ] Set up environment variables (Supabase credentials)
- [ ] Verify database connectivity
- [ ] Run SQL verification queries (part 1 & 2 of verification-queries.sql)
- [ ] Confirm bulletins_paie table has ≥24 months of data

**HR Team:**
- [ ] Review this checklist and PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md
- [ ] Gather list of all employees (should match employes table)
- [ ] Verify all contract salaries are correct in the system
- [ ] Check if MRA declarations (declarations_paye_mensuelle, declarations_csg_mensuelle) exist

**Deliverable:** Environment ready, baseline data validated

---

### [ ] Tuesday-Wednesday — Data Completeness Review (Hours 9-16)

**Tech Team:**
- [ ] Run SQL query 1.1: Check bulletins by period
  ```bash
  # Expected: ~24 months with data
  # Check for missing months using query 1.2
  ```
- [ ] Run SQL query 1.3: Check for NULL values
  - Expected: 0 NULL values in critical columns
  - If found: Investigate and document
- [ ] Run SQL query 1.4: Check for missing employees
  - Expected: 0 records with missing employee data
  - If found: Fix employes table references

**HR Team:**
- [ ] Verify employee list completeness
  - [ ] Check all active employees have bulletins
  - [ ] Check recently departed employees are properly marked
  - [ ] Verify no duplicate employee records
- [ ] Cross-check 10 random employees' salaries in system vs. contracts
  - [ ] Salary matches: ✅ / ❌
  - [ ] Allowances (transport, petrol) match: ✅ / ❌
  - [ ] Employment dates correct: ✅ / ❌

**Deliverable:** Data completeness report (0 gaps identified or documented)

---

### [ ] Thursday-Friday — MRA Declarations Audit (Hours 17-24)

**Tech Team:**
- [ ] Check if declarations tables exist
  ```sql
  SELECT COUNT(*) FROM public.declarations_paye_mensuelle;
  SELECT COUNT(*) FROM public.declarations_csg_mensuelle;
  ```
- [ ] If tables are empty:
  - [ ] Check if RPC exists: `agreger_declarations_mra`
  - [ ] Generate declarations from bulletins
- [ ] Run SQL query 3.1: PAYE withholding summary
  - [ ] Verify all periods have PAYE data
  - [ ] Check PAYE percentage is reasonable (2-8% of gross typical)

**HR Team:**
- [ ] Retrieve MRA declaration forms from files/records:
  - [ ] IT Form 3 (annual income tax returns) — all years
  - [ ] EDF (employee declarations) — all months available
  - [ ] PAYE remittance confirmations — all months available
  - [ ] CSG/NSF remittance confirmations — all months available
- [ ] Create list of all MRA filings with:
  - [ ] Period/year
  - [ ] Amount declared
  - [ ] Date filed
  - [ ] MRA reference number (if available)
  - [ ] Payment date
  - [ ] Status (filed, paid, late, missing)

**Deliverable:** MRA declarations audit ready for comparison

---

## Week 2 — Extraction & Verification (Hours 25-30)

### [ ] Monday — Run Extraction Script & Generate Reports

**Tech Team:**
- [ ] Run payroll extraction script:
  ```bash
  npx ts-node scripts/phase2-task2d-payroll-extraction.ts
  ```
- [ ] Verify output files created:
  - [ ] `/exports/PAYROLL_BULLETINS_24MONTHS.csv` (check row count)
  - [ ] `/exports/PAYROLL_SUMMARIES_24MONTHS.md` (check 24 months listed)
  - [ ] `/exports/PAYE_MRA_COMPLIANCE.md` (PAYE totals shown)
  - [ ] `/exports/PAYROLL_CALCULATION_VERIFICATION.md` (20 emp × 6 months = 120)
  - [ ] `/exports/MRA_DECLARATIONS_STATUS.md` (declarations tracked)

**HR Team:**
- [ ] Spot-check CSV file:
  - [ ] Open in Excel
  - [ ] Verify all columns present
  - [ ] Check sample rows for employee names, amounts
  - [ ] Verify no truncation/corruption
  - [ ] Spot-check 5 employees across 6 months

**Deliverable:** All 5 export files generated and spot-checked

---

### [ ] Tuesday — Hand-Verify Payroll Calculations (Hours 25-28)

**HR Team & Tech Team (joint):**

For each of the **20 sampled employees × 6 months = 120 calculations**:

**PAYE Calculation Verification (2025 MRA Barème):**
```
Gross Salary: [amount]

If ≤ 390,000:      PAYE = 0% ✅ / ❌
If 390,001-700,000: PAYE = (gross - 390,000) × 10% ✅ / ❌
If > 700,000:      PAYE = 31,000 + (gross - 700,000) × 15% ✅ / ❌

Expected PAYE: [calculated]
Actual PAYE: [from bulletin]
Match ± 1 MUR: ✅ / ❌
```

**CSG Calculation Verification:**
```
If gross < 50,000:  CSG = gross × 1.5% ✅ / ❌
If gross ≥ 50,000:  CSG = gross × 3% ✅ / ❌

Expected CSG: [calculated]
Actual CSG: [from bulletin]
Match ± 1 MUR: ✅ / ❌
```

**NSF Calculation Verification:**
```
NSF = gross × 1% (capped)

Expected NSF: [calculated]
Actual NSF: [from bulletin]
Match ± 1 MUR: ✅ / ❌
```

**Net Salary Verification:**
```
Net = Gross - CSG - NSF - PAYE

Expected Net: [calculated]
Actual Net: [from bulletin]
Match ± 1 MUR: ✅ / ❌
```

**Record Results:**
- [ ] Create spreadsheet with 120 rows:
  | Employee | Period | Gross | PAYE OK | CSG OK | NSF OK | Net OK | Errors |
  | -------- | ------ | ----- | ------- | ------ | ------ | ------ | ------ |
  
- [ ] Zero errors allowed
- [ ] Any discrepancies: investigate and document root cause

**Tech Team - Automated Verification:**
- [ ] Run SQL queries 2.1-2.4 (PAYE, CSG, NSF, Net verification)
  - [ ] Expected: 0 errors (variance ≤ 1 MUR)
  - [ ] If errors found: Document and investigate

**Deliverable:** 120 calculations verified, 100% accuracy confirmed

---

### [ ] Wednesday — MRA Compliance Cross-Check

**HR Team & Tech Team:**

**PAYE Compliance Check:**
- [ ] Total PAYE withheld (bulletins) = ?
  ```
  Sum of all 'PAYE' column in CSV = _____ MUR
  ```
- [ ] Total PAYE declared to MRA = ?
  ```
  Sum of all declarations_paye_mensuelle.total_paye_retenu = _____ MUR
  ```
- [ ] Variance = ? (should be 0)
  ```
  Withheld - Declared = _____ MUR (allowed: ±100 MUR rounding)
  ```
- [ ] Status: ✅ RECONCILED / ❌ DISCREPANCY

**CSG/NSF Compliance Check:**
- [ ] Total CSG withheld (bulletins) = ?
  ```
  Sum of all CSG (employee + employer) = _____ MUR
  ```
- [ ] Total CSG declared to MRA = ?
  ```
  Sum of all declarations_csg_mensuelle.total_csg = _____ MUR
  ```
- [ ] Variance = ? (should be 0)
- [ ] Status: ✅ RECONCILED / ❌ DISCREPANCY

**IT Form 3 Status:**
- [ ] IT Form 3 filed for fiscal year ended 30 June 2024: ✅ / ❌
  - [ ] Filed date: _______
  - [ ] Due date: 2024-09-30
  - [ ] On time: ✅ / ❌
  - [ ] MRA reference: _______
  - [ ] Payment confirmed: ✅ / ❌

- [ ] IT Form 3 filed for fiscal year ended 30 June 2025: ✅ / ❌
  - [ ] Filed date: _______
  - [ ] Due date: 2025-09-30
  - [ ] Status: (Pending / Filed / Paid)
  - [ ] MRA reference: _______

**EDF Submissions:**
- [ ] All employees have EDF filed: ✅ / ❌
  - [ ] Sample check: Verify 5 employees have EDF for at least 3 months
  - [ ] Missing EDFs identified: _______

**Outstanding PAYE Check:**
- [ ] Query GL account 4330 balance (if available)
  ```
  Current balance: _____ MUR
  Should be: 0 (or minimal, last month only)
  ```
- [ ] Any PAYE > 30 days overdue: ✅ / ❌
  - [ ] If yes: List periods overdue: _______

**Deliverable:** MRA compliance verified, all discrepancies resolved

---

### [ ] Thursday-Friday — Final Quality Assurance & Documentation

**Tech Team:**
- [ ] Run SQL query 6.1: Data quality score
  - [ ] All checks should show "✅"
  - [ ] If any show "❌": Document issues
- [ ] Run SQL query 5.2: Employee sample validation
  - [ ] Spot-check 5 employees have correct latest_bulletin date
  - [ ] Verify total bulletins count is accurate

**HR Team:**
- [ ] Final review of all 5 export files:
  - [ ] PAYROLL_BULLETINS_24MONTHS.csv
    - [ ] Row count matches expected
    - [ ] All columns present
    - [ ] Sample rows reviewed for accuracy
  - [ ] PAYROLL_SUMMARIES_24MONTHS.md
    - [ ] All 24 months present
    - [ ] Monthly totals reconcile to CSV
    - [ ] GL accounts correctly referenced
  - [ ] PAYE_MRA_COMPLIANCE.md
    - [ ] PAYE reconciliation completed
    - [ ] Status checks done
  - [ ] PAYROLL_CALCULATION_VERIFICATION.md
    - [ ] 120 calculations verified
    - [ ] Results documented
    - [ ] Any errors corrected
  - [ ] MRA_DECLARATIONS_STATUS.md
    - [ ] All declarations tracked
    - [ ] Filing status confirmed
    - [ ] Deadlines verified

**Tech Team:**
- [ ] Archive exports to backup location
  ```bash
  tar -czf exports-phase2d-$(date +%Y%m%d).tar.gz exports/
  ```

**HR Team:**
- [ ] Sign off on completion:
  - [ ] All deliverables generated: ✅
  - [ ] All calculations verified (100% accuracy): ✅
  - [ ] MRA compliance confirmed: ✅
  - [ ] No outstanding issues: ✅

**Deliverable:** All files ready for handoff to Finance/Accounting

---

## Success Criteria

### Data Completeness
- [x] 100% of bulletins_paie exported
- [x] All 24 months covered (no gaps)
- [x] All employees with contracts included
- [x] 0 NULL values in critical columns

### Calculation Accuracy
- [x] 120 payroll calculations verified
- [x] 0 errors (100% accuracy required)
- [x] PAYE, CSG, NSF, Net all correct per MRA 2025 barème
- [x] Contract salary matches gross salary

### MRA Compliance
- [x] PAYE withheld = PAYE declared (reconciled)
- [x] CSG/NSF withheld = CSG/NSF declared (reconciled)
- [x] 0 MRA compliance violations
- [x] IT Form 3 filed on time (by Sept 30)
- [x] EDF submissions complete
- [x] No outstanding PAYE > 30 days

### Documentation
- [x] All 5 export files complete and accurate
- [x] All verification queries run and documented
- [x] Discrepancies (if any) investigated and resolved
- [x] Clear audit trail of verification process

---

## Issue Escalation Matrix

| Issue | Who to Contact | Action |
|-------|----------------|--------|
| Bulletins missing for a month | Tech Team | Check DB, generate missing bulletins |
| PAYE calculation error | Tech + HR Team | Verify barème, check paie.ts implementation |
| PAYE withheld ≠ declared | Tech + HR Team | Cross-reference declarations table, investigate variance |
| IT Form 3 missing | HR Team | Contact MRA or file form if still in deadline |
| EDF missing for employee | HR Team | File EDF retroactively or document exemption |
| Outstanding PAYE > 30 days | HR Team + Finance | Pay MRA immediately, update GL 4330 |

---

## Sign-Off

**HR Team Lead:** _________________ **Date:** _______

**Tech Team Lead:** ________________ **Date:** _______

**Finance/Accounting Review:** ______ **Date:** _______

---

## Notes & Issues

```
[Space for notes, issues encountered, and resolutions]
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Status:** Ready for Execution
