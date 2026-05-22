# LEXORA FINANCIAL CONTROLS DOCUMENTATION
## Complete Index & Navigation Guide

**Document Set:** Comprehensive 40+ page manual for Big 4 auditor review  
**Date:** 22 May 2026  
**Status:** PHASE 3 — COMPLETE AND AUDIT READY  

---

## PRIMARY DOCUMENT

### CONTROLES_COMPTABLES_LEXORA.md (Main Manual)
**Size:** 45+ pages (3,209 lines)  
**Sections:** 8 complete  
**Target:** Big 4 auditors, compliance teams  

#### Navigation by Section

| Section | Pages | Topic | Key Controls |
|---------|-------|-------|--------------|
| **1** | 5 | System Architecture & Access Control | RLS, Multi-tenancy, Role matrix |
| **2** | 4 | Chart of Accounts & IFRS/MRA | PCM, Account codes, TVA, PAYE |
| **3** | 6 | GL Entry Creation & Posting | R1 (double-entry), Validation, Worked example |
| **4** | 6 | Bank Reconciliation | Monthly workflow, Auto-matching, Lettrage, R7 |
| **5** | 6 | Payroll Calculation & GL | Salary formula, Deductions, Charges patronales |
| **6** | 5 | SOD & Approval Workflows | SOD matrix, Amount limits, Approval chain |
| **7** | 3 | Audit Logging & Audit Trail | Immutable log, 13 event types, 7-year retention |
| **Appendices** | 5 | MRA Checklist, Rules, Control Frequency | Compliance, R1-R7, Evidence |

---

## QUICK REFERENCE GUIDE

### For Auditors

**Goal:** Understand Lexora's financial control environment  
**Time needed:** 2-3 hours reading + 2-4 hours system testing  
**Start with:**
1. Executive Summary (CONTROLES_COMPTABLES_SUMMARY.md)
2. Section 1 (System Architecture)
3. Section 4 (Bank Reconciliation — most familiar)
4. Section 7 (Audit Trail — verify completeness)

**Then test:**
- Execute sample transactions per Section 5 examples
- Query audit trail for sample period
- Verify SOD approval workflow

---

### For Compliance Officers

**Goal:** Ensure MRA compliance across all transactions  
**Start with:**
1. Section 2 (Chart of Accounts — all MRA accounts)
2. Section 5 (Payroll — deduction rules)
3. Appendix A (MRA Compliance Checklist)
4. Appendix C (Control Frequency — when to review)

**Monthly activities:**
- Verify PAYE/CSG/NSF postings vs. employment records
- Check TVA 4457/4456 balances vs. filings
- Review payroll GL entries per Section 5 example
- Sign-off on bank reconciliation (per Section 4)

---

### For Finance/Accounting Teams

**Goal:** Understand daily operational controls  
**Start with:**
1. Section 3 (GL Entry Creation — daily workflow)
2. Section 4 (Bank Reconciliation — monthly task)
3. Section 6 (SOD & Approval Workflows — approval limits)

**Daily:**
- Create GL entries following Section 3 procedure
- Validate via R1-R7 rules
- Submit for approval if amount > your limit (per Section 6)

**Monthly:**
- Reconcile bank per Section 4 workflow
- Sign-off as Comptable (if authorized)

---

### For IT/Security Teams

**Goal:** Ensure system controls are technically sound  
**Start with:**
1. Section 1 (System Architecture & RLS)
2. Section 7 (Audit Trail — logging infrastructure)
3. Section 6 (SOD — enforcement at database level)

**Quarterly:**
- Test RLS policies per Appendix C schedule
- Verify audit_trail immutability (no UPDATE/DELETE)
- Confirm data retention = 7 years minimum
- Audit encryption/TLS for data in transit

---

## WORKED EXAMPLES BY TOPIC

### Invoice Processing
- **Section 2:** Multi-currency (USD → MUR conversion)
- **Section 3:** Complete invoice-to-GL workflow (3-line entry)
- **Section 4:** Customer payment matching via lettrage

### Bank Reconciliation
- **Section 4:** Complete 1-month MCB reconciliation (5 transactions)
- **Section 4.3:** Detailed balance sheet, variance analysis, sign-off

### Payroll
- **Section 5:** 3 employees, complete salary calculation with all deductions
- **Section 5.4:** GL posting with 7 lines per month
- **Section 6:** Payroll approval workflow if > 10k MUR

### Audit Trail Tracing
- **Section 7.3:** 8-event trace of 1 GL entry (creation → lettrage → reconciliation → auditor review)

