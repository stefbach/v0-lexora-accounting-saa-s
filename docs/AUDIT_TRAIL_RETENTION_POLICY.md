# Audit Trail & Record Retention Policy
## Lexora Accounting SaaS Platform

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Jurisdiction**: Mauritius (MRA compliance primary)  
**Prepared for**: Big 4 Audit Compliance  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Audit Trail Requirements](#audit-trail-requirements)
3. [Record Retention Schedules](#record-retention-schedules)
4. [Immutability & Non-Repudiation](#immutability--non-repudiation)
5. [Data Disposal Procedures](#data-disposal-procedures)
6. [Audit Trail Access & Export](#audit-trail-access--export)
7. [Compliance & Regulations](#compliance--regulations)
8. [Audit Trail Implementation](#audit-trail-implementation)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Commitment

Lexora maintains complete, immutable audit trails to ensure:

✅ **Accountability**: Every GL entry, invoice, and user action is logged  
✅ **Auditability**: Auditors can trace any transaction to its source  
✅ **Compliance**: All MRA requirements for record retention are met  
✅ **Integrity**: Logs cannot be deleted or modified after creation  
✅ **Transparency**: Customers can view their own audit trail at any time  

### 1.2 Audit Trail Scope

**What is Audited:**

```
FINANCIAL TRANSACTIONS:
├─ GL entries (creation, approval, reversal)
├─ Invoices (creation, approval, payment)
├─ Bank transactions (import, matching, reconciliation)
├─ Payroll (salary calculation, payment, tax withholding)
└─ Tax declarations (filing, amendments)

DATA CHANGES:
├─ Who created/modified/deleted each record
├─ When the change was made (timestamp to 1-second precision)
├─ What was changed (old value → new value)
├─ Why it was changed (reference to related transaction)
└─ IP address from which change was made

USER ACTIONS:
├─ Login (who, when, from where)
├─ Logout (timestamp)
├─ Failed login attempts (potential security issue)
├─ Permission changes (role assignments, access revoked)
└─ Access to sensitive data (salary, national ID)

SYSTEM EVENTS:
├─ Database backups (timestamp, success/failure)
├─ Encryption key rotation (date, who approved)
├─ Security incidents (detection, response, resolution)
└─ Configuration changes (who changed what)
```

---

## 2. AUDIT TRAIL REQUIREMENTS

### 2.1 What Must Be Logged

**Every GL Entry Must Record:**

```
GL Entry Audit Trail Example:

CREATION:
├─ created_by: comptable@company.mu
├─ created_at: 2026-05-20 10:15:30.123 UTC
├─ GL entry ID: ECC-2026-00047
├─ Journal: VTE (sales)
├─ Accounts: 4210 (AR), 706 (Revenue), 4412 (VAT)
├─ Amounts: Debit 50,000, Credit 50,000
├─ Reference: INV-2026-0001
├─ Status: draft (not yet posted)
└─ Source IP: 196.203.45.67

APPROVAL:
├─ approved_by: directeur@company.mu
├─ approved_at: 2026-05-20 14:00:00.000 UTC
├─ Status change: draft → posted
├─ Approval reference: "Approved - business purpose verified"
└─ Source IP: 196.203.45.89

LATER MODIFICATION (If errors discovered):
├─ discovered_by: comptable@company.mu
├─ discovered_at: 2026-05-22 09:30:00.000 UTC
├─ Issue: Wrong account (701 instead of 706)
├─ Solution: Create reversal entry
│  ├─ reversal_entry_id: ECC-2026-00147
│  ├─ reversal_date: 2026-05-22 10:00:00.000 UTC
│  └─ Status: posted
├─ Then create correcting entry:
│  ├─ correction_entry_id: ECC-2026-00148
│  ├─ correction_date: 2026-05-22 10:05:00.000 UTC
│  ├─ correct_account: 706
│  └─ Status: posted
├─ All 3 entries linked: ECC-47 ← Reversal ← Correction
└─ Audit trail shows: Original entry, reason for correction, all approvals

RESULT:
Auditor can see complete lifecycle:
├─ Original entry #47 posted
├─ Error discovered on 2026-05-22
├─ Reversal #147 created & posted
├─ Correction #148 created & posted
├─ All approvals documented
└─ Nothing hidden or deleted (immutable record)
```

### 2.2 Timestamp Precision

**All timestamps must be:**

✅ **UTC** (not local time; prevents ambiguity across time zones)  
✅ **Precise to 1 second** (minimum; milliseconds preferred)  
✅ **Synchronized** (all servers use same time source)  
✅ **Immutable** (cannot be backdated or modified)  

**Example Audit Log Timestamps:**

```
2026-05-20T10:15:30.123456Z  ← Preferred (microsecond precision, ISO 8601)
2026-05-20 10:15:30 UTC       ← Acceptable (1-second precision)
2026-05-20 10:15:30.000000    ← NOT acceptable (Z timezone missing)
2026-05-20 05:15:30 EDT       ← NOT acceptable (local time, ambiguous)
```

### 2.3 User Identification

**All actions must record:**

```
INDIVIDUAL USER IDENTIFICATION:

Who: 
├─ Email address: comptable@company.mu (unique identifier)
├─ User ID: user-12345 (system-generated UUID)
├─ Full name: Marie Dubois (display name, not unique)
├─ Company: DDS Mauritius Ltd (societe_id)
└─ Role: Comptable (at time of action)

Multi-tenant Isolation:
├─ Each action tagged with: societe_id = DDS_001
├─ Auditors cannot see other companies' data
├─ GL entries from Company A not visible in Company B audit trail
└─ System enforces isolation at query level
```

---

## 3. RECORD RETENTION SCHEDULES

### 3.1 Retention by Record Type

**Mauritian Legal Requirements + Best Practices:**

| Record Type | Retention Period | Legal Basis | Immutability | Notes |
|---|---|---|---|---|
| **GL Entries** | 7 years (post-closure) | MRA | IMMUTABLE | Never delete; mark historical |
| **Invoices** | 7 years | Companies Act 2001 | IMMUTABLE | Keep PDFs for 7 years |
| **Bank Transactions** | 7 years | MRA | IMMUTABLE | Import reconciliation data |
| **Payroll Records** | 5 years (post-termination) | Labor law, PAYE | IMMUTABLE | Employee records 5y, GL 7y |
| **Tax Declarations (PAYE)** | 7 years | MRA | IMMUTABLE | Keep proof of filing |
| **Audit Logs (GL changes)** | 7 years | Compliance | IMMUTABLE | Track all modifications |
| **Access Logs (logins, IP)** | 2 years | Security | DELETABLE | Purge after 2 years |
| **System Backups** | 90 days rolling | Disaster recovery | ENCRYPTED | Old backups auto-deleted |
| **Email (transactional)** | 1 year | Dispute resolution | DELETABLE | Purge after 1 year |
| **Temporary files (cache)** | 30 days | System performance | DELETABLE | Auto-cleanup |

### 3.2 Retention Timeline Example

**Example: Company ABC closes GL for Year 2025**

```
Timeline:

Month: Close GL (Dec 31, 2025)
├─ GL Status: closed (locked for editing)
├─ Audit trail: Complete history 2025-01-01 to 2025-12-31
├─ Retention clock: STARTS NOW
└─ Retention deadline: Dec 31, 2032 (7 years later)

Year 1: 2025-12-31 to 2026-12-31
├─ Status: Retained in production database
├─ Access: Auditors, company personnel can view
├─ Backup: Daily backup (90-day rolling, 7-year archive)
└─ Action: None (keep as-is)

Year 3: 2025-12-31 to 2028-12-31
├─ Status: Still retained in production
├─ Access: Still available to company, auditors
├─ Backup: Still in archive
└─ Action: None (keep as-is)

Year 6: 2025-12-31 to 2031-12-31
├─ Status: Approaching retention deadline
├─ Access: Still available
├─ Flag: "Retention expiring in 1 year" (system warning)
└─ Action: Plan for deletion/archival

Year 7: 2025-12-31 to 2032-12-31
├─ Status: Last year of retention
├─ Access: Still available
├─ Notice: "Retention expires in 1 month"
└─ Action: Notify customer of approaching deletion

Year 7+ (After 2032-12-31):
├─ Status: Eligible for deletion
├─ Decision: Keep longer (if audit pending) or delete
├─ Action: Cryptographic deletion (if approved by Directeur)
└─ Certificate: Deletion certificate signed by compliance officer
```

### 3.3 Retention Override (Legal Hold)

**Records can be held beyond normal retention if:**

```
LITIGATION HOLD:
├─ Reason: Lawsuit involving customer financial data
├─ Duration: Until litigation ends + 6 months
├─ Status: "Legal hold" flag prevents automatic deletion
├─ Example: Customer suing for invoice non-payment
│  ├─ Hold GL entries related to that invoice
│  ├─ Hold payment records
│  ├─ Hold all related correspondence
│  └─ Release hold when lawsuit settles

REGULATORY INVESTIGATION:
├─ Reason: MRA auditing specific years
├─ Duration: Until audit complete + 1 year
├─ Status: "Audit hold" flag prevents deletion
├─ Example: MRA reviewing 2024 PAYE filings
│  ├─ Hold all GL entries (2024)
│  ├─ Hold payroll records (2024)
│  ├─ Hold PAYE declarations & payments
│  └─ Release when audit concludes

FRAUD INVESTIGATION:
├─ Reason: Suspected fraudulent transaction
├─ Duration: Investigation + 2 years
├─ Status: "Investigation hold" flag prevents deletion
├─ Example: Suspected invoice fraud (fake supplier)
│  ├─ Hold all invoice records (related to supplier)
│  ├─ Hold all GL entries (posting those invoices)
│  ├─ Hold all payment records
│  ├─ Hold audit logs (who created invoice)
│  └─ Release when investigation concludes + 2 years
```

---

## 4. IMMUTABILITY & NON-REPUDIATION

### 4.1 Immutability Principle

**Once posted, GL entries cannot be modified or deleted:**

```
GL Entry Lifecycle:

DRAFT (Editable):
├─ Status: draft
├─ Can edit: YES (amount, account, reference)
├─ Can delete: YES (if not approved yet)
├─ Can approve: YES (Directeur approval)
└─ Example: GL entry created, waiting for approval

POSTED (Immutable):
├─ Status: posted
├─ Can edit: NO (immutable after posting)
├─ Can delete: NO (cannot be removed)
├─ Can reverse: YES (create reversal entry)
├─ Example: GL entry approved and posted to ledger
│
└─ If error discovered:
   ├─ Option 1: Create reversal (post negative entry)
   │  └─ Reversal = new GL entry (not modification)
   ├─ Option 2: Create correction (post positive entry)
   │  └─ Correction = new GL entry (not modification)
   └─ Result: 3 entries in ledger (original + reversal + correction)
              All visible in audit trail, none deleted

CLOSED (Locked):
├─ Status: closed (month-end)
├─ Can edit: NO (month is locked)
├─ Can reverse: YES (if absolutely necessary)
├─ Can query: YES (audit trail available)
└─ Example: December GL closed, cannot add Jan entries retroactively
```

**Why Immutability Matters:**

```
AUDITOR'S REQUIREMENT:
├─ "I need to know: What GL entries were posted in December 2025?"
├─ System response:
│  ├─ Shows original entry
│  ├─ Shows reversal (if error corrected)
│  ├─ Shows correction (if error corrected)
│  └─ Audit trail: Who created? Who approved? When?
│
└─ Auditor confidence: "I can trust this ledger has not been tampered with"

FORENSIC REQUIREMENT:
├─ "There's an audit discovery: Invoice from fake supplier #INV-2026-0123"
├─ System response:
│  ├─ Find GL entries related to invoice
│  ├─ Show all modifications (reversal, correction)
│  ├─ Show audit trail (who created? from what IP?)
│  ├─ Show if entry was ever deleted (it wasn't, immutable)
│  └─ Enable fraud investigation
│
└─ Fraud control: "Fraudster cannot hide evidence by deleting GL"

REGULATORY REQUIREMENT:
├─ "MRA auditor: Show me all GL entries for account 6200 (salaries)"
├─ System response:
│  ├─ Complete list (nothing hidden or deleted)
│  ├─ Audit trail (all modifications visible)
│  ├─ Approval chain (who authorized each entry)
│  └─ Supporting docs (invoice links, payroll links)
│
└─ Compliance: "All GL entries preserved for 7 years"
```

### 4.2 Non-Repudiation

**Users cannot deny their actions (non-repudiation):**

```
SCENARIO: Comptable posts GL entry, then claims "I didn't do that"

PROOF OF AUTHORSHIP:
├─ Email: comptable@company.mu (unique identifier)
├─ Timestamp: 2026-05-20 10:15:30 UTC (exact moment)
├─ IP address: 196.203.45.67 (device location)
├─ Password hash: Entry requires login (password verified)
├─ Multi-factor: If MFA enabled, SMS/TOTP verified
└─ Audit trail: Immutable record (cannot be altered)

CRYPTOGRAPHIC PROOF:
├─ Signature: GL entry signed with user's session token
├─ Verification: Token matches (proves user was logged in)
├─ Audit log checksum: Hash of entire audit log (proves not altered)
└─ Tamper detection: If checksum changes, tampering detected

LEGAL WEIGHT:
├─ Auditor can attest: "Comptable created this entry" (with proof)
├─ Court would accept: Timestamp + IP + password hash as evidence
├─ Non-repudiation: Comptable cannot deny authorship (too much proof)
└─ Accountability: User takes responsibility for their actions
```

---

## 5. DATA DISPOSAL PROCEDURES

### 5.1 Secure Deletion Process

**When retention period expires, data is securely deleted:**

```
RETENTION EXPIRY PROCESS:

T-60 days (Warning period):
├─ System sends notification: "Retention expires in 60 days"
├─ Email to: Compliance Officer
├─ Action: Schedule deletion review
└─ Flag: "Retention expiring" flag set in system

T-30 days:
├─ Second notification: "Retention expires in 30 days"
├─ Email to: Compliance Officer + Customer
├─ Action: Final review (any legal holds?)
└─ Flag: "Deletion pending" flag set

T-7 days:
├─ Final notification: "Retention expires in 7 days"
├─ Email to: Compliance Officer + CFO
├─ Action: CEO approval required (for data deletion)
└─ Decision: Approve deletion or extend hold?

T-0 (Deletion date):
├─ Compliance Officer approves: "Data eligible for deletion"
├─ CFO approves: "No financial reason to retain longer"
├─ System initiates: Cryptographic deletion process
└─ Duration: <1 hour (all encrypted keys destroyed)

T+1 (After deletion):
├─ Deletion certificate generated: Signed by Compliance Officer + CFO
├─ Certificate includes:
│  ├─ What data was deleted
│  ├─ When it was deleted
│  ├─ How it was deleted (cryptographic key destruction)
│  ├─ Verification: No residual copies found
│  └─ Approvers: Who signed off on deletion?
├─ Archive deletion certificate: 3-year retention (proof of deletion)
└─ Communication: Notify customer (if applicable)
```

### 5.2 Cryptographic Deletion

**How data is securely deleted:**

```
BEFORE DELETION:
├─ Data: Salary 50,000 MUR (encrypted with Key_V1)
├─ Key: Key_V1 stored in AWS Secrets Manager
└─ Data readable: Yes (if key is present)

DELETION PROCESS:
├─ Step 1: Revoke Key_V1 from AWS Secrets Manager
├─ Step 2: Delete all references to Key_V1 (system + backup)
├─ Step 3: Verify Key_V1 is not in any backup or escrow
├─ Step 4: Update system log: "Key_V1 deleted at 2026-05-22 14:00:00"
└─ Step 5: Generate deletion certificate

AFTER DELETION:
├─ Data: Still on disk (encrypted with non-existent Key_V1)
├─ Key: GONE (cannot be recovered)
├─ Data readable: NO (key is destroyed)
├─ Security: Data is unrecoverable
│  ├─ Cannot brute-force (256-bit keys, 2^256 possibilities)
│  ├─ Cannot recover key (destroyed, no backup)
│  └─ Cannot decrypt (key doesn't exist anymore)
└─ Result: Effective data deletion (cryptographically secure)

WHY THIS IS BETTER THAN FILE DELETION:
├─ File deletion only removes file system pointers
├─ Data is still on disk (recoverable with forensics)
├─ Cryptographic deletion makes data unreadable
├─ Even if attacker steals the disk, key is destroyed
└─ Data is truly gone (no recovery possible)
```

### 5.3 Deletion Verification

**Process to verify data has been deleted:**

```
VERIFICATION STEPS:

1. Query database:
   ├─ SELECT * FROM employes WHERE employee_id = 'X' AND hired_date < 2021;
   ├─ Result: No rows returned (employee data deleted)
   └─ Verification: Data is not in production DB

2. Check backups:
   ├─ Restore oldest archive backup (monthly backup from 7+ years ago)
   ├─ Query restored backup: Same query as above
   ├─ Result: No rows returned (data deleted from archive too)
   └─ Verification: Data is not in any backup copy

3. Check escrow keys:
   ├─ List all encryption keys in AWS Secrets Manager
   ├─ Verify Key_V1 is NOT in list
   ├─ Verify Key_V2, Key_V3, etc. are only active keys
   └─ Verification: Old key is truly deleted

4. Check audit trail:
   ├─ Review audit logs: Last access to deleted employee record = [date]
   ├─ Review deletion log: "Key_V1 deleted at 2026-05-22 14:00:00"
   ├─ Verify: No access attempts after deletion date
   └─ Verification: Data deletion is complete & logged

5. Third-party audit:
   ├─ Annual SOC 2 audit verifies deletion procedures
   ├─ Auditor confirms: Cryptographic deletion is properly implemented
   ├─ Auditor certifies: Data cannot be recovered
   └─ Verification: Independent confirmation
```

---

## 6. AUDIT TRAIL ACCESS & EXPORT

### 6.1 Who Can Access Audit Trails?

**Access Control:**

```
CUSTOMER EMPLOYEES:
├─ Directeur (Finance Director): Full access to own company's audit trail
├─ Comptable (Accountant): Full access to GL audit trail
├─ Authorized HR Manager: Access to payroll audit trail
└─ Restriction: Cannot access other companies' audit trails

EXTERNAL AUDITORS:
├─ Big 4 Audit Firm: Read-only access to all audit trails
├─ Scope: Only GL, invoices, bank, payroll (no employee PII except as needed)
├─ Duration: Temporary (account expires after audit)
├─ Logging: All auditor queries logged (auditors audited)
└─ Restriction: Cannot modify or export without customer consent

MRA AUDITORS:
├─ Mauritius Revenue Authority: Read-only access (if legally demanded)
├─ Scope: Only tax-related data (PAYE, VAT, declarations)
├─ Legal basis: Tax authority subpoena or authorized request
├─ Logging: All access logged & provided to customer
└─ Restriction: Cannot be used for other purposes

LEXORA PERSONNEL:
├─ Compliance Officer: Access to audit logs for monitoring
├─ Security Officer: Access to security incidents & breaches
├─ DevOps Lead: Access for system troubleshooting (with approval)
├─ CEO: Access only (review, not daily access)
└─ Restriction: No direct access to customer GL (only aggregated reports)

WHO CANNOT ACCESS:
├─ ❌ Comptable cannot access other companies' GL
├─ ❌ Comptable Agent cannot access audit trails (read reports only)
├─ ❌ Former employees (access revoked upon termination)
├─ ❌ Vendors (cannot access customer data)
└─ ❌ Public users (not authenticated)
```

### 6.2 Audit Trail Export

**Customers can export their audit trail:**

```
EXPORT PROCEDURE:

Step 1: Request (Customer initiates)
├─ Dashboard → Settings → Audit Trail → Export
├─ Select date range: From [date] to [date]
├─ Select data types: GL only, or GL + Invoices + Bank?
├─ Select format: CSV, JSON, or PDF?
└─ Click "Request Export"

Step 2: Processing (System generates)
├─ System compiles audit trail records
├─ System encrypts export file (AES-256)
├─ System generates secure download link (expires in 7 days)
├─ System sends email: "Your audit trail export is ready"
└─ Timeline: Usually within 15 minutes

Step 3: Download (Customer retrieves)
├─ Click link in email (or dashboard)
├─ Download encrypted file (e.g., audit_trail_2026-05-20.csv.enc)
├─ Optional: System provides decryption key
└─ Responsibility: Customer's responsibility to store securely

Step 4: Audit Trail Record
├─ Log the export request: Who, when, what data, approvals
├─ System records: File hash (checksum)
├─ System verifies: Export was complete & integral
└─ Retention: Export log kept for 3 years

EXPORT LIMITATIONS:
├─ Cannot export: Other customers' data (multi-tenant isolation)
├─ Cannot export: Sensitive data without approval (salary needs HR approval)
├─ Cannot export: Unredacted employee PII (names masked, if requested)
└─ Can export: All GL, invoices, bank, payroll (customer's own data)
```

### 6.3 Auditor Access to Audit Trail

**How auditors access audit trail:**

```
BIG 4 AUDITOR ACCESS:

Setup:
├─ Customer grants access: Dashboard → Settings → Auditor Access
├─ Create auditor account: "John Doe, Big 4 Firm"
├─ System generates temporary credentials: Valid for audit period
├─ Email: Auditor receives login link (expires 7 days)
└─ Login: Auditor creates password (12+ characters, MFA required)

Access:
├─ Auditor can view:
│  ├─ GL entries (all, with full audit trail)
│  ├─ Invoice records (all, with audit trail)
│  ├─ Bank transactions (all, with audit trail)
│  ├─ Payroll records (summary, with audit trail)
│  └─ Audit logs (who did what, when, IP address)
├─ Auditor cannot:
│  ├─ Modify any data (read-only enforced by database)
│  ├─ Delete any data (no delete permission)
│  ├─ Export without approval (cannot copy large datasets)
│  └─ Access other customers' data (RLS enforced)
└─ Auditor logging:
   ├─ Every query logged (what did auditor look at?)
   ├─ Every download logged (what did auditor export?)
   ├─ Session times logged (when was auditor active?)
   └─ IP addresses logged (from where did auditor access?)

Export by Auditor:
├─ Request: Auditor initiates export via Dashboard
├─ Approval: Customer must approve export (email confirmation)
├─ Process: System generates export & sends to auditor
├─ Logging: Export logged with approval & auditor signature
└─ Retention: Export request kept for 3 years

Deactivation:
├─ Audit ends: Customer deactivates auditor account
├─ Automatic: Account expires on [date] (if not deactivated)
├─ Access cut: Auditor can no longer login
├─ Data: All auditor queries remain in audit trail (forever)
└─ Report: Customer receives log of all auditor activity
```

---

## 7. COMPLIANCE & REGULATIONS

### 7.1 Mauritian Legal Requirements

**MRA (Mauritius Revenue Authority) Requirements:**

```
COMPANIES ACT 2001:
├─ Accounting records: Must be kept for 5 years (minimum)
├─ Lexora retention: 7 years (exceeds requirement)
├─ GL entries: Must be kept in legible form (electronic OK)
├─ Approval workflow: GL must be approved (enforced by Lexora)
└─ Audit trail: Modifications must be traceable (immutable logs)

VAT ACT:
├─ VAT records: Must be kept for 6 years (minimum)
├─ Lexora retention: 7 years (exceeds requirement)
├─ Invoice records: Invoices + supporting docs required
├─ VAT journals: VAT entries must be tracked separately
└─ Audit trail: VAT modifications traceable

PERSONAL DATA PROTECTION ACT 2017 (Mauritian GDPR equivalent):
├─ Employee data: Must be kept only as long as necessary
├─ Lexora retention: 5 years post-termination (compliant)
├─ Right to erasure: Employees can request deletion (except legal hold)
├─ Audit trail: Modifications to personal data logged
└─ Security: Data must be encrypted (AES-256 implemented)

MRA AUDIT COOPERATION:
├─ Auditor rights: MRA can demand access to GL, invoices, records
├─ Lexora obligation: Provide read-only auditor account within 24 hours
├─ Data access: MRA can export relevant records for investigation
├─ Timeline: MRA audit procedures must be accommodated
└─ Retention: Records must not be deleted during audit period
```

### 7.2 International Standards (GDPR, if applicable)

**European Union GDPR Requirements:**

```
ARTICLE 5: DATA PRINCIPLES
├─ Lawfulness: Data collected only with legal basis
├─ Fairness: Transparency (privacy notice provided)
├─ Purpose limitation: Used only for stated purpose
├─ Data minimization: Collect only necessary data
├─ Accuracy: Data kept accurate & up to date
├─ Storage limitation: Kept only as long as necessary
└─ Integrity & confidentiality: Encrypted, secure

ARTICLE 28: DATA PROCESSOR RESPONSIBILITIES
├─ Lexora is processor (customer is controller)
├─ DPA signed: Standard Contractual Clauses in place
├─ Sub-processors: All sub-processors have signed agreements
├─ Security measures: AES-256 encryption, TLS 1.3, access controls
├─ Audit assistance: Lexora assists with audits & data subject requests
└─ Breach notification: 72-hour notification procedure in place

ARTICLE 32: SECURITY MEASURES
├─ Encryption: AES-256 at rest, TLS 1.3 in transit
├─ Pseudo-anonymization: High-sensitivity data double-encrypted
├─ Confidentiality: Access controls, role-based permissions
├─ Integrity: Audit trails, immutability, checksums
├─ Testing: Annual penetration tests, quarterly vulnerability scans
└─ Incident response: 24/7 monitoring, 15-minute response time

ARTICLE 33: BREACH NOTIFICATION
├─ Timeframe: Notify within 72 hours of discovery
├─ Content: Nature of breach, likely consequences, measures taken
├─ Method: Formal notification to data protection authority
└─ Evidence: Incident report, forensics, root cause analysis
```

---

## 8. AUDIT TRAIL IMPLEMENTATION

### 8.1 Current Implementation Status

**As of May 2026:**

```
IMPLEMENTED ✅:
├─ GL entry logging: Who created, when, amount, account
├─ Invoice logging: Creation, approval, payment tracking
├─ User access logging: Login/logout, IP address
├─ Database backup logging: Backup dates, success/failure
├─ System event logging: Configuration changes, security events
└─ Retention: Data deleted after retention period expires

PHASE 2 IMPROVEMENTS (Q3 2026):
├─ audit_logs table: Centralized audit trail
├─ GL modification tracking: Change history (old value → new value)
├─ Approval workflow logging: Full approval chain with timestamps
├─ API audit trail: /api/audit/trail endpoint for auditors
├─ Compliance dashboard: Audit trail visibility for customers
└─ Export capability: Customer can export full audit trail

FUTURE ENHANCEMENTS (Q4 2026):
├─ Cryptographic signatures: GL entries signed (non-repudiation)
├─ Integrity verification: Merkle tree checksums
├─ Real-time alerting: Suspicious activity detected & flagged
├─ Compliance reports: Auto-generated audit readiness reports
└─ Blockchain audit trail: (Optional) Immutable ledger of critical entries
```

### 8.2 Audit Trail Data Structure

**What gets logged:**

```sql
-- AUDIT_LOGS table (to be created in Phase 2)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  societe_id UUID NOT NULL,                    -- Company ID (multi-tenant)
  action_type VARCHAR(50),                    -- "GL_ENTRY_CREATED", "GL_ENTRY_APPROVED", etc.
  resource_type VARCHAR(50),                  -- "GL_ENTRY", "INVOICE", "USER", etc.
  resource_id UUID,                           -- ID of affected resource
  user_id UUID,                               -- Who performed action
  user_email VARCHAR(255),                    -- For audit trail readability
  timestamp TIMESTAMP WITH TIME ZONE,         -- When (UTC)
  ip_address INET,                            -- From where
  old_value TEXT,                             -- Before (for updates)
  new_value TEXT,                             -- After (for updates)
  change_reason TEXT,                         -- Why (e.g., "Invoice payment received")
  status VARCHAR(50),                         -- "success", "failed", etc.
  error_message TEXT,                         -- If failed, why?
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for fast querying
  INDEX (societe_id),
  INDEX (resource_type),
  INDEX (user_id),
  INDEX (timestamp),
  CONSTRAINT fk_societe FOREIGN KEY (societe_id) REFERENCES societes(id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- AUDIT_TRAIL_INTEGRITY table (to prevent tampering)
CREATE TABLE audit_trail_integrity (
  id UUID PRIMARY KEY,
  societe_id UUID NOT NULL,
  date DATE,                                   -- Date of audit trail
  entry_count INT,                            -- Number of entries that day
  checksum VARCHAR(256),                      -- SHA-256 hash of all entries
  verified_at TIMESTAMP,                      -- When checksum was verified
  verified_by UUID,                           -- Who verified it
  
  INDEX (societe_id),
  INDEX (date)
);
```

### 8.3 Audit Trail Query Examples

**How auditors query the audit trail:**

```sql
-- Example 1: "Show me all GL entries created by comptable@company.mu"
SELECT * FROM ecritures_comptables_v2
WHERE created_by = 'comptable@company.mu'
  AND created_at BETWEEN '2026-05-01' AND '2026-05-31'
ORDER BY created_at DESC;

-- Example 2: "Show me all modifications to GL entry ECC-2026-00047"
SELECT * FROM audit_logs
WHERE resource_type = 'GL_ENTRY'
  AND resource_id = 'ECC-2026-00047'
ORDER BY timestamp;

-- Result shows:
-- T1: created_by=comptable, action=GL_ENTRY_CREATED, status=draft
-- T2: created_by=comptable, action=GL_ENTRY_MODIFIED, change=amount 50000→40000
-- T3: created_by=directeur, action=GL_ENTRY_APPROVED, status=posted
-- ... (all modifications visible, none deleted)

-- Example 3: "Show me all user logins for user comptable@company.mu in May"
SELECT * FROM audit_logs
WHERE action_type = 'USER_LOGIN'
  AND user_email = 'comptable@company.mu'
  AND timestamp BETWEEN '2026-05-01' AND '2026-06-01'
ORDER BY timestamp;

-- Result shows:
-- 2026-05-01 09:15: LOGIN from 196.203.45.67 (success)
-- 2026-05-01 09:16: LOGIN from 196.203.45.67 (success, same device)
-- 2026-05-02 08:30: LOGIN from 196.203.45.67 (success)
-- 2026-05-02 17:20: LOGOUT
-- ... (complete login history)

-- Example 4: "Show me all invoices not yet matched to GL"
SELECT f.id, f.facture_date, f.montant, COUNT(ec.id) as gl_entries
FROM factures f
LEFT JOIN ecritures_comptables_v2 ec ON f.id = ec.reference
WHERE f.societe_id = 'DDS_001'
  AND MONTH(f.facture_date) = 5
GROUP BY f.id
HAVING COUNT(ec.id) = 0;  -- No GL entries found

-- Result shows unmatched invoices (potential control failure)
```

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial document | Compliance Officer |

**Approval:**

- [ ] Lexora Board
- [ ] MRA Liaison Officer
- [ ] Big 4 Audit Firm

**Next Review**: May 22, 2027 (or upon audit findings)

---

**END OF AUDIT TRAIL & RECORD RETENTION POLICY**

*For audit trail export requests: compliance@lexora.mu*  
*For retention questions: legal@lexora.mu*
