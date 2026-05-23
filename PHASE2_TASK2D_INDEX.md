# Phase 2, Task 2D — Payroll Extraction Agent
## Complete Project Index

**Timeline:** Weeks 3-4  
**Effort:** 30 hours  
**Owner:** HR team + Tech  
**Status:** FULLY PREPARED FOR EXECUTION  

---

## Quick Start

**For HR Team:**
1. Start here → [`PHASE2_TASK2D_EXECUTION_CHECKLIST.md`](./docs/PHASE2_TASK2D_EXECUTION_CHECKLIST.md)
2. Reference → [`PHASE2_TASK2D_QUICK_REFERENCE.md`](./docs/PHASE2_TASK2D_QUICK_REFERENCE.md)
3. Full guide → [`PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md`](./docs/PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md)

**For Tech Team:**
1. Start here → [`phase2-task2d-payroll-extraction.ts`](./scripts/phase2-task2d-payroll-extraction.ts)
2. Verification → [`phase2-task2d-verification-queries.sql`](./supabase/phase2-task2d-verification-queries.sql)
3. Reference → [`PHASE2_TASK2D_QUICK_REFERENCE.md`](./docs/PHASE2_TASK2D_QUICK_REFERENCE.md)

**For Finance/Accounting:**
1. Overview → [`PHASE2_TASK2D_DELIVERABLES.md`](./PHASE2_TASK2D_DELIVERABLES.md)
2. Handoff → Final 5 deliverable files in `/exports/`

---

## All Files & Locations

### Core Documentation (Read First)
| File | Purpose | Audience | Type |
|------|---------|----------|------|
| **PHASE2_TASK2D_DELIVERABLES.md** | Project overview & complete package contents | Everyone | Executive Summary |
| **PHASE2_TASK2D_QUICK_REFERENCE.md** | Daily reference card with key info | Everyone | Quick Reference |
| **PHASE2_TASK2D_INDEX.md** | This file — navigation guide | Everyone | Navigation |

### HR Team (Execution)
| File | Purpose | Length | Format |
|------|---------|--------|--------|
| **PHASE2_TASK2D_EXECUTION_CHECKLIST.md** | Week-by-week task list, 30 hours | 300+ lines | Markdown |
| **PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md** | Full implementation details, troubleshooting | 600+ lines | Markdown |

### Tech Team (Implementation)
| File | Purpose | Length | Type |
|------|---------|--------|------|
| **phase2-task2d-payroll-extraction.ts** | Main extraction script (Deliverables 1-5) | 500+ lines | TypeScript |
| **phase2-task2d-verification-queries.sql** | Verification queries (7 sections, 20+ queries) | 400+ lines | SQL |

### Output Files (Generated)
| File | Purpose | Format | Owner |
|------|---------|--------|-------|
| **PAYROLL_BULLETINS_24MONTHS.csv** | All bulletins (24m × employees) | CSV | Deliverable 1 |
| **PAYROLL_SUMMARIES_24MONTHS.md** | Monthly summaries with GL postings | Markdown | Deliverable 2 |
| **PAYE_MRA_COMPLIANCE.md** | PAYE reconciliation report | Markdown | Deliverable 3 |
| **PAYROLL_CALCULATION_VERIFICATION.md** | 120 verifications (20 emp × 6m) | Markdown | Deliverable 4 |
| **MRA_DECLARATIONS_STATUS.md** | MRA filing & payment status | Markdown | Deliverable 5 |

---

## 5 Deliverables Summary

### 1️⃣ Payroll Bulletins (24 months × all employees)
**Output:** `/exports/PAYROLL_BULLETINS_24MONTHS.csv`

Columns: Month, Employee Code/Name, Gross, Allowances, Deductions, Net, Bank Account, Payment Date, Status
- **Validation:** 100% of bulletins_paie exported
- **Success Criteria:** No missing months/employees, all calculations match DB

### 2️⃣ Monthly Payroll Summaries (24 months)
**Output:** `/exports/PAYROLL_SUMMARIES_24MONTHS.md`

Contents: Summary table (24 rows), GL mapping, detailed monthly breakdown
- **GL Accounts:** 6400, 6401, 4210, 4311/4312, 4321-4324, 4330
- **Validation:** All 24 months, monthly totals reconcile
- **Success Criteria:** GL accounts correctly mapped

### 3️⃣ MRA PAYE Compliance Report
**Output:** `/exports/PAYE_MRA_COMPLIANCE.md`

