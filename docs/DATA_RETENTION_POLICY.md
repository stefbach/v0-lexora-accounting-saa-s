# DATA RETENTION POLICY
## Lexora SaaS - Regulatory Compliance & Data Lifecycle

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Owner:** Legal & Compliance Team  
**Jurisdiction:** Mauritius (primary), GDPR (if EU data)

---

## EXECUTIVE SUMMARY

This policy defines retention periods for all data types in Lexora, aligned with:
- **MRA (Mauritius Revenue Authority)** requirements
- **Mauritian Labor Code** employment records
- **GDPR** (General Data Protection Regulation, if EU citizens present)
- **International best practices** (ISO 27001)

---

## RETENTION PERIODS

### Category 1: FINANCIAL RECORDS (7 Years)

**Legal Basis:** MRA Code of Civil Procedure, Article 286 (general statute of limitations)

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **General Ledger Entries** | 7 years | MRA audit trail | MRA Code |
| **Invoices (Issued)** | 7 years | Revenue records, audit | MRA Code |
| **Invoices (Received)** | 7 years | Expense substantiation | MRA Code |
| **Purchase Orders** | 7 years | Procurement audit | MRA Code |
| **Sales Orders** | 7 years | Revenue substantiation | MRA Code |
| **Bank Statements** | 7 years | Cash flow audit, tax | MRA Code |
| **Bank Reconciliations** | 7 years | Accounting records | MRA Code |
| **Receipts & Vouchers** | 7 years | Transaction support | MRA Code |
| **Ledger Summaries** | 7 years | Financial reporting | MRA Code |
| **Trial Balance Reports** | 7 years | Accounting records | MRA Code |
| **Tax Returns (VAT, PAYE, CSG)** | 7 years | Tax filing archive | MRA Code |
| **Bilans Officiels (Balance Sheet)** | 7 years | Annual filings | MRA Code |

**Deletion Rule:**
- Delete automatically 7 years after transaction date
- Delete after final MRA audit + 7 years
- No exceptions without MRA written approval

**Retention Method:**
- Online storage: First 3 years
- Archive storage: Years 4-7 (encrypted, indexed)
- Deletion: Cryptographic destruction (overwrite 3x + certificate)

---

### Category 2: PAYROLL RECORDS (5 Years)

**Legal Basis:** Mauritian Labor Code, Section 7 (employment records)

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **Payslips (Bulletins de Paie)** | 5 years | Employee records | Labor Code |
| **Salary History** | 5 years | Wage verification | Labor Code |
| **Time Sheets / Pointages** | 5 years | Hours worked | Labor Code |
| **Leave Records (Conges)** | 5 years | Leave entitlements | Labor Code |
| **Attendance Records** | 5 years | Attendance audit | Labor Code |
| **PAYE Declarations** | 5 years | Tax withholding | Labor Code |
| **CSG Declarations** | 5 years | Social contributions | Labor Code |
| **NSF Declarations** | 5 years | Insurance | Labor Code |
| **Bonus Calculations** | 5 years | Compensation audit | Labor Code |
| **Contract Terms** | Until termination + 3 years | Legal obligations | Labor Code |
| **Performance Reviews** | 3 years post-termination | Dispute resolution | Best practice |

**Deletion Rule:**
- Delete 5 years after employee termination (or last payment)
- Earlier deletion for departing contractors (1 year)
- Keep final payslip + P&L summary indefinitely

**Retention Method:**
- Active payroll: Online (encrypted, RLS)
- Archive: Encrypted storage (years 3-5)
- Deletion: Cryptographic destruction

---

### Category 3: TAX & REGULATORY FILINGS (7 Years)

**Legal Basis:** MRA, Mauritius Revenue Authority, tax code compliance

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **MRA PAYE Submissions** | 7 years | Annual employee tax | MRA |
| **MRA CSG Submissions** | 7 years | Contribution records | MRA |
| **MRA NSF Submissions** | 7 years | Social insurance | MRA |
| **MRA VAT Returns** | 7 years | Sales tax audit | MRA |
| **MRA Form 3 (Income Tax)** | 7 years | Corporate tax return | MRA |
| **MRA Form 8A (Accounting Records)** | 7 years | Financial compliance | MRA |
| **TDS (Tax Deducted at Source)** | 7 years | Withholding records | MRA |
| **BRN/VAT Registration** | Until deregistration + 3 years | Company status | MRA |
| **CRS/FATCA Declarations** | 7 years | Beneficial ownership | FATCA |
| **ROC Annual Returns** | 7 years | Corporate filing | ROC |
| **GBC Documentation** (if applicable) | 7 years | Offshore compliance | FSC |

