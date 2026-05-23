# MRA Compliance Checklist
## Mauritian Accounting & Tax Filing Requirements

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Focus**: Mauritius Revenue Authority (MRA) Compliance  
**Prepared for**: Big 4 Audit Compliance  

---

## SECTION 1: ANNUAL FILING DEADLINES

### 1.1 Key MRA Deadlines (Fiscal Year 2025, ending June 30, 2026)

| Deadline | Document | Description | Form | Status | Evidence |
|---|---|---|---|---|---|
| **31-08-2026** | Income Tax Return | Companies Act filing (annual) | IT Form 3 | ⏳ Pending | /exports/IT-Form-3-2026.pdf |
| **31-08-2026** | Corp Tax Payment | Full year corp tax due | Payment receipt | ⏳ Pending | Bank statement |
| **15-09-2026** | CSG Contribution | CSG annual settlement | CSG Form 1 | ⏳ Pending | /exports/CSG-Form-1-2026.pdf |
| **15-09-2026** | NSF Contribution | NSF annual settlement | NSF Form 1 | ⏳ Pending | /exports/NSF-Form-1-2026.pdf |
| **31-10-2026** | VAT Return (Q2) | April-June 2026 VAT | VAT Return | ⏳ Pending | /exports/VAT-Q2-2026.pdf |
| **30-11-2026** | PAYE Annual | Annual PAYE summary | PAYE Annual | ⏳ Pending | /exports/PAYE-Annual-2026.pdf |
| **N/A** | Entity List | Banking/investment entities | Entity List | ✅ Submitted | /exports/Entity-List-2026.pdf |
| **N/A** | Beneficial Ownership | UBO declaration (FATCA/CRS) | UBO Declaration | ✅ Submitted | /exports/UBO-Declaration-2026.pdf |

**Legend**: ⏳ = Not yet due, ✅ = Completed, ❌ = Overdue, 🔄 = In progress

---

## SECTION 2: PAYE WITHHOLDING COMPLIANCE

### 2.1 Monthly PAYE Declarations

**Schedule: Due by 10th of following month**

| Month | Employees | Gross Salary | PAYE Withheld | CSG Withheld | NSF Withheld | Filing Date | Status |
|---|---|---|---|---|---|---|---|
| **Jan 2026** | 5 | 250,000 | 30,000 | 2,500 | 1,500 | 2026-02-10 | ✅ Filed |
| **Feb 2026** | 5 | 250,000 | 30,000 | 2,500 | 1,500 | 2026-03-10 | ✅ Filed |
| **Mar 2026** | 5 | 262,500 | 31,500 | 2,625 | 1,575 | 2026-04-10 | ✅ Filed |
| **Apr 2026** | 5 | 262,500 | 31,500 | 2,625 | 1,575 | 2026-05-10 | ✅ Filed |
| **May 2026** | 5 | 262,500 | 31,500 | 2,625 | 1,575 | 2026-06-10 | 🔄 Filing |
| **Jun 2026** | 5 | 275,000 | 33,000 | 2,750 | 1,650 | 2026-07-10 | ⏳ Pending |

**PAYE Compliance Verification:**

```
Reconciliation: Monthly filings vs. GL account 4420 (PAYE Payable)

GL Account 4420 Balance (June 30, 2026): 191,500 MUR
├─ This should equal: Sum of all monthly PAYE withheld
├─ Calculation: (30+30+31.5+31.5+31.5+33) × 1,000 = 187,500 MUR
├─ Variance: 4,000 MUR (unresolved - investigate)
├─ Issue: Q2 July filing not yet included
└─ Resolution: Verify July PAYE amount & payment

PAYE Payment Tracking:
├─ Amount withheld (Jan-Jun): 187,500 MUR
├─ Amount paid to MRA: 185,000 MUR (per bank statement)
├─ Amount still owing: 2,500 MUR
└─ Due date: Before Aug 31, 2026 annual filing
```

