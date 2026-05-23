# LEXORA COMPLIANCE DOCUMENTATION - INDEX & GUIDE

**Current Status**: PHASE 3 Foundation (Sections 1-3 Complete)  
**Date**: 22 May 2026  
**For**: Big 4 Audit Readiness  

---

## MAIN DOCUMENTS (READ IN THIS ORDER)

### 1. CONTROLES_COMPTABLES_LEXORA.md (Primary Manual)
**Status**: ✅ Sections 1-3 Complete (14 pages)  
**Audience**: Auditors, comptable, directeur, developers  

**What's Inside**:
- System overview (architecture, database schema, user roles)
- General accounting controls (chart of accounts, month-end close)
- Invoice-to-GL process (workflows, GL posting rules, traceability)
- MRA compliance (VAT, PAYE, CSG/NSF, TDS details)

**How to Use**:
```
AUDITORS: Read Sections 1-3 → 45 min to understand system
COMPTABLE: Section 2.3 → Month-end checklist
           Section 3.1 → Invoice creation workflow
           Section 3.6 → Bank reconciliation (lettrage)
DIRECTEUR: Section 1.3 → User roles & access control
           Section 3.3 → Approval workflow & segregation of duties
DEVELOPERS: Sections 1-2 → System architecture & GL triggers
            Section 3 → GL posting logic (createEcrituresForFacture)
```

**Next Sections** (Planned Phase 2):
- Section 4: Bank Reconciliation (6 pages)
- Section 5: Payroll Controls (6 pages)
- Section 6: Segregation of Duties (5 pages)
- Section 7: Audit Trail & Change Log (3 pages)
- Section 8: Data Quality & Integrity (4 pages)

---

### 2. AUDIT_QUICK_START.md (Auditor Field Manual)
**Status**: ✅ Complete  
**Audience**: Big 4 audit team  

**What's Inside**:
- 30-minute system overview
- 5-phase audit walkthrough (2-hour timeline)
- Common audit test queries (SQL)
- Red flags & escalation matrix
- Contact & support information

**How to Use**:
```
Phase 1: System access & navigation (1 hour)
Phase 2: GL & trial balance testing (2 hours)
Phase 3: Bank reconciliation & payments (1.5 hours)
Phase 4: Payroll & tax controls (1 hour)
Phase 5: Audit trail & documentation (30 minutes)

Total: 5.5 hours for complete audit fieldwork
```

---

### 3. PHASE3_COMPLIANCE_STATUS.md (Tracking & Status)
**Status**: ✅ Complete  
**Audience**: Project managers, compliance leads  

**What's Inside**:
- Deliverable summary
- Audit-ready features checklist
- Phase 2 enhancement gaps
- Usage guide for all stakeholder groups
- Next steps timeline

---

## QUICK REFERENCE BY ROLE

### For Big 4 Auditors
1. **Start Here**: AUDIT_QUICK_START.md (5-phase walkthrough, 30 min)
2. **Then Read**: CONTROLES_COMPTABLES_LEXORA.md Sections 1-3 (45 min)
3. **Deep Dive**: CONTROLES_COMPTABLES_LEXORA.md Sections 4-8 (when available)
4. **Test with**: SQL queries in AUDIT_QUICK_START.md
5. **Red Flags**: See red flags matrix in AUDIT_QUICK_START.md

**Key Tests to Run**:
- GL balance verification (test 1)
- Invoice completeness (test 2)
- Reconciliation status (tests 3-4)
- Payroll calculations (Phase 4)
- Bank matching (test 3)

---

### For Comptable
**Daily/Weekly Tasks**:
- Section 2.3: Month-end close checklist
- Section 3.1: Invoice creation workflow
- Section 3.6: Bank reconciliation (lettrage)

**Monthly Deliverables**:
- Trial balance (Section 2.4)
- Aged receivables report
- Bank reconciliation by 27th
- Payroll posted by 27th

---

### For Directeur
**Approval Authority**:
- Section 1.3: Who can do what (roles & permissions)
- Section 3.3: Approval workflow for invoices & GL entries
- Section 3.3: Segregation of duties enforcement

**Monthly Review**:
- Trial balance verification (debit = credit)
- AR aging & doubtful debt provision
- Bank reconciliation sign-off
- Payroll PAYE withholding verification

**Quarterly**:
- Financial control effectiveness assessment
- Document retention verification (6 years)
- Audit readiness review

---

### For Lexora Developers
**System Architecture**:
- Section 1.1: System architecture diagram
- Section 1.2: Database schema overview
- Section 1.3: Multi-tenant isolation & RLS

**GL Posting Logic**:
- Section 2.1: Chart of Accounts structure
- Section 2.2: Journal entry creation process
- Section 3: Complete invoice-to-GL workflows

**Future Implementation** (Phase 2):
- Section 7: Audit trail & change log (audit_logs table design)
- Section 8: Data quality & integrity (validation rules)

---

## KEY TABLES & ACCOUNTS REFERENCE

### Core Tables
| Table | Purpose | Audit Impact |
|-------|---------|--------------|
| ecritures_comptables_v2 | GL master | Source of truth - critical for audit |
| factures | Invoices (AR/AP) | Revenue/expense recognition |
| releves_bancaires | Bank statements | Bank reconciliation |
| bulletins_paie | Payroll slips | Tax withholding verification |
| lettrages | Payment matching | Reconciliation proof |