**Deletion Rule:**
- MRA filings: Keep electronic copy indefinitely
- Submissions: 7 years minimum
- Failed submissions: 7 years + keep evidence
- Amendments/corrections: 7 years from amendment date

**Retention Method:**
- Primary: Supabase (encrypted, immutable audit log)
- Backup: PDF archive (AWS S3, encrypted)
- Deletion: After 7 years + MRA confirmation

---

### Category 4: AUDIT LOGS & TRAILS (2 Years)

**Legal Basis:** ISO 27001, SOX-equivalent compliance, MRA audit requirements

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **User Audit Trails** | 2 years | Access tracking | ISO 27001 |
| **Transaction Logs** | 2 years | Change history | MRA audit |
| **API Logs** | 2 years | System activity | ISO 27001 |
| **Login Attempts** | 1 year | Security monitoring | ISO 27001 |
| **Failed Auth Events** | 1 year | Security incidents | ISO 27001 |
| **Configuration Changes** | 2 years | System integrity | ISO 27001 |
| **Encryption Key Rotations** | 3 years | Crypto audit trail | Compliance |
| **Privileged Access Logs** | 2 years | Admin activities | ISO 27001 |
| **Data Export Logs** | 2 years | Compliance tracking | MRA audit |
| **Backup Verification Logs** | 1 year | Disaster recovery | Best practice |

**Deletion Rule:**
- Auto-delete after 2 years
- Exception: SOD (Segregation of Duties) violations → keep 5 years
- Exception: Security incidents → keep 3 years
- Critical audit trail: Keep 7 years for MRA-relevant transactions

**Retention Method:**
- Hot storage (queryable): First 6 months
- Warm storage (indexed): 6 months - 2 years
- Archival: > 2 years (if critical)

---

### Category 5: EMPLOYEE & SUPPLIER PERSONAL DATA (Active + 3 Years)

**Legal Basis:** GDPR (if EU), Mauritius Data Protection Act

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **Employee Contact Info** | Until termination + 3 years | Dispute resolution | Labor Code + GDPR |
| **Employee Address** | Until termination + 3 years | Severance payments | Labor Code |
| **Employee Phone Number** | Until termination + 3 years | Communication record | GDPR |
| **Employee Personal ID** | Until termination + 3 years | Payroll/tax audit | MRA |
| **Supplier Contact Info** | Active relationship + 3 years | Dispute resolution | GDPR |
| **Supplier Address** | Active relationship + 3 years | Payment records | GDPR |
| **Supplier Banking Info** | Active relationship + 3 years | Payment records | GDPR |
| **Customer Contact Info** | Active relationship + 3 years | Dispute resolution | GDPR |
| **Customer Email** | Active relationship + 3 years | Communication | GDPR |
| **Customer Phone** | Active relationship + 3 years | Communication | GDPR |

**Deletion Rule:**
- Email notification: "Your data will be deleted in 30 days"
- Deletion: 3 years after last activity (configurable)
- GDPR right to forget: Honored within 30 days
- Exception: Legal disputes (keep until resolved + 3 years)

**Retention Method:**
- Active: Encrypted, RLS restricted
- Archive (3-year buffer): Encrypted storage
- Deletion: Cryptographic destruction + certificate

---

### Category 6: CUSTOMER & MARKETING DATA (3 Years)

**Legal Basis:** GDPR, Mauritius Data Protection Act, CRM best practice

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **Email Addresses (Contacts)** | 3 years (post-unsubscribe) | Marketing audit | GDPR |
| **Marketing Communications** | 2 years (sent emails) | Compliance audit | CAN-SPAM |
| **Subscription Preferences** | 3 years post-unsubscribe | Opt-out verification | GDPR |
| **Chat Conversations** | 2 years | Customer service audit | Best practice |
| **Support Tickets** | 3 years | Dispute resolution | Best practice |
| **Form Submissions** | 3 years | Lead tracking audit | GDPR |

**Deletion Rule:**
- Auto-delete 3 years after unsubscribe
- Export on request (GDPR right to data portability)
- Deleted in compliance with GDPR within 30 days of request

---

### Category 7: DOCUMENTS & ATTACHMENTS (7 Years)

**Legal Basis:** MRA code, document audit trail