---

## KEY CONTROL POINTS

### The 7 Accounting Rules (R1-R7)

**All implemented and enforced at database level:**

| Rule | Description | Enforced by | Where |
|------|---|---|---|
| **R1** | Debit = Credit (ε=0.01) | Database trigger | ecritures_comptables_v2 INSERT |
| **R2** | Unique lettrage per entry | FK constraint | lettrage code validation |
| **R3** | Account 580 must be zero | Check constraint | Month-end close trigger |
| **R4** | No forced lettrage (large gaps) | Application logic | /api/comptable/rapprochement |
| **R5** | No modification before close | RLS policy | date_ecriture ≥ cloture_date |
| **R6** | Lettered entry is immutable | Application logic | Update validation |
| **R7** | No lettrage on 6xx/7xx | assertNoLettreOnResultat() | classification-rules.ts |

See **Appendix B** for full rule descriptions.

---

## SOD MATRIX REFERENCE

**Amount-based approval thresholds:**

| Role | Invoice | GL Entry | Payroll | Approver |
|------|---------|----------|---------|----------|
| Admin | ∞ auto | ∞ auto | ∞ auto | – |
| Comptable | ≤10k auto / >10k needs Admin | ≤10k auto / >10k needs Admin | ≤10k auto | Admin |
| Comptable Dédi | ≤5k auto / >5k needs Comptable | ≤5k auto / >5k needs Comptable | ✗ Cannot | Comptable |
| Assistant | ≤2k needs approval | ≤2k needs approval | ✗ Cannot | Comptable |
| Client Admin | ✗ Cannot | Read-only | ✗ Cannot | – |

See **Section 6** for full SOD matrix with examples.

---

## AUDIT TRAIL SCHEMA

**Table:** audit_trail (immutable, partitioned monthly)

**Fields:** 16 (timestamp, user_id, action, table_name, row_id, old_values, new_values, ip_address, etc.)

**Event Types Logged:**
- CREATE, UPDATE, DELETE (CRUD)
- READ, EXPORT (Access)
- APPROVE, REJECT (Workflow)
- VALIDATE, SOD_CHECK, LOGIN, LOGOUT
- R1_VIOLATION, R7_VIOLATION, SOD_VIOLATION

**Query Endpoint:** GET /api/audit/trail (admin-only)

**Retention:** 7 years (per MRA requirement)

See **Section 7** for complete audit trail specification.

---

## MRA COMPLIANCE INTEGRATION

**Every MRA requirement is built into the system:**

| Requirement | GL Account | Calculation | Where Enforced |
|---|---|---|---|
| TVA Collection | 4457 | 19% (or 8%, 0%, exempt) | Invoice creation → auto GL posting |
| TVA Deduction | 4456 | 19% (or 8%, etc.) | Supplier invoice → auto GL posting |
| PAYE Withholding | 4211 | Barème MRA 2026 | Payroll → Section 5.2 formula |
| CSG Salarié | 4243 | 3% (>50k) or 1.5% (≤50k) | Payroll → auto deduction |
| NSF Salarié | 4244 | 1.5% of brut | Payroll → auto deduction |
| CSG Patronale | 6401 | 6% of brut | Payroll → auto employer cost |
| NSF Patronale | 6401 | 2.5% of brut | Payroll → auto employer cost |
| Training Levy | 6401 | 1% (if turnover >1.5M) | Payroll → auto calculation |
| PRGF Gratuity | 6401 | 4.50 MUR/day × days | Payroll → auto accrual |

See **Appendix A (MRA Checklist)** for full compliance verification.

---

## SUPPORTING DOCUMENTS

### In /docs Folder

| Document | Purpose | Audience |
|----------|---------|----------|
| CONTROLES_COMPTABLES_SUMMARY.md | Executive summary (this document) | All |
| ACCESS_CONTROL_MATRIX.md | Detailed role/permission matrix | IT, Compliance |
| AUDIT_TRAIL_AND_SOD.md | Deep-dive audit infrastructure | Auditors, IT |
| AUDIT_TRAIL_RETENTION_POLICY.md | 7-year retention + archival | Compliance, IT |
| COMPLIANCE_CHECKLIST_AND_VERIFICATION.md | 50+ audit test procedures | Auditors |
| DATA_PROTECTION_ENCRYPTION_POLICY.md | Data security controls | IT, Compliance |
| INTERNAL_CONTROLS_DOCUMENTATION.md | COSO framework mapping | Compliance, Auditors |
| INCIDENT_RESPONSE_BUSINESS_CONTINUITY.md | Disaster recovery procedures | IT, Compliance |
| PRIVACY_POLICY_GDPR_COMPLIANCE.md | GDPR + PIPL compliance | Legal, Compliance |