### 2.2 PAYE Annual Settlement (Form 3.5)

**Due: August 31, 2026 (within 2 months of FY end)**

```
Expected PAYE Annual Form:

Fiscal Year: 01-07-2025 to 30-06-2026
Employees: 5 (unchanged during year)

PAYE Calculation:
├─ Employee 1: Gross 302,000 → PAYE 36,000
├─ Employee 2: Gross 302,000 → PAYE 36,000
├─ Employee 3: Gross 315,000 → PAYE 37,800
├─ Employee 4: Gross 290,000 → PAYE 34,800
├─ Employee 5: Gross 291,000 → PAYE 34,920
├─ Total gross: 1,500,000
├─ Total PAYE: 179,520
└─ Reconciliation needed: (176 × 1,000) = 176,000 (vs 179,520 from above)

CSG Annual:
├─ Employee CSG (1% of gross): 15,000
├─ Employer CSG (1.5%): 22,500
└─ Total CSG: 37,500

NSF Annual:
├─ Employee NSF (0.6%): 9,000
├─ Employer NSF (3.5%): 52,500
└─ Total NSF: 61,500

Action required:
├─ Prepare Form 3.5 with accurate figures
├─ Cross-check with GL accounts (6200 Salaries, 4420 PAYE)
├─ Verify CSG/NSF contributions paid to MRA
└─ File by Aug 31, 2026
```

---

## SECTION 3: VAT COMPLIANCE

### 3.1 Quarterly VAT Returns (Due 31st day of month following quarter)

| Quarter | Period | VAT Charged (4412) | VAT Paid (4411) | Net VAT Due | Due Date | Status |
|---|---|---|---|---|---|---|
| **Q1** | Jul-Sep 2025 | 125,000 | 85,000 | +40,000 | 31-Oct-2025 | ✅ Filed |
| **Q2** | Oct-Dec 2025 | 140,000 | 92,000 | +48,000 | 31-Jan-2026 | ✅ Filed |
| **Q3** | Jan-Mar 2026 | 150,000 | 98,000 | +52,000 | 30-Apr-2026 | ✅ Filed |
| **Q4** | Apr-Jun 2026 | 155,000 | 102,000 | +53,000 | 31-Jul-2026 | 🔄 Filing |
| **TOTAL FY** | Jul 2025-Jun 2026 | 570,000 | 377,000 | +193,000 | — | Payment plan |

**VAT Compliance Check:**

```
VAT Journal Codes in GL:
├─ 4412 (VAT payable on sales): 570,000 MUR
├─ 4411 (VAT recoverable on purchases): 377,000 MUR
├─ Net VAT due: 193,000 MUR
│
└─ Reconciliation:
   ├─ Q1 VAT filing: 40,000 paid to MRA (Oct 2025)
   ├─ Q2 VAT filing: 48,000 paid to MRA (Jan 2026)
   ├─ Q3 VAT filing: 52,000 paid to MRA (Apr 2026)
   ├─ Q4 VAT filing: 53,000 due by Jul 31, 2026
   │
   ├─ Total paid Jan-Apr 2026: 140,000 (50,000 + 48,000 + 52,000)
   └─ Still owing: 53,000 (Q4 due Jul 31)

Action: VAT Q4 form prepared, due for filing July 31, 2026
```

### 3.2 VAT Registration Verification

```
Registration Status: ✅ ACTIVE
├─ VAT Number: MU123456 (hypothetical)
├─ Effective date: 01-01-2024
├─ Status: Good standing (all returns filed on time)
└─ Next review: Annual (with IT Form 3)

VAT Treatment Summary:
├─ Standard rate (15%): Applied to most sales
├─ Zero rate (0%): Applied to exports (with documentation)
├─ Exempt: Services (some), financial services (if applicable)
└─ Reverse charge: Applied to international services (if applicable)

Zero-rated Sales Example:
├─ Invoice: EUR 10,000 to EU customer
├─ VAT applied: 0% (export)
├─ Supporting doc: Proof of export (shipping doc, customs)
├─ GL entry: 706 (Revenue) EUR 10,000, 4412 (VAT) EUR 0
└─ VAT recovery: Can recover input VAT despite zero rate
```