| Data Type | Retention Period | Reason | Legal Reference |
|-----------|------------------|--------|-----------------|
| **Uploaded Invoices (PDF)** | 7 years | Tax substantiation | MRA Code |
| **Bank Statements (PDF)** | 7 years | Cash audit | MRA Code |
| **Payslips (PDF)** | 5 years | Payroll audit | Labor Code |
| **Contracts (Scanned)** | Duration + 3 years | Legal evidence | Contract law |
| **Receipts (Scanned)** | 7 years | Expense audit | MRA Code |
| **Email Attachments** | Related to transaction retention | Substantiation | MRA Code |
| **Correspondence** | 3 years post-transaction | Dispute evidence | Best practice |

**Deletion Rule:**
- Delete with transaction (GL entry, invoice, etc.)
- Keep until MRA audit period ends (7 years typical)
- Orphaned documents: Delete after 1 year in archive

**Retention Method:**
- Primary: Supabase Storage (encrypted)
- Backup: AWS S3 (encrypted, versioned)
- Deletion: Cryptographic destruction

---

## RETENTION CALCULATION RULES

### Transaction Date vs. Document Date

```
RULE: Use TRANSACTION DATE, not document date
─────────────────────────────────────────────

Example 1: Invoice dated 2025-01-15, recorded 2025-01-20
└─ Retention starts: 2025-01-20 (transaction date)
└─ Delete date: 2032-01-20 (7 years later)

Example 2: Bank statement dated 2026-05-31, reconciled 2026-06-05
└─ Retention starts: 2026-06-05 (reconciliation date)
└─ Delete date: 2033-06-05

Exception: Payroll
├─ Payslip dated 2026-05-20
├─ Paid 2026-05-31
└─ Retention starts: 2026-05-31 (payment date) → delete 2031-05-31
```

### Multi-Year Transactions

```
Example: Loan recorded 2025-01 with 36-month amortization
├─ GL entries: Delete 7 years after LAST payment (2028-01)
│  └─ Delete date: 2035-01
├─ Loan contract: Delete 3 years after payoff (2028-01)
│  └─ Delete date: 2031-01
└─ Interest calculations: Delete with final payment
   └─ Delete date: 2035-01
```

---

## DELETION PROCEDURES

### Automated Deletion (Preferred)

```sql
-- Migration: Set up automated deletion for audit logs
CREATE OR REPLACE FUNCTION delete_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.audit_trail
  WHERE timestamp < NOW() - INTERVAL '2 years'
  AND table_name NOT IN ('critical_tables'); -- Preserve critical

  DELETE FROM public.login_attempts
  WHERE created_at < NOW() - INTERVAL '1 year';
  
  DELETE FROM public.api_logs
  WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron
SELECT cron.schedule('delete_old_audit_logs', '0 2 1 * *', 'SELECT delete_old_audit_logs()');

-- Schedule monthly document cleanup
SELECT cron.schedule('delete_archived_documents', '0 3 1 * *', 'SELECT delete_archived_documents()');
```

### Manual Deletion (Compliance Review)

```
Process:
1. Run retention report (all data reaching retention date)
2. Compliance review (30 days)
3. Approval by audit team
4. Cryptographic deletion with certificate
5. Audit log entry: "Deleted [N] records per retention policy [date]"
```

### Data Subject Deletion (GDPR)

```
Process (30-day SLA):
1. Receive deletion request
2. Find all records associated with person
3. Flag for deletion (soft delete, 30-day grace)
4. Notify data owner (if applicable)
5. After 30 days: Cryptographic destruction
6. Certificate of deletion issued
7. Response to requester: "Deletion confirmed [date]"
```

---

## RETENTION EXCEPTIONS

### Litigation Hold

```
If litigation pending:
├─ Place hold on all related records
├─ Extend retention indefinitely (until resolved + 3 years)
├─ Audit log: "Litigation hold placed: [Case ID]"
└─ Removal: Legal team approval required
```

### MRA Audit

```
If MRA audit in progress:
├─ Hold all relevant records
├─ Extend retention until audit closed + 1 year
├─ Notify audit team of pending deletions
└─ Release after audit completion
```

### Security Incidents

```
If breach detected:
├─ Hold all related logs indefinitely
├─ Forensic analysis period: 1 year
├─ Extended retention: 3 years post-incident
└─ Deletion only after legal/insurance clearance
```

---

## RETENTION SCHEDULE BY TABLE