### Key GL Accounts (Mauritian PCM)
| Code | Name | Usage |
|------|------|-------|
| 4210 | Client Receivables (AR) | Customer invoices debit |
| 4020 | Supplier Payables (AP) | Supplier invoices credit |
| 706 | Sales Revenue | Customer invoice credit |
| 601 | Materials/Services Expense | Supplier invoice debit |
| 4412 | VAT Payable to MRA | Output VAT on sales |
| 4411 | VAT Recoverable | Input VAT on purchases |
| 5121 | Bank MUR Account | Daily deposits/withdrawals |
| 6200 | Gross Salaries | Payroll expense debit |
| 4420/4421 | PAYE Withholding (employee/employer) | Tax deductions |
| 4430/4431 | CSG Contributions (employee/employer) | Social contributions |
| 4440/4441 | NSF Contributions (employee/employer) | National Savings |

---

## CONTROL RULES (CRITICAL FOR AUDIT)

### Rule R1: Double Entry (GL Balance)
**Requirement**: Debit = Credit for every transaction date + journal combination  
**Enforcement**: tr_balance_check_insert trigger (cannot override)  
**Test**: See AUDIT_QUICK_START.md test 1

### Rule R2: Lettrage (Payment Matching)
**Requirement**: All invoices matched to bank payment by month-end  
**Enforcement**: Manual lettrage process + system matching  
**Test**: See AUDIT_QUICK_START.md test 3

### Rule R3: Idempotency (No Duplicates)
**Requirement**: No duplicate GL entries from invoice posting  
**Enforcement**: UNIQUE index on (societe_id, ref_folio, numero_compte)  
**Test**: See AUDIT_QUICK_START.md - verify ref_folio unique

---

## DOCUMENT FILING CHECKLIST

### For Month-End Close
- [ ] Trial balance report (PDF)
- [ ] Bank reconciliation (all accounts)
- [ ] AR aging report
- [ ] AP aging report
- [ ] Payroll summary
- [ ] VAT report
- [ ] GL detail listing
- [ ] Manual entries approval

### For Big 4 Audit File
- [ ] CONTROLES_COMPTABLES_LEXORA.md (Sections 1-3)
- [ ] AUDIT_QUICK_START.md (field procedures)
- [ ] PHASE3_COMPLIANCE_STATUS.md (tracking)
- [ ] Sample transactions (5 customer invoices, traceability)
- [ ] Sample transactions (5 supplier invoices)
- [ ] Sample payroll (3 employees, 1 month)
- [ ] Bank reconciliation (1 month complete)
- [ ] Trial balance (month-end)

---

## FAQ & TROUBLESHOOTING

### Q: GL Trial Balance Doesn't Balance (Debit ≠ Credit)
**A**: STOP - Cannot close month-end. Follow Section 2.4 investigation steps.

### Q: An Invoice Has No GL Entry
**A**: Check invoice status. If 'en_attente'|'paye'|'retard', GL should exist. Run balance check query.

### Q: Bank Transaction Unmatched (5800 Account > 0)
**A**: Investigate unmatched tx. Use Section 3.6 reconciliation workflow to identify.

### Q: Auditor Questions GL Account Coding
**A**: Reference Section 2.1 (Chart of Accounts) and invoice approval worksheet.

### Q: PAYE Withholding Amount Seems Wrong
**A**: Verify against MRA 2026 barème. See Section 5 (Payroll, when available).

---

## TIMELINE & MILESTONES

**Current** (22 May 2026):
- ✅ Sections 1-3 complete (14 pages, foundation)
- ✅ AUDIT_QUICK_START.md complete
- ✅ PHASE3_COMPLIANCE_STATUS.md complete

**Next 2 Weeks**:
- ⏳ Sections 4-5 (Bank Rec + Payroll)
- ⏳ Phase 2 enhancement planning

**End of PHASE 1**:
- ⏳ Sections 4-8 complete (full 40 pages)
- ⏳ Ready for comprehensive audit

**PHASE 2**:
- ⏳ audit_logs table implementation
- ⏳ RLS policy tightening
- ⏳ Approval workflow enforcement
- ⏳ Documentation updates

---

## CONTACT & ESCALATION

**Document Issues**: Reference specific section + line number  
**System Questions**: Comptable Jean-Paul (jean-paul@dds.mu)  
**Approval Required**: Directrice Marie (marie@dds.mu)  
**Big 4 Liaison**: [Auditor engagement manager]  

---

## DOCUMENT VERSIONS

| Version | Date | Status | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-22 | CURRENT | Sections 1-3 released |
| 1.1 | TBD | PLANNED | Sections 4-5 added |
| 1.2 | TBD | PLANNED | Sections 6-8 added |
| 2.0 | TBD | PLANNED | Phase 2 enhancements |

---

## READING TIME ESTIMATES

| Document | Audience | Time |
|----------|----------|------|
| AUDIT_QUICK_START.md | Auditors | 2.5 hours |
| CONTROLES_COMPTABLES_LEXORA.md (1-3) | All | 1.5 hours |
| CONTROLES_COMPTABLES_LEXORA.md (4-8) | Technical | 2 hours |
| PHASE3_COMPLIANCE_STATUS.md | Managers | 30 min |

---

**For Sections 4-8 (when complete), see**: CONTROLES_COMPTABLES_LEXORA.md

**Last Updated**: 22 May 2026  
**Next Review**: Upon completion of Sections 4-8