---

## SECTION 4: CORPORATE TAX COMPLIANCE

### 4.1 Corporate Income Tax (IT Form 3)

**Due: August 31, 2026 (or within 3 months of FY end with extension)**

```
Expected IT Form 3 (Fiscal Year Jul 2025 - Jun 2026):

INCOME SECTION:
├─ Trading income (sales): 3,800,000 MUR
├─ Interest income: 5,000 MUR
├─ Dividend income: 0 MUR
└─ Total income: 3,805,000 MUR

EXPENSES:
├─ Salaries & wages: 1,500,000 MUR (GL: 6200)
├─ Rent: 240,000 MUR (GL: 6220)
├─ Utilities: 60,000 MUR (GL: 6230)
├─ Depreciation (fixed assets): 50,000 MUR (GL: 6810)
├─ Office supplies: 15,000 MUR (GL: 6240)
├─ Professional fees (audit, tax): 30,000 MUR (GL: 6290)
├─ Bad debts provision: 20,000 MUR (GL: 6950)
├─ Other operating expenses: 75,000 MUR (GL: 6300-6999)
└─ Total expenses: 1,990,000 MUR

TAXABLE INCOME CALCULATION:
├─ Gross profit: 3,805,000 - 1,990,000 = 1,815,000 MUR
├─ Less: Non-deductible items (entertainment): -10,000 MUR
├─ Add: Recapture (prior year provision): +5,000 MUR
├─ Taxable income: 1,810,000 MUR
│
├─ Corporate tax rate (2026): 15%
├─ Corporate tax payable: 271,500 MUR
├─ Less: PAYE withheld (already paid): 179,520 MUR
├─ Balance due: 91,980 MUR
└─ Due with IT Form 3 filing: Aug 31, 2026

GL Reconciliation:
├─ GL account 4414 (Corp tax payable): Should reflect 271,500
├─ GL account 4413 (PAYE withheld, recovery): (179,520) [credit]
├─ Net liability: 91,980
└─ Status: Monitor GL balance vs. expected tax
```

---

## SECTION 5: CSG & NSF COMPLIANCE

### 5.1 CSG (Contribution to Social Development Fund)

**Annual rates (2026)**:
- Employee: 1% of gross salary
- Employer: 1.5% of gross salary

**Annual Filing: September 15, 2026**

```
CSG Calculation (FY 2025-26):

Employee CSG (1%):
├─ Jan-Jun salaries: 1,500,000 MUR
├─ CSG rate: 1% = 15,000 MUR
└─ GL account: 4421 (CSG withheld)

Employer CSG (1.5%):
├─ Gross payroll: 1,500,000 MUR
├─ Employer contribution: 1.5% = 22,500 MUR
└─ GL account: 6300 (CSG expense) + 4421 (CSG payable)

Total CSG for FY:
├─ Total due: 15,000 + 22,500 = 37,500 MUR
├─ GL check: Account 4421 balance = 37,500?
└─ MRA filing: Form CSG-1 due Sep 15, 2026

Payment verification:
├─ Amount withheld from salaries: 15,000 (verified from payslips)
├─ Amount paid to MRA: 15,000 (per bank statement, date & receipt)
├─ Employer contribution paid: 22,500 (per bank statement, date & receipt)
└─ Total paid: 37,500 (complete)
```

### 5.2 NSF (National Savings Fund)

**Annual rates (2026)**:
- Employee: 0.6% of gross salary (capped at MUR 200/month)
- Employer: 3.5% of gross salary (capped at MUR 1,167/month)

**Annual Filing: September 15, 2026**

