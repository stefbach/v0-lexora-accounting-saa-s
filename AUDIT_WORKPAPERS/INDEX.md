# AUDIT WORKPAPERS - MASTER INDEX
## Lexora SaaS Accounting Platform
**Client:** DDS (Des Dunes Sarl) + OCC (Obesity Care Clinic)  
**Audit Period:** Year Ended 31 December 2025  
**Prepared By:** Lexora Finance & Compliance Team  
**Date Prepared:** 22 May 2026  
**Review Status:** [To be completed by Big 4 Auditor]

---

## DOCUMENT ORGANIZATION & CROSS-REFERENCES

### Reference Numbering System
- **WP 1.x.x** = General Information Section
- **WP 2.x.x** = Accounting Controls Section
- **WP 3.x.x** = GL Testing Section
- **WP 4.x.x** = Bank Reconciliation Section
- **WP 5.x.x** = Invoices Section
- **WP 6.x.x** = Payroll Section
- **WP 7.x.x** = Intercompany Section
- **WP 8.x.x** = Security Section
- **WP 9.x.x** = Audit Trail Section

### Directory Structure

```
AUDIT_WORKPAPERS/
├── INDEX.md (THIS FILE - Master navigation)
├── SIGNIFICANT_ITEMS_SUMMARY.md (Exceptions & findings)
├── AUDIT_PROCEDURES_LOG.xlsx (Sign-offs & procedures performed)
├── MANAGEMENT_REPRESENTATION_LETTER_DRAFT.docx (CFO sign-off template)
├── QA_CHECKLIST.md (Audit manager sign-off)
│
├── 1_GENERAL/ (WP 1.x.x)
│   ├── ORGANIZATION_CHART.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── KEY_PERSONNEL.md
│   └── CHANGE_LOG.md
│
├── 2_ACCOUNTING_CONTROLS/ (WP 2.x.x)
│   ├── CHART_OF_ACCOUNTS.md
│   ├── CONTROL_PROCEDURES_MANUAL.md
│   ├── SOD_MATRIX.md
│   └── AUDIT_TRAIL_SETUP.md
│
├── 3_GL_TESTING/ (WP 3.x.x)
│   ├── GL_BALANCE_VERIFICATION.md
│   ├── ACCOUNT_RECONCILIATION.md
│   ├── DOUBLE_ENTRY_TESTS.md
│   └── PERIOD_CLOSE_PROCEDURES.md
│
├── 4_BANK_RECONCILIATION/ (WP 4.x.x)
│   ├── MONTHLY_RECONCILIATIONS.md
│   ├── OUTSTANDING_ITEMS.md
│   ├── LETTRAGE_VERIFICATION.md
│   └── CURRENCY_TESTING.md
│
├── 5_INVOICES/ (WP 5.x.x)
│   ├── INVOICE_REGISTER.md
│   ├── SAMPLE_50_GL_TRACEABILITY.md
│   ├── MRA_COMPLIANCE_CHECK.md
│   └── TAX_TREATMENT_TESTING.md
│
├── 6_PAYROLL/ (WP 6.x.x)
│   ├── PAYROLL_BULLETINS_24M.md
│   ├── CALCULATION_VERIFICATION_120S.md
│   ├── MRA_PAYE_COMPLIANCE.md
│   └── GL_POSTINGS.md
│
├── 7_INTERCOMPANY/ (WP 7.x.x)
│   ├── TRANSACTION_MAP.md
│   ├── 4411_4412_RECONCILIATION.md
│   ├── SETTLEMENTS.md
│   └── RELATED_PARTY_DISCLOSURE.md
│
├── 8_SECURITY/ (WP 8.x.x)
│   ├── USER_ACCESS_AUDIT.md
│   ├── ADMIN_CONTROLS.md
│   ├── RLS_VERIFICATION.md
│   └── ENCRYPTION_STATUS.md
│
└── 9_AUDIT_TRAIL/ (WP 9.x.x)
    ├── SAMPLE_GL_CHANGES.md
    ├── AUTHENTICATION_LOGS.md
    ├── API_ACCESS_LOG.md
    └── IMMUTABILITY_VERIFICATION.md
```