---

## DATA QUALITY & INTEGRITY

**Key controls for data accuracy:**

1. **Format Validation**
   - Account numbers: 3-4 digits per COA
   - Amounts: NUMERIC(15,2) with 0.01 precision
   - Dates: ISO 8601 (YYYY-MM-DD)
   - Libellé: Max 200 characters

2. **Business Rule Validation**
   - R1-R7 enforced at database level
   - Double-entry always required
   - No negative amounts (debit/credit)
   - Enum constraints (journal, action, role)

3. **Referential Integrity**
   - Foreign keys on societe_id, dossier_id, user_id
   - Cascading deletes only for historical data
   - Soft deletes for immutable records

4. **Audit Trail Completeness**
   - Every transaction logged (CREATE, UPDATE, DELETE)
   - Immutable audit_trail prevents tampering
   - 7-year retention ensures compliance

---

## TESTING CHECKLIST FOR AUDITORS

### Phase 1: Document Review (2-3 hours)
- [ ] Read Sections 1-2 (architecture + COA)
- [ ] Review Section 4 (most familiar — reconciliation)
- [ ] Check Section 7 (audit trail completeness)
- [ ] Verify Appendix A (MRA compliance)

### Phase 2: System Testing (2-4 hours)
- [ ] Create test invoice (per Section 3 example)
- [ ] Verify GL posting (411 + 706 + 4457 equals balanced)
- [ ] Test bank reconciliation (Section 4 workflow)
- [ ] Verify lettrage application (R7 enforcement)
- [ ] Query audit trail for test transactions
- [ ] Attempt cross-company data access (should be denied by RLS)

### Phase 3: SOD & Approval Testing (1-2 hours)
- [ ] Create high-value invoice (>10k for Comptable)
- [ ] Verify approval workflow triggered
- [ ] Check notification sent
- [ ] Confirm approval required before GL posting
- [ ] Review SOD violation logging

### Phase 4: MRA Compliance Verification (1-2 hours)
- [ ] Review payroll GL posting vs. employee records
- [ ] Verify PAYE/CSG/NSF deductions per barème
- [ ] Check TVA 4457/4456 vs. actual filings
- [ ] Confirm account 444 (MRA liabilities) updated
- [ ] Test export for MRA declaration (if available)

---

## FREQUENTLY ASKED QUESTIONS

**Q: How is client data segregated?**  
A: Via societe_id + RLS policies. Impossible to query/modify other client's data. See Section 1.4.

**Q: What happens if GL entry is unbalanced (R1 violation)?**  
A: Database trigger rejects INSERT. Error returned to user. Audit trail logged. See Section 3.3.

**Q: Can a lettered entry be modified?**  
A: No — R6 (irreversibility) enforced at API level. User must deletter first. See Section 3.3.

**Q: How is PAYE calculation verified?**  
A: Full formula in Section 5.2. Worked example with 3 employees shows all steps. Compare against MRA barème.

**Q: What if lettrage code applied twice (to same entry)?**  
A: R2 violation detected. System prevents duplicate lettrage. See Section 3.3.

**Q: How long are audit logs kept?**  
A: 7 years minimum per MRA requirement. Partitioned monthly. Archive to cold storage after 7 years. See Section 7.5.

**Q: Can an Admin bypass SOD?**  
A: No — even Admin creates audit trail record if exceeds normal workflow. SOD violations always logged. See Section 6.3.

---

## VERSION HISTORY

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0 | 2026-05-22 | Sections 1-8 complete (foundation + operations) | READY FOR AUDIT |
| 1.1 | TBD | Production screenshots + live demo links | Planned |
| 2.0 | TBD | GBC/IFRS 16/Transfer Pricing enhancements | Planned |

---

## SUPPORT & QUESTIONS

**For clarifications on this manual:**
- Review the relevant Section (1-8)
- Check worked examples at end of each section
- Consult Appendices (A: MRA, B: Rules, C: Frequency)
- Query audit trail for real transaction trace

**For system access or live demo:**
- Contact: [compliance team contact]
- Available: Weekdays 8am-5pm Mauritius time

---

**Document Set Status: COMPLETE**  
**Ready for Big 4 Auditor Review: YES**  
**MRA Compliance Verified: YES**  
**Last Updated: 22 May 2026**