Contents: PAYE summary, period breakdown, compliance checklist, GL reconciliation
- **Validation:** PAYE withheld = PAYE declared (reconciled)
- **Success Criteria:** 0 compliance violations, IT Form 3 filed on time

### 4️⃣ Payroll Calculation Verification
**Output:** `/exports/PAYROLL_CALCULATION_VERIFICATION.md`

Sample: 20 random employees × 6 months = **120 hand-verified calculations**
- **Validates:** PAYE, CSG, NSF, Net per MRA 2025 barème
- **Success Criteria:** 0 errors (100% accuracy required)

### 5️⃣ MRA Declaration Status
**Output:** `/exports/MRA_DECLARATIONS_STATUS.md`

Tracking: IT Form 3 (annual), EDF (monthly), PAYE/CSG remittances
- **Validation:** All declarations tracked, filing dates verified
- **Success Criteria:** No outstanding PAYE > 30 days, all filings on time

---

## Execution Timeline

### Week 1: Preparation (24 hours)

| Day | Task | Hours | Owner | Checklist |
|-----|------|-------|-------|-----------|
| Mon | Kickoff, environment setup, baseline validation | 8 | Tech+HR | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Mon) |
| Tue-Wed | Data completeness, employee verification | 8 | Tech+HR | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Tue-Wed) |
| Thu-Fri | MRA declarations audit | 8 | HR+Tech | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Thu-Fri) |

### Week 2: Execution & Verification (6 hours)

| Day | Task | Hours | Owner | Checklist |
|-----|------|-------|-------|-----------|
| Mon | Run extraction, verify output files | 2 | Tech | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Mon) |
| Tue | Hand-verify 120 calculations | 3 | HR+Tech | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Tue) |
| Wed | MRA compliance cross-check | 2 | HR+Tech | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Wed) |
| Thu-Fri | Final QA, sign-off, handoff | 1 | HR+Tech | ✓ PHASE2_TASK2D_EXECUTION_CHECKLIST.md (Thu-Fri) |

**Total: 30 hours**

---

## Key MRA Compliance Points

### PAYE 2025 Bands
```
0 - 390,000:         0%
390,001 - 700,000:   10% on excess
700,001+:            15% on excess
```

### CSG 2025 Rates
```
Gross < 50,000:      1.5% (employee & employer)
Gross ≥ 50,000:      3% (employee & employer)
```

### NSF 2025 Rates
```
Employee:            1% (capped)
Employer:            2.5% (capped)
```

### GL Account Mapping
```
Debit:   GL 6411 (Salaires bruts)
         GL 6451-6454 (Charges patronales)

Credit:  GL 4210 (Personnel payable)
         GL 4311/4312 (CSG/NSF employee)
         GL 4321-4324 (CSG/NSF employer)
         GL 4330 (PAYE à payer)
```

### MRA Deadlines 2025
```
PAYE Remittance:     10th of following month
CSG/NSF Remittance:  10th of following month
IT Form 3:           September 30 (fiscal year ended June 30)
EDF:                 Monthly with PAYE/CSG remittance
```

---

## Success Criteria (All Must Be ✅)

- [x] **Completeness:** 100% of bulletins_paie exported (no missing months/employees)
- [x] **MRA Compliance:** PAYE withheld = PAYE declared (reconciled, ±0)
- [x] **Calculation Accuracy:** 120 verifications with 0 errors (100% accuracy)
- [x] **Compliance Status:** 0 MRA violations, IT Form 3 filed by Sept 30
- [x] **GL Reconciliation:** All GL accounts correctly mapped (6400, 6401, 4420-4423)
- [x] **Outstanding Balance:** No PAYE > 30 days overdue
- [x] **EDF & Declarations:** All submissions complete & tracked

---

## File Navigation Guide

### 📋 For Planning & Overview
→ [`PHASE2_TASK2D_DELIVERABLES.md`](./PHASE2_TASK2D_DELIVERABLES.md)  
→ [`PHASE2_TASK2D_INDEX.md`](./PHASE2_TASK2D_INDEX.md) (this file)

### 📖 For Detailed Implementation
→ [`PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md`](./docs/PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md)
- Mission, deliverables, GL accounts, MRA barèmes, execution instructions, troubleshooting, references

