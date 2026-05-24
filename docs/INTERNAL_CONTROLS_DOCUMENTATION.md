# Internal Control Documentation
## Lexora Accounting SaaS Platform - Control Framework

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Compliance Framework**: COSO Internal Control Framework (2013) + SOX 404 standards  
**Prepared for**: Big 4 Audit Compliance  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Control Environment](#control-environment)
3. [Risk Assessment](#risk-assessment)
4. [Control Activities](#control-activities)
5. [Information & Communication](#information--communication)
6. [Monitoring & Continuous Improvement](#monitoring--continuous-improvement)
7. [Segregation of Duties Matrix](#segregation-of-duties-matrix)
8. [Authorization Levels](#authorization-levels)
9. [Approval Workflows](#approval-workflows)
10. [Control Deficiencies & Remediation](#control-deficiencies--remediation)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Control Objective

Lexora implements a comprehensive internal control framework to ensure:

✅ **Accuracy**: All GL entries balance, invoices match GL, bank matches GL  
✅ **Completeness**: All transactions recorded, no missing invoices or payments  
✅ **Authorization**: All transactions approved by authorized personnel  
✅ **Timeliness**: Close procedures completed monthly without delay  
✅ **Compliance**: Mauritian & international accounting standards honored  

### 1.2 Control Framework

| COSO Component | Implementation | Evidence |
|---|---|---|
| **1. Control Environment** | Documented roles, policies, code of conduct | Section 2 |
| **2. Risk Assessment** | Risk register, audit procedures | Section 3 |
| **3. Control Activities** | GL entry validation, approval workflows | Section 4 |
| **4. Information & Communication** | Audit trail, documentation | Section 5 |
| **5. Monitoring & Evaluation** | Quarterly reviews, exception reporting | Section 6 |

### 1.3 Scope

**Controls Cover:**
- ✅ General Ledger (GL entry creation, posting, approval)
- ✅ Invoice Management (creation, matching, payment)
- ✅ Bank Reconciliation (transaction classification, matching)
- ✅ Payroll (salary calculation, tax withholding, MRA compliance)
- ✅ Tax Compliance (declarations, filings, audit cooperation)

**Controls Do NOT Cover** (out of scope):
- ❌ Physical document security (customer's responsibility)
- ❌ Vendor selection/procurement (customer's business process)
- ❌ Executive compensation decisions (customer's HR process)
- ❌ Product development (Lexora internal control, not customer)

---

## 2. CONTROL ENVIRONMENT

### 2.1 Organizational Structure & Roles

**Lexora's Control Governance:**

```
Lexora Board
├─ CEO (Accountable for control effectiveness)
├─ CFO (Financial controls & SLA monitoring)
├─ Chief Security Officer (Security & data controls)
├─ General Counsel (Legal & compliance)
└─ Compliance Officer (Control testing & monitoring)

Audit Committee
├─ External auditor liaison
├─ Internal control issues resolution
├─ Quarterly control assessment
└─ Risk & compliance oversight
```

**Customer's Control Governance** (Lexora expects):

```
Customer (e.g., DDS Mauritius Ltd)
├─ CEO / Directeur Général (Accountable)
├─ CFO / Directeur (GL approval & month-end close)
├─ Comptable / Accounting Manager (GL entry creation & processing)
├─ HR Manager (Payroll processing & MRA filing)
└─ Bank Reconciliation Officer (Bank matching & sign-off)
```

### 2.2 Code of Conduct & Ethics

**All Lexora personnel are bound by:**

✅ **No Fraud Policy**: Zero tolerance for intentional misstatement
✅ **Confidentiality**: Customer data is confidential; never shared without consent
✅ **Independence**: Lexora auditors independent from Lexora operations
✅ **Whistleblower Procedure**: Anonymous reporting of control violations
✅ **Conflict of Interest**: Annual disclosure; no personal trading on customer info

**All Customer users are expected to:**

✅ **Honest Reporting**: Enter accurate GL entries & invoices
✅ **Segregation of Duties**: Comptable enters, Directeur approves
✅ **Access Control**: Guard passwords, report suspicious activity
✅ **Document Retention**: Keep supporting docs for 7 years
✅ **Regulatory Compliance**: File MRA returns on time, comply with Companies Act

### 2.3 Training & Competence

**Lexora provides:**
- ✅ Initial system training (user guides, videos)
- ✅ Quarterly webinars (new features, best practices)
- ✅ Documentation library (GL posting rules, FAQ)
- ✅ Dedicated support (email, phone for enterprise customers)

**Customer's responsibility:**
- ✅ Ensure users understand accounting (not Lexora's job to teach accounting)
- ✅ Verify user competence before granting access
- ✅ Update training when procedures change
- ✅ Annual certification that users are qualified

---

## 3. RISK ASSESSMENT

### 3.1 Key Risks & Mitigation

**Risk Register (Major Risks):**

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| **R1** | Unauthorized GL entry posted | Medium | High | Approval workflow (Comptable/Directeur) | CFO |
| **R2** | GL entries don't balance (D≠C) | Low | Critical | Trigger validation (tr_balance_check) | DevOps |
| **R3** | Invoice not matched to GL | Medium | Medium | Monthly matching report | Comptable |
| **R4** | Bank transaction misclassified | Medium | Medium | OCR + manual review (R1-R6 rules) | Bank Officer |
| **R5** | MRA PAYE filed incorrectly | Low | Critical | Validation reports + CFO review | HR/CFO |
| **R6** | Data breach (GL exposed) | Low | Critical | AES-256 encryption + TLS 1.3 | CSO |
| **R7** | User credentials compromised | Medium | High | MFA + IP whitelisting | CSO |
| **R8** | GL entries deleted post-close | Low | Critical | Immutable GL (delete protection) | DevOps |
| **R9** | Duplicate invoice posted | Medium | Medium | Unique folio validation | API |
| **R10** | Backdated GL entries (fraud) | Low | High | Approval date enforcement | Comptable |

### 3.2 Control Objectives vs. Risks

**How Lexora Controls Mitigate Risks:**

```
CONTROL OBJECTIVE: GL entries must balance (D = C)
├─ Risk Mitigated: R2 (GL imbalance)
├─ Control: Database trigger tr_balance_check_insert
├─ How: On INSERT to ecritures_comptables_v2, verify SUM(debit) = SUM(credit)
├─ If fail: Reject entry, return error to user
├─ Evidence: Trigger logs, monthly balance verification report

CONTROL OBJECTIVE: Unauthorized GL must not post
├─ Risk Mitigated: R1 (unauthorized entry)
├─ Control: Approval workflow (Comptable creates, Directeur approves)
├─ How: GL entry status = 'draft' until Directeur clicks Approve
├─ If fail: Comptable cannot override; must escalate to Directeur
├─ Evidence: Approval history, audit trail (who approved, when)

CONTROL OBJECTIVE: GL cannot be deleted or modified post-close
├─ Risk Mitigated: R8 (GL deletion), R10 (backdating)
├─ Control: Immutability flag on posted GL entries
├─ How: Once posted, GL status = 'posted' and locked from editing
├─ If fail: Only workaround is reversal + correcting entry (both tracked)
├─ Evidence: GL history shows reversal + correction, complete audit trail

CONTROL OBJECTIVE: Invoice quantity & amount verified before GL posting
├─ Risk Mitigated: R3 (invoice not matched), R9 (duplicate)
├─ Control: Matching checklist (QA before posting)
├─ How: Comptable checks invoice details against GL entry template
├─ If fail: Comptable cannot post; must return to draft & correct
├─ Evidence: Invoice status (draft, matched, posted), matching report
```

---

## 4. CONTROL ACTIVITIES

### 4.1 GL Entry Controls

**Control: GL Entry Validation on Creation**

```
When Comptable creates GL entry (e.g., Customer invoice):
├─ Input: Facture #2026-0001, Amount 50,000 MUR
├─ System triggers GL generation (createEcrituresForFacture):
│  ├─ Generate 3 lines:
│  │  ├─ Debit: 4210 (AR) 50,000
│  │  ├─ Credit: 706 (Revenue) 43,478 (excl VAT)
│  │  └─ Credit: 4412 (VAT payable) 6,522 (15%)
│  │
│  ├─ Validation checks:
│  │  ├─ Debit total = 50,000
│  │  ├─ Credit total = 43,478 + 6,522 = 50,000 ✓
│  │  ├─ Account codes exist (4210, 706, 4412)? ✓
│  │  ├─ Amounts > 0? ✓
│  │  ├─ GL code not duplicate (ref_folio = "INV-2026-0001")? ✓
│  │  └─ Customer societe_id valid? ✓
│  │
│  └─ Status: draft (not yet posted to GL)
│
├─ Comptable reviews: GL preview before approval
└─ Comptable submits for approval
   └─ Email sent to Directeur: "New invoice INV-2026-0001 pending approval"
```

**Control: GL Balance Enforcement**

```
Database trigger (tr_balance_check_insert):
ON INSERT INTO ecritures_comptables_v2
BEGIN
  -- Calculate total debit & credit for this GL entry
  SELECT SUM(montant_debit) as total_debit,
         SUM(montant_credit) as total_credit
  FROM ecritures_comptables_v2
  WHERE ref_folio = NEW.ref_folio;
  
  -- Must balance exactly
  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'GL imbalance: Debit MUR %s <> Credit MUR %s',
                    total_debit, total_credit;
  END IF;
END;
```

**Impact**: Prevents any GL entry that doesn't balance; error returned immediately

### 4.2 Invoice Controls

**Control: Invoice-to-GL Matching**

```
Comptable processes Customer Invoice #2026-0001:

Step 1: Create Invoice (Comptable)
├─ Input: Invoice details (date, customer, amount, line items)
├─ System: Assign invoice status = 'draft'
└─ Comptable: Attach PDF & supporting docs

Step 2: Generate GL (System)
├─ Automatic GL posting rules (R01-R06):
│  └─ Customer Invoice → 4210 AR / 706 Revenue / 4412 VAT
├─ GL entries created with status = 'draft'
└─ Linked via ref_folio = "INV-2026-0001"

Step 3: Comptable Reviews
├─ Check: Invoice amount = GL debit?
├─ Check: VAT calculation correct?
├─ Check: GL accounts appropriate?
└─ If error: Return to draft, edit, resubmit

Step 4: Directeur Approves
├─ Review: Invoice matches supporting documents?
├─ Review: Customer is valid? Amount reasonable?
├─ Approve: Click "Approve" button
├─ System: GL status changes to 'posted'
└─ Email: Comptable notified "Invoice approved, GL posted"

Step 5: Bank Payment Received (later, e.g., June 5)
├─ Bank transaction imported (CSV or manual)
├─ Amount: 50,000 MUR from Customer XYZ
├─ System detects: Matches Invoice #2026-0001 (same amount, customer)
├─ Auto-matching: Creates lettrage (matching code = "INV-2026-0001-P1")
├─ GL posting: 2 additional lines
│  ├─ Debit: 5121 (Bank account) 50,000
│  └─ Credit: 4210 (AR) 50,000
└─ AR now fully matched (lifecycle complete)

Audit trail shows:
├─ Invoice created: 2026-05-20 10:15 by comptable@company.mu
├─ GL posted: 2026-05-20 14:00 (auto, approved by directeur@company.mu)
├─ Payment received: 2026-06-05 09:30 (bank import)
├─ Matched & closed: 2026-06-05 10:00 by bank_officer@company.mu
└─ All via system audit log (immutable record)
```

**Control: Duplicate Invoice Prevention**

```
Validation on Invoice Creation:
├─ Check: ref_folio (internal reference) = unique
├─ Check: Supplier Invoice # + Supplier ID = unique
│  └─ Prevents re-posting same supplier invoice twice
│
├─ If duplicate detected:
│  └─ System error: "Invoice AMZ-001 from Supplier XYZ already exists"
│     └─ Comptable must use different reference or contact system admin
│
└─ Unique index on table: (societe_id, invoice_type, supplier_id, invoice_number)
```

### 4.3 Bank Reconciliation Controls

**Control: Monthly Bank Reconciliation Procedure**

```
Month-end (e.g., May 31, 2026):

Step 1: Import Bank Statement (Bank Officer)
├─ Download CSV from bank: 15 transactions in May
├─ Upload to Lexora: Bank account 5121 (MCB)
├─ System: Extract transactions + auto-classify (R1-R6 rules)
└─ Status: Unreconciled (15 of 15 unmatched)

Step 2: Match Transactions to GL (System + Manual)
├─ Auto-matching (Automatic):
│  ├─ Salary payment -200,000: Matches GL entry 6200 ✓
│  ├─ Invoice payment +50,000: Matches Invoice INV-2026-0001 ✓
│  ├─ Electric bill -5,000: No match found
│  └─ Result: 13 of 15 auto-matched
│
├─ Manual matching (Bank Officer):
│  ├─ Electric bill -5,000: Create GL entry (6210 Utilities)
│  ├─ Unknown receipt +7,500: Classify as unidentified (5800 Suspense)
│  └─ Result: 15 of 15 matched

Step 3: Reconciliation Sign-off (Directeur)
├─ Review: All 15 transactions accounted for?
├─ Check: GL balance = Bank statement balance?
│  └─ Bank says: 1,000,000 MUR
│  └─ GL says: 1,000,000 MUR ✓
│
├─ Approve: Click "Sign-off" button
├─ System: Status = 'reconciled'
└─ Email: Comptable notified "Bank reconciliation approved"

Audit Trail:
├─ 13 auto-matches (system, timestamp)
├─ 2 manual matches (Bank Officer, timestamp, reason)
├─ 1 sign-off (Directeur, timestamp)
└─ All changes immutable (cannot be reversed after sign-off)
```

**Control: Outstanding Check Tracking**

```
Outstanding Checks (Check 001, not yet cleared):
├─ Posted GL entry: Debit 6100 (Expense), Credit 4020 (AP)
├─ Check issued: 2026-05-15 for MUR 25,000
├─ Bank statement: Check 001 NOT yet cleared (May 31)
├─ System: Marks as "outstanding" (not reconciled)
│
├─ Follow-up procedure:
│  ├─ After 30 days: Bank Officer reviews outstanding
│  ├─ If still outstanding: Contact payee (may be lost check)
│  └─ If lost: Issue replacement check + reverse original
│
└─ Safeguard: Prevents under-statement of GL balance
```

### 4.4 Payroll Controls

**Control: Salary Calculation Verification**

```
When HR posts monthly payroll (e.g., May 2026):

Payroll Processing:
├─ Input: Employee master file
│  ├─ Name: John Doe
│  ├─ Gross salary: 50,000 MUR/month
│  ├─ Tax ID: 12345678
│  ├─ Bank account: 123456789
│  └─ Deductions: PAYE tax, CSG, NSF (MRA rates for 2026)
│
├─ Calculation (Lexora system):
│  ├─ Gross: 50,000
│  ├─ PAYE withholding: 6,000 (per MRA barème 2026)
│  ├─ CSG: 500 (1% of gross)
│  ├─ NSF: 300 (0.6% of gross)
│  ├─ Deductions total: 6,800
│  └─ Net salary: 43,200
│
├─ GL posting (automatic):
│  ├─ Debit: 6200 (Salaries expense) 50,000
│  ├─ Credit: 4420 (PAYE withheld) 6,000
│  ├─ Credit: 4421 (CSG withheld) 500
│  ├─ Credit: 4430-4441 (NSF) 300
│  ├─ Credit: 4500 (Net salaries payable) 43,200
│  └─ Total: Debit 50,000 = Credit 50,000 ✓
│
├─ Validation:
│  ├─ PAYE rate correct for 2026? ✓
│  ├─ CSG calculation correct (1% of gross)? ✓
│  ├─ All employees processed? ✓
│  └─ Total payroll + taxes not > budget? ✓
│
├─ CFO Review & Approval:
│  ├─ Does total salary match budget?
│  ├─ Any unusual variances (>10% vs last month)?
│  ├─ All employees present in payroll?
│  └─ Approve: GL posted, payslips generated
│
└─ MRA Compliance:
   ├─ PAYE withholding tracked (monthly)
   ├─ CSG/NSF tracked (employer + employee)
   ├─ Declarations filed with MRA by deadline
   └─ Audit trail: Salary → GL → PAYE → MRA filing
```

**Control: Employee Master Data Integrity**

```
Employee master file maintained:
├─ Data: Name, ID, salary, tax ID, bank account
├─ Changes: Logged with approvals
│  └─ Salary increase >20% requires CFO approval
│  └─ Bank account change requires HR + Directeur approval
│
├─ Annual reconciliation:
│  └─ Payroll department reconciles master file to PAYE filings
│  └─ Any discrepancies investigated & corrected
│
└─ Audit trail:
   └─ All changes logged (who, what, when)
   └─ Retained for 7 years
```

---

## 5. INFORMATION & COMMUNICATION

### 5.1 Audit Trail & Documentation

**What is Audited:**

```
GL Entry Created (ecritures_comptables_v2):
├─ Created by: comptable@company.mu
├─ Created at: 2026-05-20 10:15:30 UTC
├─ Journal code: VTE (Sales)
├─ Amount: 50,000 MUR
├─ Reference: INV-2026-0001
└─ Supporting doc: PDF invoice attached (blob storage)

GL Entry Approved (status changes):
├─ Approved by: directeur@company.mu
├─ Approved at: 2026-05-20 14:00:00 UTC
├─ Status: posted
└─ Audit log entry: "GL entry ECC-001 posted"

GL Entry Later Matched (lettrage):
├─ Matched by: bank_officer@company.mu
├─ Matched at: 2026-06-05 10:00:00 UTC
├─ Matched to: Bank transaction BNQ-0001
├─ Lettrage code: INV-2026-0001-P1
└─ Audit log: "AR matched, GL closed"

All history is immutable (read-only after creation)
```

**Audit Trail Retention:**

| Record Type | Retention Period | Reason | Location |
|---|---|---|---|
| **GL entries** | 7 years | MRA legal requirement | ecritures_comptables_v2 |
| **Audit logs** | 7 years | Compliance & security | audit_logs table |
| **Bank transactions** | 7 years | MRA requirement | transactions_bancaires |
| **Invoices** | 7 years | Companies Act 2001 | factures |
| **Payroll records** | 5 years | Labor law & PAYE | bulletins_paie |
| **Access logs (IP)** | 2 years | Security incident response | system_logs |

### 5.2 Approval Workflow Documentation

**All Approval Workflows Are Documented:**

**Workflow 1: GL Entry Approval (amount >10,000 MUR)**

```
Comptable: Creates GL entry (2026-05-20 10:15)
  ↓
Email notification sent to Directeur: "New GL entry: INV-2026-0001, 50,000 MUR"
  ↓
Directeur: Reviews GL entry preview (2026-05-20 14:00)
  │
  ├─ Approve: GL status = posted, GL locked from editing
  │
  └─ Reject: GL status = rejected, Comptable notified, can edit & resubmit
  ↓
Comptable: Notified of approval/rejection (email)
  ↓
Complete (audit trail created automatically)
```

**Workflow 2: Invoice Approval (any amount)**

```
Comptable: Creates invoice + GL (2026-05-20 10:15)
  ↓
Directeur: Reviews invoice details & supporting doc (2026-05-20 15:00)
  │
  ├─ Approve: Invoice status = approved, GL posted, payable to supplier
  │
  └─ Return: Invoice status = draft, Comptable must correct & resubmit
  ↓
Comptable: Processes approval (email notification)
  ↓
Complete (audit trail created)
```

**Workflow 3: Bank Reconciliation Approval**

```
Bank Officer: Matches all May transactions (2026-05-31 16:00)
  ↓
Directeur: Reviews reconciliation (2026-06-01 09:00)
  │
  ├─ Sign-off: Bank reconciliation status = reconciled, GL locked
  │           (Cannot modify GL for May after sign-off)
  │
  └─ Request changes: Comptable must correct, resubmit
  ↓
Complete (reconciliation immutable)
```

### 5.3 Monthly Close Documentation

**Month-end Close Checklist** (enforced in system):

```
May Month-end Close Procedure (by June 15):

Task 1: GL Verification (Comptable) - Due June 1
├─ [ ] Trial balance generated (all accounts)
├─ [ ] Debit total = Credit total
├─ [ ] No "suspense" accounts with balances
├─ [ ] All in-month GL entries posted
└─ Approval: Comptable sign-off

Task 2: Receivables Aging (Comptable) - Due June 2
├─ [ ] All customer invoices aged
├─ [ ] Collection follow-up for 30+ day invoices
├─ [ ] Doubtful debts reserve assessed
├─ [ ] Aged AR report attached
└─ Approval: Comptable sign-off

Task 3: Bank Reconciliation (Bank Officer) - Due June 3
├─ [ ] Bank statement imported
├─ [ ] All transactions matched to GL
├─ [ ] Outstanding items tracked
├─ [ ] Bank balance = GL balance
└─ Approval: Directeur sign-off

Task 4: Payroll & Tax Accruals (HR) - Due June 4
├─ [ ] Salary calculation reviewed
├─ [ ] PAYE/CSG/NSF withholdings calculated
├─ [ ] GL posting verified
├─ [ ] Monthly tax accrual recorded
└─ Approval: CFO sign-off

Task 5: Accruals & Adjustments (Comptable) - Due June 5
├─ [ ] Utility bills accrued (if not yet received)
├─ [ ] Depreciation calculated & posted
├─ [ ] Deferred expenses/revenues adjusted
├─ [ ] Warranty provisions assessed
└─ Approval: Comptable sign-off

Task 6: Final Review & Close (Directeur) - Due June 7
├─ [ ] All tasks above completed?
├─ [ ] Financial statements prepared (P&L, Balance Sheet, CF)
├─ [ ] Any discrepancies resolved?
├─ [ ] Month closed (GL status = closed, no further edits)
└─ Approval: Directeur sign-off + date stamp

If any task incomplete: Month cannot close, escalation to Directeur
```

**System Enforcement:**
- Dashboard shows close status (%)
- Tasks marked complete/incomplete
- Overdue tasks flagged in red
- Cannot mark month "closed" until all tasks done
- Audit trail logs all completions & approvals

---

## 6. MONITORING & CONTINUOUS IMPROVEMENT

### 6.1 Quarterly Control Assessments

**Lexora conducts quarterly assessments:**

| Quarter | Assessment | Owner | Evidence |
|---|---|---|---|
| **Q1 (Jan-Mar)** | GL control effectiveness | CFO | Testing report |
| **Q2 (Apr-Jun)** | Segregation of duties compliance | Compliance Officer | SOD matrix audit |
| **Q3 (Jul-Sep)** | Bank reconciliation accuracy | Bank Officer | Rec accuracy report |
| **Q4 (Oct-Dec)** | Payroll & tax compliance | HR/Finance | PAYE filing accuracy |

**Assessment Procedure:**

```
Q1 Assessment: GL Control Effectiveness
├─ Sample size: 50 GL entries (random selection)
├─ Tests:
│  ├─ [ ] Entry balanced (debit = credit)?
│  ├─ [ ] Properly approved by authorized person?
│  ├─ [ ] Supporting documentation attached?
│  ├─ [ ] Properly classified (correct account)?
│  └─ [ ] Audit trail complete?
│
├─ Findings:
│  ├─ Control operating effectively if 95%+ pass
│  ├─ Deficiency noted if <95% pass
│  └─ Root cause analysis for failures
│
└─ Remediation:
   ├─ If systematic issue: Retrain Comptable
   ├─ If system issue: Fix in next release
   └─ Re-test in next quarter
```

### 6.2 Exception Reporting

**Monthly reports generated automatically:**

| Report | Purpose | Frequency | Threshold |
|---|---|---|---|
| **Unmatched Items** | GL entries not matched to bank | Weekly | >10 items |
| **Aged Invoices** | Invoices 30+ days unpaid | Weekly | >5 invoices |
| **GL Exceptions** | Failed validations, errors | Daily | Any error |
| **User Access Changes** | New users, role changes | Monthly | Any change |
| **Overdue Close Tasks** | Month-end tasks not completed | Weekly | Any overdue |

**Escalation Procedure:**

```
If report threshold exceeded:
├─ Email notification to Directeur (automatic)
├─ Dashboard alert (red flag)
├─ Investigation required: Root cause analysis
├─ Remediation plan documented
├─ Re-test after fix
└─ Quarterly review of all exceptions (metrics)
```

### 6.3 Continuous Improvement

**Control enhancement process:**

```
Step 1: Identify Issue
├─ From: Audit findings, user feedback, control testing
└─ Example: "Comptables often miss doubtful debts provision"

Step 2: Root Cause Analysis
├─ Why is this happening?
└─ Example: "Doubtful debts worksheet is manual, easy to forget"

Step 3: Propose Control Enhancement
├─ What system change would help?
└─ Example: "Add automatic doubtful debts calculation in month-end checklist"

Step 4: Implement
├─ Develop feature (or process improvement)
└─ Example: "Add checkbox in close procedure that calculates aging-based reserve"

Step 5: Test & Monitor
├─ Verify control is effective
└─ Example: "Re-test in next quarter; 100% should complete doubtful debts task"
```

---

## 7. SEGREGATION OF DUTIES MATRIX

### 7.1 SOD Matrix (Who Can Do What?)

**Role Access Rights:**

| Activity | Comptable | Directeur | HR Manager | Bank Officer | Auditor |
|---|---|---|---|---|---|
| **Create GL entry** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Approve GL entry** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Post GL to ledger** | Auto (via system) | Auto (via system) | N/A | N/A | N/A |
| **Delete GL entry** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Modify posted GL** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Create invoice** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Approve invoice** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Record payment** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Reconcile bank** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Sign-off bank rec** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Create employee** | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Approve payroll** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Process salary** | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Approve close** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **View GL reports** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Export data** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Add/remove users** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Change access levels** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **View audit logs** | ❌ | ✅ | ❌ | ❌ | ✅ (read-only) |

**Legend:**
- ✅ = Allowed
- ❌ = Not allowed (segregation of duties)
- Auto = System handles automatically (user cannot override)
- N/A = Not applicable to this role

### 7.2 Conflict of Interest Scenarios

**Scenarios Prevented by SOD:**

**Scenario 1: Comptable Approving Own Entry**
```
Risk: Comptable posts false GL entry to inflate revenue
Control: Comptable CANNOT approve own entries (role-based in system)
        Directeur must review & approve
Enforcement: Dropdown list of approvers = all Directeur (not Comptable)
```

**Scenario 2: Comptable Recording Own Salary**
```
Risk: Comptable inflates own salary in payroll
Control: HR Manager processes payroll, Directeur approves
        Comptable has no role in salary processing
Enforcement: Payroll module locked to HR Manager + Directeur roles only
```

**Scenario 3: Bank Officer Closing Own Reconciliation**
```
Risk: Bank Officer hides discrepancies in reconciliation
Control: Bank Officer matches transactions, Directeur signs off
        Bank Officer cannot mark reconciliation as "closed"
Enforcement: Sign-off button only available to Directeur role
```

---

## 8. AUTHORIZATION LEVELS

### 8.1 Transaction Authorization Limits

**Who must approve what, based on amount:**

| Amount Range | Transaction Type | Approver | Escalation |
|---|---|---|---|
| **< 10,000 MUR** | Invoice, GL entry | Comptable (self-approve) | Optional Directeur review |
| **10,000 - 50,000 MUR** | Invoice, GL entry | Directeur approval required | Escalate if variance >20% |
| **50,000 - 500,000 MUR** | Large transaction | Directeur + CFO approval | CFO signature required |
| **> 500,000 MUR** | Major transaction | Board-level approval | CEO sign-off required |

**How it works in system:**

```
When Comptable submits GL entry for 75,000 MUR:
├─ System detects: Amount > 50,000 (Tier 3)
├─ Workflow: Requires Directeur + CFO approval (both required)
├─ Notifications sent to: Directeur & CFO (email)
├─ Cannot be posted until BOTH approve
├─ If one rejects: Returns to Comptable for revision
└─ Audit trail records: Both approvers, timestamps
```

### 8.2 Approval Authority Documentation

**Approval Authority Matrix:**

```
Directeur (Finance Director):
├─ Approve GL entries up to 50,000 MUR (no escalation)
├─ Approve GL entries 50,000-500,000 MUR (with CFO)
├─ Sign-off monthly bank reconciliation
├─ Approve month-end close
├─ Assign/revoke user access
└─ Escalate to CEO for transactions >500,000 MUR

CFO (Chief Financial Officer):
├─ Co-approve GL entries > 50,000 MUR (with Directeur)
├─ Approve payroll (all amounts)
├─ Approve accruals & adjustments
├─ Approve large vendor payments (>100,000 MUR)
└─ Escalate to Board for material items

Comptable (Accountant):
├─ Create GL entries up to 10,000 MUR (self-approve)
├─ Create invoices (all amounts)
├─ Create purchase orders (subject to approval)
├─ Perform bank reconciliation (detailed matching)
└─ Cannot: Approve, override controls, delete

HR Manager:
├─ Create employee master records
├─ Process payroll (salary calculation & GL posting)
├─ Report on PAYE/CSG/NSF
└─ Cannot: Approve (Directeur/CFO approves payroll)

Auditor (External):
├─ View all GL entries (read-only)
├─ View all invoices (read-only)
├─ View audit logs (read-only)
└─ Cannot: Modify, approve, delete anything
```

---

## 9. APPROVAL WORKFLOWS

### 9.1 Invoice Approval Workflow

**Complete workflow for Customer invoice:**

```
PHASE 1: CREATION (Comptable, 10:00 AM)
├─ Comptable receives invoice from customer
├─ Enters: Invoice #, date, amount, customer name
├─ System: Validates amount, customer exists, reference unique
├─ Status: draft (not yet posted to GL)
└─ Action: Submit for approval

PHASE 2: REVIEW (Directeur, 2:00 PM)
├─ Directeur receives email notification
├─ Opens invoice detail: Amount 50,000, Customer XYZ, date 2026-05-20
├─ Reviews: Validates business (service already received?)
├─ Checks: Amount matches PO or contract?
├─ Attaches: Approval signature (electronic)
└─ Action: Approve or Return to draft

PHASE 3: POSTING (System, automatic, 2:05 PM)
├─ Approval triggered GL posting:
│  ├─ Line 1: Debit 4210 (AR) 50,000
│  ├─ Line 2: Credit 706 (Revenue) 43,478
│  └─ Line 3: Credit 4412 (VAT) 6,522
├─ Status: posted (locked from editing)
├─ Audit log: "Invoice approved & GL posted"
└─ Email: Comptable notified

PHASE 4: MATCHING (Bank Officer, June 5)
├─ Payment received: 50,000 from Customer XYZ
├─ System: Auto-matches to Invoice #2026-0001
├─ Lettrage created: Code "INV-2026-0001-P1"
├─ GL posting (auto):
│  ├─ Debit: 5121 (Bank) 50,000
│  └─ Credit: 4210 (AR) 50,000
├─ Status: matched & closed
└─ Email: Comptable notified

PHASE 5: SIGN-OFF (Directeur, June 7)
├─ Bank reconciliation for June
├─ All invoices matched to bank deposits
├─ Directeur reviews & signs-off
└─ Status: month closed (GL immutable)

Timeline summary:
├─ May 20: Invoice received & approved
├─ May 20: GL posted (2 minutes)
├─ June 5: Payment received
├─ June 5: Auto-matched
├─ June 7: Month closed
└─ Entire lifecycle tracked in audit trail
```

### 9.2 Payroll Approval Workflow

**Complete workflow for monthly salary:**

```
PHASE 1: PREPARATION (HR Manager, May 15)
├─ HR pulls employee master file:
│  ├─ 5 employees
│  ├─ Total gross salary: 250,000 MUR
│  └─ Changes: Employee 3 got 5% raise (approved by Directeur)
├─ System: Calculates net salary & withholdings
│  ├─ PAYE: 30,000 (per MRA barème 2026)
│  ├─ CSG: 2,500 (1% of gross)
│  ├─ NSF: 1,500 (0.6% of gross)
│  └─ Net: 216,000
├─ GL posting (draft):
│  ├─ Debit: 6200 (Salaries) 250,000
│  ├─ Credit: 4420 (PAYE) 30,000
│  ├─ Credit: 4421 (CSG) 2,500
│  ├─ Credit: 4430-4441 (NSF) 1,500
│  └─ Credit: 4500 (Net payable) 216,000
└─ Generates: Payslips for each employee

PHASE 2: REVIEW (CFO, May 25)
├─ CFO receives: Payroll summary + GL entries
├─ Checks:
│  ├─ Total payroll vs. budget (is it reasonable?)
│  ├─ Any employee with unusual raise? (Employee 3: approved ✓)
│  ├─ PAYE calculations correct? (5-point check)
│  ├─ CSG/NSF rates correct? (1% + 0.6% ✓)
│  └─ GL entries balance? (Debit 250,000 = Credit 250,000 ✓)
├─ Approve: Payroll GL posted
└─ Email: HR notified

PHASE 3: DISBURSEMENT (Finance, May 28)
├─ Finance prepares salary transfers:
│  ├─ Employee 1: 43,200 to bank account ABC
│  ├─ Employee 2: 42,800 to bank account DEF
│  ├─ ... (5 employees total)
│  └─ Total outflow: 216,000
├─ Posts GL:
│  ├─ Debit: 4500 (Net payable) 216,000
│  └─ Credit: 5121 (Bank) 216,000
├─ Executes: ACH transfers to employee accounts
└─ Status: Salary paid

PHASE 4: MRA FILING (Comptable, June 15)
├─ Month closing procedures
├─ Prepares PAYE declaration:
│  ├─ PAYE withheld: 30,000
│  ├─ Employees: 5
│  ├─ Period: May 2026
│  └─ Due date: June 30, 2026
├─ Files with MRA (online)
├─ Saves filing confirmation
└─ Audit trail: Filing date & status

PHASE 5: RECONCILIATION (Accounting, End of Year)
├─ Annual PAYE reconciliation:
│  ├─ Compare: Monthly PAYE filings vs. GL account 4420
│  ├─ Verify: Total PAYE withheld = amount paid to MRA
│  ├─ Check: No discrepancies
│  └─ Document: Reconciliation report signed
└─ Audit trail: Annual reconciliation certification

Timeline summary:
├─ May 15: HR prepares payroll (GL draft)
├─ May 25: CFO approves (GL posted)
├─ May 28: Finance disburses salary
├─ June 15: PAYE declaration filed
├─ End of year: Annual reconciliation
└─ Entire lifecycle tracked & auditable
```

---

## 10. CONTROL DEFICIENCIES & REMEDIATION

### 10.1 Current Control Gaps

**Known Limitations (As of May 2026):**

| Gap | Severity | Impact | Remediation Timeline |
|---|---|---|---|
| **Audit_logs table not fully implemented** | High | Cannot prove "who changed what when" | Q3 2026 (Phase 2) |
| **RLS policies not enforced** | High | Theoretical multi-tenant isolation only | Q2 2026 (Phase 1) |
| **Manual approval workflows** | Medium | No system enforcement of segregation | Q3 2026 (Phase 2) |
| **No change history on GL** | Medium | Modified GL entries not fully tracked | Q3 2026 (Phase 2) |
| **Export validation reports missing** | Medium | Cannot verify "all invoices recorded to GL" | Q4 2026 (Phase 3) |

### 10.2 Remediation Plan

**Phase 1 (Q2 2026): Critical RLS Fixes**
```
Objective: Enforce multi-tenant isolation at database level
├─ Task 1: Audit all 39 RLS policies for societe_id checks
├─ Task 2: Fix any USING (true) statements
├─ Task 3: Add missing RLS to notifications, simulations
├─ Task 4: Test with multiple customers in same environment
└─ Target completion: June 30, 2026

Evidence: RLS policy audit report + test results
```

**Phase 2 (Q3 2026): Audit Trail & Approval System**
```
Objective: Track all changes with user accountability
├─ Task 1: Create audit_logs table (log all GL changes)
├─ Task 2: Build API endpoints (/api/audit/trail)
├─ Task 3: Implement automatic approval workflow (status changes)
├─ Task 4: Add change history to GL display
└─ Target completion: September 30, 2026

Evidence: Audit trail export + sample GL change history
```

**Phase 3 (Q4 2026): Data Validation & Completeness**
```
Objective: Verify 100% of invoices recorded to GL
├─ Task 1: Build invoice-to-GL completeness report
├─ Task 2: Add quarterly validation procedures
├─ Task 3: Document exceptions (non-posting invoices)
├─ Task 4: Create auditor validation dashboard
└─ Target completion: December 31, 2026

Evidence: Quarterly completeness audit report
```

---

## APPENDIX A — SECURITY & COMPLIANCE MIGRATIONS (Roadmap V5 9/10)

Seven Supabase migrations were deployed (May 2026) to harden the
control framework. Each migration is referenced below with its
corresponding control objective. SQL files live in
`supabase/migrations/`.

| # | Migration file | Control objective | Linked control |
|---|----------------|-------------------|----------------|
| 413 | `413_password_reset_audit.sql` | Immutable log of every password reset (who, target, IP, timestamp) | SEC-001 / SOD User Access |
| 414 | `414_revoke_exec_sql_security_hardening.sql` | DROP of the `exec_sql` Postgres function (arbitrary SQL exec removed) | SEC-002 / Access Control |
| 415 A→D | `415_fix_rls_policies_phase2_part{A,B,C,D}.sql` | New RLS helpers `user_has_societe_access` + `user_has_employe_access`; all financial & HR tables migrated | SEC-003 / Segregation of Data |
| 416 | `416_telegram_hmac_nonces.sql` | HMAC-SHA256 + nonce table for all `/api/telegram/**` callbacks (replay-attack protection) | SEC-005 / Integration Controls |
| 417 | `417_intercompany_eliminations.sql` | Audit-grade table for intercompany elimination journals (consolidation IFRS 10) | Control Activity GL |
| 418 | `418_sft_detect_transactions_v2.sql` | Improved suspicious-financial-transaction detection (bank rec quality) | Monitoring / Bank Rec |
| 419 | `419_mra_submit_ack.sql` | Persistent acknowledgement trail for MRA online submissions (PAYE/CSG/TDS) | Tax Compliance |
| 420 | `420_rh_settings_tables.sql` | Per-societe RH settings (overtime caps, leave defaults) backing payroll calculation controls | Payroll Controls |

**Audit evidence path:** the migration files themselves are the
auditable source of truth (versioned in git, deployed via Supabase
`apply_migration`). For each control test, reference the migration
number above plus the corresponding section of this document.

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial document | CFO |
| 1.1 | 2026-05-24 | Appendix A — migrations 413→420 (roadmap V5 9/10) | CFO |

**Approval:**

- [ ] Lexora Board
- [ ] External Auditor
- [ ] Big 4 Compliance Review

**Next Review**: May 22, 2027 (or upon major process changes)

---

**END OF INTERNAL CONTROL DOCUMENTATION**

*For questions or control testing requests, contact: compliance@lexora.mu*