```
NSF Calculation (FY 2025-26):

Employee NSF (0.6%, capped MUR 200/month):
├─ Each employee: 0.6% × monthly salary (max 200 MUR/month)
├─ Example Employee 1: 50,333/mo gross → 0.6% = 302 MUR (capped at 200)
├─ Total employees (12 months): 5 × 200 × 12 = 12,000 MUR
└─ GL account: 4430 (NSF withheld)

Employer NSF (3.5%, capped MUR 1,167/month):
├─ Each employee: 3.5% × monthly salary (max 1,167 MUR/month)
├─ Example Employee 1: 50,333/mo × 3.5% = 1,762 MUR (capped at 1,167)
├─ Total employees (12 months): 5 × 1,167 × 12 = 70,020 MUR
└─ GL account: 6410 (NSF expense) + 4431 (NSF payable)

Total NSF for FY:
├─ Total due: 12,000 + 70,020 = 82,020 MUR
├─ GL check: Accounts 4430 + 4431 = 82,020?
└─ MRA filing: Form NSF-1 due Sep 15, 2026

Payment verification:
├─ Employee NSF withheld: 12,000 (per payslips)
├─ Employer NSF paid: 70,020 (per bank statement)
└─ Total paid: 82,020 (complete)
```

---

## SECTION 6: ACCOUNTING RECORDS & RETENTION

### 6.1 Required Records

**All companies must maintain:**

| Record | Retention | Format | Status | Notes |
|---|---|---|---|---|
| **General Ledger** | 5 years | Electronic (GL module) | ✅ Maintained | Lexora maintains 7 years |
| **Invoice copies** | 6 years | PDF + electronic | ✅ Maintained | Lexora maintains 7 years |
| **Bank statements** | 6 years | PDF + electronic | ✅ Maintained | Lexora maintains 7 years |
| **Payroll records** | 3 years (minimum) | Electronic | ✅ Maintained | Lexora maintains 5 years + 7 for GL |
| **Supporting docs** | 5 years | PDF + paper | ✅ Maintained | Invoices, receipts, contracts |
| **Tax returns** | 5 years | Paper + electronic | ✅ Maintained | IT Form 3, VAT returns, PAYE |
| **Board minutes** | 5 years | Paper (or electronic) | ✅ Maintained | Corporate governance |

**Lexora Compliance:**
- ✅ GL entries: 7-year retention (exceeds 5-year requirement)
- ✅ Invoices: 7-year retention (exceeds 6-year requirement)
- ✅ Bank statements: 7-year retention (exceeds 6-year requirement)
- ✅ Payroll: 5 years post-termination for employee records, 7 years for GL
- ✅ Audit trail: 7-year immutable log (audit-ready)

### 6.2 Sequential Numbering (Required by MRA)

**MRA Requirement**: Invoice numbers must be sequential (no gaps, no reuse)

```
Invoice sequence tracking:

Period: Jan-Jun 2026
├─ First invoice: INV-2026-0001 (issued 2026-01-05)
├─ Last invoice: INV-2026-0047 (issued 2026-06-28)
├─ Total invoices: 47
├─ Sequential check: No gaps in sequence ✅
├─ Reuse check: No duplicate numbers ✅
└─ Gap exception: INV-2026-0025 was created & rejected (draft, not posted)
                   Action: Document reason (GL posting error, corrected)

For VAT purposes:
├─ All invoices with VAT: INV-2026-0001 through INV-2026-0047
├─ Total sales revenue: 3,800,000 MUR (including VAT)
├─ VAT charged (15%): 570,000 MUR (net of zero-rated exports)
└─ Supporting doc: Sequence list with dates & customers
```

---

## SECTION 7: CRITICAL COMPLIANCE RISKS

### 7.1 High-Risk Areas

