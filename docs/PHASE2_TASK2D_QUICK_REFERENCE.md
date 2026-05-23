# Phase 2, Task 2D — Quick Reference Card

## 5 Key Deliverables

| # | Deliverable | File | Format | Key Data |
|---|-------------|------|--------|----------|
| 1 | Payroll Bulletins (24m) | PAYROLL_BULLETINS_24MONTHS.csv | CSV | Month, Employee, Gross, Deductions, Net, Payment Date |
| 2 | Monthly Summaries (24m) | PAYROLL_SUMMARIES_24MONTHS.md | Markdown | Totals by month, GL postings (6400, 6401, 4420-4423) |
| 3 | PAYE Compliance | PAYE_MRA_COMPLIANCE.md | Markdown | PAYE withheld vs. declared, GL 4330 reconciliation |
| 4 | Calculation Verification | PAYROLL_CALCULATION_VERIFICATION.md | Markdown | 20 emp × 6 months = 120 verifications (100% accuracy) |
| 5 | MRA Declaration Status | MRA_DECLARATIONS_STATUS.md | Markdown | IT Form 3, EDF, filing dates, payment status |

---

## MRA 2025 Barèmes (for hand-verification)

### PAYE Tax Bands
```
Gross 0-390k:        0%
Gross 390k-700k:     10% on amount above 390k
Gross >700k:         15% on amount above 700k
                     (+ 31k fixed from 390-700k band)
```

### CSG Contributions
```
Gross < 50k:         1.5%
Gross ≥ 50k:         3%
(Both employee + employer rates may apply)
```

### NSF Contributions
```
Employee:            1% (capped)
Employer:            2.5% (capped)
```

---

## Key GL Accounts

| Account | Description | Usage |
|---------|-------------|-------|
| **6411** | Salaires bruts | Debit for gross salary |
| **6451-6454** | Charges patronales | Debit for employer CSG/NSF/PRGF/Training |
| **4210** | Personnel dettes | Credit for net salary payable |
| **4311/4312** | CSG/NSF salarié | Credit for employee deductions |
| **4321-4324** | CSG/NSF patronal | Credit for employer contributions |
| **4330** | PAYE à payer | Credit for income tax withheld |

---

## Execution Timeline

| Week | Task | Hours | Owner |
|------|------|-------|-------|
| 1 | Setup, data validation, MRA audit | 8 | Tech + HR |
| 1 | Completeness review, employee verification | 8 | Tech + HR |
| 1 | Declarations audit | 8 | HR + Tech |
| 2 | Run extraction, generate reports | 2 | Tech |
| 2 | Hand-verify 120 calculations | 3 | HR + Tech |
| 2 | MRA compliance cross-check | 2 | HR + Tech |
| 2 | QA and sign-off | 1 | HR + Tech |
| **Total** | | **30 hours** | |

---

## Success Checklist (Must All Be ✅)

- [x] 100% of bulletins_paie exported (no missing months/employees)
- [x] PAYE withheld = PAYE declared (reconciled)
- [x] 120 calculations verified with 0 errors (100% accuracy)
- [x] 0 MRA compliance violations
- [x] IT Form 3 filed by September 30
- [x] All GL accounts correctly mapped
- [x] No outstanding PAYE > 30 days

---

## Common Issues & Fixes

### "No bulletins found"
- Check Supabase connection
- Verify SUPABASE_SERVICE_ROLE_KEY
- Query: `SELECT COUNT(*) FROM bulletins_paie;`

### PAYE doesn't match
- Verify parametres_paie_mra has 2025 rates
- Check lib/rh/paie.ts implementation
- Review employee start/end dates (prorata)

### Missing MRA declarations
- Check if declarations tables exist
- Run RPC: `agreger_declarations_mra` to generate

### Outstanding PAYE > 30 days
- Check GL 4330 balance
- Ensure all MRA payments recorded
- Contact Finance to remit immediately

---

## Key Files & Locations

```
Repository Root:
├── scripts/
│   └── phase2-task2d-payroll-extraction.ts    ← Main script
├── docs/
│   ├── PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md         ← Full guide
│   ├── PHASE2_TASK2D_EXECUTION_CHECKLIST.md              ← HR checklist
│   └── PHASE2_TASK2D_QUICK_REFERENCE.md                  ← This file
├── supabase/
│   └── phase2-task2d-verification-queries.sql            ← SQL verification
└── exports/
    ├── PAYROLL_BULLETINS_24MONTHS.csv
    ├── PAYROLL_SUMMARIES_24MONTHS.md
    ├── PAYE_MRA_COMPLIANCE.md
    ├── PAYROLL_CALCULATION_VERIFICATION.md
    └── MRA_DECLARATIONS_STATUS.md
```

---

## Database Queries (Quick Access)

### Extract all bulletins
```sql
SELECT b.id, b.periode, b.employe_id, b.salaire_brut, b.paye, b.csg_salarie, b.nsf_salarie, b.salaire_net
FROM bulletins_paie b
ORDER BY b.periode DESC, b.employe_id;
```

### Verify PAYE correctness (sample)
```sql
SELECT b.employe_id, b.periode, b.salaire_brut, b.paye,
  CASE WHEN b.salaire_brut <= 390000 THEN 0
       WHEN b.salaire_brut <= 700000 THEN (b.salaire_brut - 390000) * 0.10
       ELSE 31000 + (b.salaire_brut - 700000) * 0.15 END as expected_paye
FROM bulletins_paie b LIMIT 50;
```

### PAYE totals by month
```sql
SELECT periode, SUM(paye) as total_paye, COUNT(*) as employees
FROM bulletins_paie
GROUP BY periode
ORDER BY periode DESC;
```

---

## MRA Deadlines (2025)

| Form | Frequency | Deadline | Notes |
|------|-----------|----------|-------|
| PAYE Remittance | Monthly | 10th of following month | Prior month |
| CSG/NSF Remittance | Monthly | 10th of following month | Prior month |
| IT Form 3 | Annual | September 30 | Fiscal year ended June 30 |
| EDF | Monthly | With PAYE/CSG remittance | Employee declarations |

---

## Contact & Escalation

**Tech Lead:** contact via project Slack  
**HR Lead:** contact via project Slack  
**Finance/Accounting:** review final reports  

**If stuck:**
1. Check PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md "Troubleshooting" section
2. Review phase2-task2d-verification-queries.sql for data quality checks
3. Escalate via project issue tracker with:
   - Exact error message
   - SQL query that failed (if applicable)
   - Environment (dev/prod)
   - Expected vs. actual result

---

## Verification Workflow

```
1. RUN EXTRACTION SCRIPT
   ↓
2. SPOT-CHECK CSV FILES
   ├─ Row counts
   ├─ Sample data
   ├─ Column headers
   ↓
3. VERIFY CALCULATIONS (120 samples)
   ├─ PAYE: MRA 2025 barème
   ├─ CSG: 1.5% or 3% based on threshold
   ├─ NSF: 1% (employee)
   ├─ NET: Gross - deductions
   ↓
4. RECONCILE MRA COMPLIANCE
   ├─ Bulletins PAYE = Declared PAYE
   ├─ Bulletins CSG/NSF = Declared CSG/NSF
   ├─ IT Form 3 filed by Sept 30
   ├─ EDF complete
   ↓
5. SIGN OFF
   ├─ HR team approval
   ├─ Tech team approval
   └─ Handoff to Finance
```

---

**Version:** 1.0 | **Last Updated:** 2026-05-22 | **Status:** Ready for Execution