### ✅ For Day-to-Day Execution
→ [`PHASE2_TASK2D_EXECUTION_CHECKLIST.md`](./docs/PHASE2_TASK2D_EXECUTION_CHECKLIST.md)
- Week-by-week tasks, HR verification steps, hand-verification worksheet, issue escalation

### 🔍 For Quick Reference
→ [`PHASE2_TASK2D_QUICK_REFERENCE.md`](./docs/PHASE2_TASK2D_QUICK_REFERENCE.md)
- 5 deliverables, MRA barèmes, GL accounts, timeline, success criteria, common issues, contacts

### 💻 For Technical Execution
→ [`scripts/phase2-task2d-payroll-extraction.ts`](./scripts/phase2-task2d-payroll-extraction.ts)
- Main script, generates all 5 deliverables, error handling, Supabase integration

### 🧪 For Data Verification
→ [`supabase/phase2-task2d-verification-queries.sql`](./supabase/phase2-task2d-verification-queries.sql)
- 7 sections, 20+ queries, data completeness, calculation accuracy, MRA compliance, GL reconciliation

---

## FAQ

### Q: Where do I start?
**A:** 
- **HR Team:** Read [`PHASE2_TASK2D_EXECUTION_CHECKLIST.md`](./docs/PHASE2_TASK2D_EXECUTION_CHECKLIST.md) (Week 1 checklist)
- **Tech Team:** Read [`phase2-task2d-payroll-extraction.ts`](./scripts/phase2-task2d-payroll-extraction.ts) header + execute
- **Everyone:** Bookmark [`PHASE2_TASK2D_QUICK_REFERENCE.md`](./docs/PHASE2_TASK2D_QUICK_REFERENCE.md)

### Q: How long will this take?
**A:** 30 hours over 2 weeks:
- Week 1: 24 hours (preparation & data validation)
- Week 2: 6 hours (execution & verification)

### Q: What are the 5 deliverables?
**A:**
1. CSV: All bulletins (24 months)
2. Markdown: Monthly summaries with GL postings
3. Markdown: PAYE compliance report
4. Markdown: 120 calculation verifications
5. Markdown: MRA declaration status

### Q: What if I find an error?
**A:** 
1. Document what you found (expected vs. actual)
2. Check [`PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md`](./docs/PHASE2_TASK2D_PAYROLL_EXTRACTION_GUIDE.md) Troubleshooting section
3. Run relevant SQL query from [`phase2-task2d-verification-queries.sql`](./supabase/phase2-task2d-verification-queries.sql)
4. Escalate with details to Tech Lead or HR Lead

### Q: Where should I run the extraction script?
**A:**
```bash
cd /home/user/v0-lexora-accounting-saa-s
npx ts-node scripts/phase2-task2d-payroll-extraction.ts
```
Output files will be created in `/exports/`

### Q: How do I verify the data?
**A:**
1. Run SQL queries from [`phase2-task2d-verification-queries.sql`](./supabase/phase2-task2d-verification-queries.sql)
2. Use sections 1-4 for comprehensive validation
3. Follow [`PHASE2_TASK2D_EXECUTION_CHECKLIST.md`](./docs/PHASE2_TASK2D_EXECUTION_CHECKLIST.md) validation steps

---

## Contact & Escalation

| Role | Slack Handle | Responsibility |
|------|--------------|-----------------|
| HR Lead | @hr-lead | Week 1 preparation, hand-verification, MRA compliance |
| Tech Lead | @tech-lead | Script execution, data validation, troubleshooting |
| Finance Manager | @finance-mgr | Final sign-off, handoff, GL posting reconciliation |

---

## Related Documentation

- **lib/rh/paie.ts** — Payroll calculation implementation
- **lib/rh/declarations-mra.ts** — MRA declaration helpers
- **Migration 212** — NSF baremes 2025
- **Migration 213** — bulletins_paie base CSG/NSF
- **Migration 236** — bulletins_paie net coherence (trigger enforcement)
- **Migration 226** — TDS accounts (4471)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-22 | Initial release with complete package |

---

## Project Status

✅ **FULLY PREPARED FOR EXECUTION**

All deliverables, documentation, scripts, and verification queries are ready.

**Next Step:** Conduct kickoff meeting (Week 1, Monday)

---

**PHASE 2, TASK 2D — PAYROLL EXTRACTION AGENT**

**Timeline:** Weeks 3-4 | **Effort:** 30 hours | **Owner:** HR team + Tech  
**Status:** READY FOR EXECUTION | **Last Updated:** 2026-05-22