| Risk | Mitigation in Lexora | Auditor Verification |
|---|---|---|
| **PAYE underwitholding** | System calculates per MRA barème; Directeur reviews | Reconcile GL 4420 vs. monthly filings |
| **VAT underreporting** | System tracks 4411/4412; quarterly reconciliation enforced | Verify VAT return vs. GL posting |
| **Salary not recorded** | GL required for PAYE filing (cannot process without) | Trace invoice → GL → PAYE filing |
| **Invoice numbering gaps** | System enforces sequential numbering | Review invoice sequence report |
| **CSG/NSF miscalculation** | System applies caps (200 MUR/month for employee, 1,167 for employer) | Spot check 2-3 employee calculations |
| **Unjustified deductions** | GL categories predefined (no "other"); descriptions required | Review deduction categories |
| **Missing supporting docs** | Invoices linked to GL; PDF attachments required | Sample 5 GL entries with attached docs |
| **Late filings** | Calendar alerts; due dates in system | Verify filing dates in export reports |

### 7.2 Control Failures That Trigger Audit

```
MRA will initiate audit if:

❌ PAYE discrepancy >10% (over/under-withheld)
   Example: System says 30,000 withheld, but filed 27,000

❌ VAT underreporting (net VAT owed not paid)
   Example: Filed 40,000 VAT due, but only paid 35,000

❌ Missing filings (any deadline missed)
   Example: Q2 VAT return filed 45 days late

❌ Duplicate invoices detected
   Example: Two invoices with same number (fraud indicator)

❌ Large cash receipts not recorded (informal sales)
   Example: Bank shows 50,000 credit, GL shows nothing

❌ Inconsistent employee records
   Example: IT Form 3 shows 5 employees, PAYE shows 6

❌ Unexplained deductions
   Example: 100,000 MUR "entertainment" with no supporting docs

Consequence: MRA audit + 5-year look-back + penalties (5-50% of underpayment)
```

---

## SECTION 8: LEXORA CONTROL PROCEDURES

### 8.1 Automated Compliance Controls

**System-Enforced Controls:**

```
PAYE Withholding:
├─ Rule: Tax barème applied automatically based on gross salary
├─ Enforcement: System calculates, user cannot override
├─ Verification: Directeur reviews monthly vs. expected
└─ Exception: Requires CFO approval to modify

VAT Posting:
├─ Rule: 15% VAT added to all sales (except zero-rated with docs)
├─ Enforcement: GL posting rules enforce VAT split (revenue vs. VAT)
├─ Verification: VAT total reconciled quarterly before filing
└─ Exception: Zero-rating requires supporting export documentation

Invoice Numbering:
├─ Rule: Sequential, no gaps (previous+1)
├─ Enforcement: System rejects if number not in sequence
├─ Verification: Invoice list report shows all numbers
└─ Exception: Reused numbers logged (only if original was draft/deleted)

Salary Recording:
├─ Rule: Payroll → GL entry automatically (no manual GL entry allowed)
├─ Enforcement: GL entry created as part of payroll processing
├─ Verification: 100% of payroll-sourced GL entries linked to payroll record
└─ Exception: Manual GL only for adjustments (approved by Directeur)

CSG/NSF Calculation:
├─ Rule: 1% CSG employee, 1.5% employer; 0.6% NSF employee (cap 200), 3.5% employer (cap 1,167)
├─ Enforcement: System applies rates; caps enforced at pay-per-employee-per-month
├─ Verification: Annual report shows per-employee totals vs. system limits
└─ Exception: None (system enforces, no overrides)
```

### 8.2 Manual Verification Procedures

**Monthly Procedures:**