| Table | Retention Period | Delete Trigger | Notes |
|-------|------------------|-----------------|-------|
| **auth.users** | Until account deactivation + 3 years | Account delete date | GDPR: honor right to forget |
| **profiles** | Until account deactivation + 3 years | Account delete date | Delete with user |
| **societes** | Until deregistration + 7 years | BRN deactivation date | Keep registration indefinitely |
| **ecritures_comptables** | 7 years | Transaction date | MRA requirement |
| **factures** | 7 years | Invoice date (fiscal year) | Tax audit trail |
| **releves_bancaires** | 7 years | Statement period end | Cash audit trail |
| **transactions_bancaires** | 7 years | Transaction date | Bank reconciliation |
| **bulletins_paie** | 5 years | Last payment date | Labor Code |
| **employes** | 5 years | Termination date | Active + 5 years |
| **declarations_paye_mensuelle** | 7 years | Declaration period | Tax filing |
| **declarations_csg_mensuelle** | 7 years | Declaration period | Tax filing |
| **demandes_conges** | 5 years | Last day of leave | Payroll audit |
| **tva_mensuelle** | 7 years | Declaration period | Tax filing |
| **audit_trail** | 2 years | Timestamp | ISO 27001 |
| **audit_trail (critical)** | 7 years | Critical ops only | MRA-relevant only |
| **documents** | 7 years | Related transaction | Document audit |
| **factures_contacts** | 3 years | Last invoice date | GDPR |
| **tiers_annuaire** | 3 years | Last transaction | GDPR |

---

## COMPLIANCE MATRIX

| Regulation | Requirement | Lexora Implementation | Owner |
|-----------|-------------|----------------------|-------|
| **MRA Code** | 7 years financial records | Automated deletion after 7 years | Finance |
| **Labor Code** | 5 years payroll records | Automated deletion after 5 years | HR |
| **GDPR** | Right to deletion (30 days) | Manual + automated process | Legal |
| **ISO 27001** | 2-year audit trail | Automated deletion + exception handling | Ops |
| **Data Protection Act** | PII retention limits | 3-year retention post-activity | Legal |

---

## DELETION CERTIFICATE TEMPLATE

```
CERTIFIED DELETION RECORD
═════════════════════════════════════

Deletion Date: 2026-05-22
Deletion Time: 02:00 UTC
Deleted By: Automated cron job
Audit ID: audit_trail_20260522_0200

Records Deleted:
├─ audit_logs: 1,234,567 records
├─ api_logs: 456,789 records
├─ login_attempts: 234,567 records
└─ Total: 1,925,923 records

Retention Justification:
└─ All records exceeded 2-year audit trail retention

Deletion Method:
├─ Algorithm: PostgreSQL DELETE with VACUUM
├─ Verification: SHA-256 of remaining records: [HASH]
└─ Secure Erase: Yes (overwrite + vacuum)

Compliance Verification:
├─ MRA: No financial records deleted ✓
├─ Labor Code: No payroll records deleted ✓
├─ GDPR: No pending requests ✓
├─ Litigation holds: None active ✓
└─ Backups: Scheduled for same deletion

Certified By: Compliance Team
Authorized By: CTO
Next Review: 2026-06-22
```

---

## QUARTERLY RETENTION REVIEW

| Quarter | Action |
|---------|--------|
| **Q1** | Review retention policy compliance (Jan-Mar) |
| **Q2** | Audit logs deletion run (Apr-Jun) |
| **Q3** | Confirm MRA filing period coverage (Jul-Sep) |
| **Q4** | Annual retention audit + legal review (Oct-Dec) |

**Checklist:**
- [ ] No financial records deleted prematurely
- [ ] All payroll records within retention limits
- [ ] GDPR requests honored within 30 days
- [ ] Litigation holds in place
- [ ] Backup retention aligned with policy
- [ ] Audit trail complete and immutable

---

## DISASTER RECOVERY & BACKUPS

**Backup Retention:** Same as primary data + 1 year
```
Primary Data: 7 years
Backup: 7 years + 1 year = 8 years total
└─ Allows recovery if deletion error detected
```

**Test Restore:** Quarterly
- Verify backup contains required data
- Confirm encryption/decryption works
- Validate retention dates preserved

---

## DOCUMENT CONTROL

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-22 | Initial retention policy |
| | | MRA (7 years) financial |
| | | Labor Code (5 years) payroll |
| | | ISO 27001 (2 years) audit logs |
| | | GDPR (3 years) personal data |
| | | Automated deletion procedures |

---

## REFERENCES

- **Mauritius Revenue Authority Code:** [MRA Legal Code]
- **Mauritian Labor Code:** Chapter 203, Employment
- **GDPR Article 17:** Right to erasure
- **ISO 27001:2022:** Section 7.14 (Data retention)
- **Sarbanes-Oxley:** Record retention (US, referenced for compliance)
- **FSC Global Business Company Rules:** (if GBC applicable)