---

## QUICK NAVIGATION BY AUDIT AREA

### Financial Statement Assertions

| Assertion | Primary WP | Supporting WP | Reference |
|-----------|-----------|---------------|-----------|
| **Existence** | WP 3 - GL Testing | WP 5 - Invoices, WP 6 - Payroll | Verify all GL balances supported by source documents |
| **Completeness** | WP 3.2 - Account Reconciliation | WP 4, 5, 6 | All accounts reconciled; all transactions recorded |
| **Accuracy** | WP 3.3 - Double Entry Tests | WP 2 - Controls | All entries comply with COA; balanced entries |
| **Valuation** | WP 5.4, WP 6.3 - Tax Treatment | WP 2.2 - Control Procedures | Proper accounting treatment applied |
| **Cutoff** | WP 3.4 - Period Close | WP 4, 5, 6 | Transactions recorded in correct period |
| **Presentation** | WP 1 - System Architecture | All sections | Proper disclosure and classification |

### Key Account Testing Matrix

| Account | GL Code | Primary Evidence | WP Ref | Audit Procedure |
|---------|---------|------------------|--------|-----------------|
| **Bank Accounts** | 1000-1099 | Monthly reconciliations | WP 4.1 | Reconcile to bank statements; test 12 months |
| **Accounts Receivable** | 1200-1299 | Invoice register; aging | WP 5.1, 5.2 | Sample 50 invoices; test MRA compliance |
| **Inventory** | 1300-1399 | GL analysis | WP 3.2 | Account reconciliation & recalculation testing |
| **Fixed Assets** | 1400-1499 | FA register | WP 3.2 | Reconcile to GL; test depreciation |
| **Payables** | 2000-2099 | Invoice matching | WP 4.2 | Reconcile to subsequent payments |
| **Payroll Liabilities** | 2200-2299 | Payroll bulletins | WP 6.1 | 24-month sample; verify MRA withholding |
| **Intercompany** | 4411, 4412 | Settlement docs | WP 7.2 | Reconcile IC accounts; test settlements |
| **Revenue** | 7000-7999 | Invoice register | WP 5.1, 5.2 | Sample testing; VAT compliance |

---

## AUDIT PROCEDURES SUMMARY

**Total Procedures Planned:** 45+  
**Total Hours Estimated:** 120+  
**Evidence Pages:** 100+  

| Section | Procedure Count | Key Tests | Sign-off Link |
|---------|-----------------|-----------|---------------|
| 1 - General | 4 | Org chart, system review, personnel, changes | AUDIT_PROCEDURES_LOG.xlsx |
| 2 - Controls | 8 | COA review, control testing, SOD validation | AUDIT_PROCEDURES_LOG.xlsx |
| 3 - GL Testing | 12 | Balance verification, reconciliation, double-entry | AUDIT_PROCEDURES_LOG.xlsx |
| 4 - Bank Rec | 8 | Monthly reconciliations, lettrage, currency | AUDIT_PROCEDURES_LOG.xlsx |
| 5 - Invoices | 6 | Register review, sample testing, MRA check | AUDIT_PROCEDURES_LOG.xlsx |
| 6 - Payroll | 5 | 24-month analysis, calculation verification, compliance | AUDIT_PROCEDURES_LOG.xlsx |
| 7 - Intercompany | 4 | Transaction mapping, reconciliation, settlements | AUDIT_PROCEDURES_LOG.xlsx |
| 8 - Security | 5 | Access audit, RLS testing, encryption check | AUDIT_PROCEDURES_LOG.xlsx |
| 9 - Audit Trail | 4 | GL change sampling, auth logs, API access | AUDIT_PROCEDURES_LOG.xlsx |

---

## SIGNIFICANT ITEMS & EXCEPTIONS LOG

**See:** `/AUDIT_WORKPAPERS/SIGNIFICANT_ITEMS_SUMMARY.md`

- **Total Issues Found:** [To be populated during audit]
- **Critical Findings:** [To be populated]
- **High Priority Items:** [To be populated]
- **Low Priority / Informational:** [To be populated]