```
T+10 days after month-end (by Directeur):

1. PAYE Check (5 minutes)
   ├─ Verify: Sum of GL account 4420 = Expected PAYE for month
   ├─ Calculate: (1,500,000 / 12) × 15% = 18,750 expected
   ├─ Compare: GL shows 18,750? If not, investigate
   └─ Action: Escalate if variance >5%

2. VAT Check (5 minutes)
   ├─ Verify: Sum of GL 4412 (sales VAT) - 4411 (purchase VAT) = Net due
   ├─ Quarter: Check quarterly total after last month of quarter
   └─ Action: Prepare VAT return 2 weeks before filing deadline

3. GL Balance Check (5 minutes)
   ├─ Verify: Trial balance (total debit = total credit)
   ├─ Check: Accounts 4420-4441 (payroll/tax accounts) have expected balance
   └─ Action: Flag any unusual balances for investigation

4. Invoice Sequence Check (2 minutes)
   ├─ Verify: Last invoice number = Expected sequence (previous month + new count)
   ├─ Example: If last month ended at INV-047, this month should be 047+ new invoices
   └─ Action: Flag any gaps or duplicates

Total time: ~17 minutes per month (12 hours per year)
Complexity: Low (mostly automated; Directeur confirms)
```

**Annual Procedures:**

```
T+30 days before IT Form 3 due date (by CFO + Comptable):

1. Corporate Income Tax Calculation (60 minutes)
   ├─ Compile: All GL accounts (income & expenses) for fiscal year
   ├─ Verify: All tax adjustments (non-deductible, recaptures)
   ├─ Calculate: Taxable income = Gross profit - adjustments
   ├─ Apply tax rate: 15% (2026 rate)
   └─ Prepare: IT Form 3 draft

2. PAYE Annual Reconciliation (45 minutes)
   ├─ Compile: Sum of all monthly PAYE withheld (GL 4420)
   ├─ Verify: Equals PAYE paid to MRA (bank statements)
   ├─ Compare: Against payroll records (monthly submission reports)
   ├─ Reconcile: Any variances explained
   └─ Prepare: Annual PAYE form

3. VAT Annual Review (30 minutes)
   ├─ Compile: Sum of all quarterly VAT filings
   ├─ Verify: Equals VAT paid to MRA (bank statements)
   ├─ Verify: Zero-rated exports have supporting documentation
   └─ Prepare: Annual summary

4. CSG/NSF Annual Verification (30 minutes)
   ├─ Compile: CSG & NSF withheld per GL accounts 4421/4430-4441
   ├─ Verify: Equals amounts paid to MRA (bank statements)
   ├─ Verify: Employee caps applied correctly (200 NSF, 0.6% CSG)
   ├─ Verify: Employer contributions recorded (1.5% CSG, 3.5% NSF)
   └─ Prepare: Annual CSG/NSF forms

5. Audit Trail Verification (30 minutes)
   ├─ Confirm: All GL entries approved (Directeur sign-off)
   ├─ Confirm: All invoices sequential (no gaps)
   ├─ Confirm: All bank reconciliations signed off
   └─ Confirm: All supporting documents attached

Total time: ~3 hours annual (plus IT Form 3 preparation)
Complexity: Medium (requires accounting knowledge)
Owner: CFO + Comptable (joint responsibility)
```

---

## SECTION 9: AUDIT READINESS

### 9.1 Documentation Audit Trail

**Big 4 Auditor Review Checklist:**

- [ ] **PAYE Compliance**
  - [ ] Review monthly PAYE declarations (6 months sample)
  - [ ] Verify GL account 4420 reconciles to monthly filings
  - [ ] Verify PAYE paid to MRA matches GL withheld
  - [ ] Check PAYE annual form accuracy
  - [ ] Evidence: Monthly filing reports + bank statements

- [ ] **VAT Compliance**
  - [ ] Review quarterly VAT returns (4 quarters FY)
  - [ ] Verify GL accounts 4411/4412 reconcile to VAT returns
  - [ ] Verify zero-rated sales have export documentation
  - [ ] Check VAT paid to MRA matches GL liability
  - [ ] Evidence: VAT returns + supporting docs + bank statements

- [ ] **Corporate Tax**
  - [ ] Review GL accounts for income & expenses
  - [ ] Verify IT Form 3 calculation matches GL
  - [ ] Check for non-deductible items (properly excluded)
  - [ ] Verify corporate tax payment to MRA
  - [ ] Evidence: GL detail + IT Form 3 + bank payment

- [ ] **Employee Records**
  - [ ] Verify 5 employees as per PAYE filing
  - [ ] Sample 2-3 employee payroll records
  - [ ] Verify salary calculations (GL 6200 = payroll detail)
  - [ ] Check CSG/NSF calculations per employee
  - [ ] Evidence: Payroll list + 3 sample payslips + GL posting

- [ ] **Invoice Controls**
  - [ ] Review invoice sequence (no gaps, no reuse)
  - [ ] Sample 5 invoices: VAT calculation, GL posting, payment
  - [ ] Verify invoice amounts match GL posting
  - [ ] Check zero-rated invoices have appropriate documentation
  - [ ] Evidence: Invoice sample + GL detail + supporting docs

- [ ] **Bank Reconciliation**
  - [ ] Review latest month-end reconciliation
  - [ ] Verify bank statement balance = GL account 5121
  - [ ] Check outstanding items aging
  - [ ] Verify reconciliation approved by Directeur
  - [ ] Evidence: Bank statement + GL reconciliation + sign-off

- [ ] **Record Retention**
  - [ ] Verify GL records retained 7 years (exceeds 5-year requirement)
  - [ ] Verify invoices retained 7 years (exceeds 6-year requirement)
  - [ ] Verify supporting documents indexed & searchable
  - [ ] Verify audit trail access for auditors
  - [ ] Evidence: Lexora records retention policy + sample export

**Estimated Audit Time**: 20-30 hours for Big 4 auditor

---

## SECTION 10: ONGOING COMPLIANCE MONITORING

### 10.1 Quarterly Compliance Review Schedule

| Quarter | Owner | Checklist | Deadline |
|---|---|---|---|
| **Q1** | CFO | PAYE Feb/Mar filings, VAT Q3, CSG/NSF status | 15 Apr |
| **Q2** | Comptable | PAYE Apr/May, VAT Q4 filing due 31 Jul | 15 Jul |
| **Q3** | HR Manager | Annual PAYE/CSG/NSF prep, payroll audit | 31 Aug |
| **Q4** | CFO | IT Form 3, VAT summary, all annual filings | 15 Sep |

### 10.2 Red Flags (Immediate Investigation)

If any of these conditions occur, escalate to CFO immediately:

```
❌ PAYE discrepancy >10%
   Action: Recalculate using MRA barème, identify error

❌ VAT payment different from filing
   Action: Reconcile GL to VAT return, investigate timing

❌ Invoice numbering gap
   Action: Check GL for unposted/draft invoices, document reason

❌ Missing supporting documents
   Action: Request from customer, file with GL entry

❌ Employee count change not reflected in PAYE
   Action: Verify GL posting, PAYE adjustment if mid-month hire/termination

❌ Salary changed >10% month-over-month
   Action: Verify approval authorization, PAYE recalculation

❌ Deadline approaching & filing not started
   Action: Prepare draft immediately, prioritize for review

❌ Auditor access requested (MRA, Big 4, or customer)
   Action: Verify authorization, create read-only account, monitor access
```

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial MRA compliance checklist | CFO |

**Approval:**

- [ ] Lexora Board
- [ ] Big 4 Audit Firm
- [ ] Customer (DDS Mauritius Ltd, for coordination)

**Next Review**: August 31, 2026 (after FY-end filings)

**Document Owner**: Chief Financial Officer (CFO)  
**Secondary Owner**: Compliance Officer  
**Revision Cycle**: Quarterly (per Big 4 audit requirement)

---

**END OF MRA COMPLIANCE CHECKLIST**

*For MRA questions: tax@lexora.mu (to be established)*  
*For audit coordination: compliance@lexora.mu*