---

## CROSS-REFERENCE GUIDE

### From Big 4 CAATs Perspective
- **CAAT Import Ready:** All workpapers formatted for IDEA/ACL/Alteryx import
- **Data Lineage:** WP 3.2 and WP 5.2 show GL-to-source traceability
- **Testing Evidence:** Queries and test results embedded in relevant WP sections
- **Sign-offs:** AUDIT_PROCEDURES_LOG.xlsx tracks all procedure performers

### From Management Review Perspective
- **Control Effectiveness:** WP 2 documents all controls; results in SIGNIFICANT_ITEMS_SUMMARY.md
- **Remediation Items:** Linked to control procedures; tracked in QA_CHECKLIST.md
- **Subsequent Events:** To be addressed in MANAGEMENT_REPRESENTATION_LETTER_DRAFT.docx

### From Regulator Perspective
- **MRA Compliance:** WP 5.4 - Tax Treatment Testing; WP 6.3 - PAYE Compliance
- **Data Security:** WP 8 - Security section with RLS and encryption verification
- **Audit Trail:** WP 9 - Immutability and access controls

---

## SENSITIVE DATA HANDLING

**CRITICAL: No Sensitive Data in Workpapers**

The following items are explicitly EXCLUDED from all workpapers:
- API Keys or authentication credentials (redacted with [REDACTED])
- Employee personal information (SSN, bank details) - summarized only
- Customer PII - aggregate data only
- Password hashes or authentication tokens
- Detailed salary information (aggregate by department only)

**Redaction Mark:** `[REDACTED - SENSITIVE]`  
**Review:** QA_CHECKLIST.md includes sensitive data verification

---

## AUDIT TIMELINE & MILESTONES

| Phase | Weeks | Deliverable | Status |
|-------|-------|-------------|--------|
| **Preparation** | 1-2 | Remediate P1 findings | In Progress |
| **Evidence Compilation** | 3-4 | Historical data extraction; WP 1-2 | In Progress |
| **Control Testing** | 5-6 | WP 2-8 completion | Planned |
| **GL & Reconciliation** | 7-8 | WP 3-4 detailed testing | Planned |
| **Sampling & Testing** | 9-10 | WP 5-6 sample results | Planned (THIS PHASE) |
| **Audit Readiness** | 11-12 | Big 4 support; final sign-offs | Planned |

---

## QUALITY ASSURANCE & SIGN-OFFS

### Pre-Audit QA Sign-Off (Audit Manager)
**See:** `/AUDIT_WORKPAPERS/QA_CHECKLIST.md`

Confirms:
- [ ] All required workpapers present and complete
- [ ] No sensitive data exposed
- [ ] All workpapers readable and professional
- [ ] Cross-references accurate
- [ ] Evidence sufficient for Big 4 import

**Manager Name:** ___________________  
**Signature:** ___________________  
**Date:** ___________________

### Management Representation
**See:** `/AUDIT_WORKPAPERS/MANAGEMENT_REPRESENTATION_LETTER_DRAFT.docx`

CFO/CEO certifies:
- All transactions recorded
- All liabilities disclosed
- No fraud or irregularities
- No subsequent events

---

## CONTACT & SUPPORT

**Lexora Audit Coordinator:** [Finance Manager Name]  
**Email:** [contact@lexora.mu]  
**Phone:** [+230 XXX XXXX]  

**For Big 4 Auditor Questions:**
- Workpapers organization: See this INDEX.md
- Technical access: See WP 1.2 - System Architecture
- Control walkthroughs: See WP 2.2 - Control Procedures Manual
- Data extraction: See relevant WP section for underlying SQL queries

---

## DOCUMENT CONTROL

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 22-May-2026 | Lexora Finance | Initial workpapers compilation |
| 1.1 | [Date] | [Name] | [Changes] |
| 2.0 | [Date] | Big 4 Lead | Audit review sign-off |

---

**END OF INDEX**

*This master index is a living document. Updates made during the audit should be tracked in AUDIT_PROCEDURES_LOG.xlsx and summarized in this INDEX with each version increment.*
