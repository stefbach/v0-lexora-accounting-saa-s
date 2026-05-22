# Privacy Policy & GDPR Compliance Documentation
## Lexora Accounting SaaS Platform

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Jurisdiction**: Mauritius, European Union (GDPR)  
**Prepared for**: Big 4 Audit Compliance  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Data Controller & Processor Responsibilities](#data-controller--processor-responsibilities)
3. [Categories of Personal Data](#categories-of-personal-data)
4. [Legal Basis for Processing](#legal-basis-for-processing)
5. [Data Retention & Deletion](#data-retention--deletion)
6. [Data Security & Encryption](#data-security--encryption)
7. [User Rights & Access Requests](#user-rights--access-requests)
8. [Data Breach Notification Procedures](#data-breach-notification-procedures)
9. [Third-Party Data Sharing](#third-party-data-sharing)
10. [GDPR Compliance Checklist](#gdpr-compliance-checklist)
11. [Appendices](#appendices)

---

## 1. EXECUTIVE SUMMARY

### 1.1 System Purpose

**Lexora** is a cloud-based accounting SaaS platform designed specifically for Mauritian businesses. The platform facilitates:
- General ledger management
- Invoice processing (customer & supplier)
- Bank reconciliation
- Payroll management
- Tax compliance (MRA filing)
- Financial reporting

### 1.2 Data Handling Philosophy

Lexora operates under the principle of **data minimization**:
- Collect only data necessary for accounting/compliance
- Store data only as long as legally required
- Encrypt all data at rest and in transit
- Limit access to authorized personnel only
- Enable customers to control their own data

### 1.3 Regulatory Scope

| Jurisdiction | Applies | Standards |
|---|---|---|
| **Mauritius** | Yes (Primary) | Companies Act 2001, VAT Act, Personal Data Protection Act 2017 |
| **European Union** | Yes (if EU clients) | GDPR (General Data Protection Regulation) |
| **United Kingdom** | Yes (if UK clients) | UK GDPR, Data Protection Act 2018 |
| **Global** | Partial | Best practices alignment (ISO 27001 controls) |

---

## 2. DATA CONTROLLER & PROCESSOR RESPONSIBILITIES

### 2.1 Data Controller: Customer Organizations

**Each Lexora customer is the DATA CONTROLLER** for their own accounting data:

```
Data Controller = Customer Organization (e.g., DDS Mauritius Ltd)
├─ Responsible for: data collection consent, legal basis, retention policies
├─ Must provide: privacy notice to employees/suppliers
└─ Auditable under: GDPR Article 28 (if EU GDPR applies)
```

**Controller Obligations:**
- Maintain records of processing activities (ROPA - Record of Processing Activities)
- Conduct Data Impact Assessments (DPIA) if processing reveals sensitive data
- Document consent for personal data collection (employees, suppliers)
- Ensure data subject rights are honored (access, erasure, portability)
- Notify data subjects of privacy practices

### 2.2 Data Processor: Lexora SaaS

**Lexora is the DATA PROCESSOR** for customer data:

```
Data Processor = Lexora SaaS Platform
├─ Responsible for: secure storage, encryption, access controls
├─ Must provide: Data Processing Agreement (DPA)
└─ Auditable under: GDPR Article 28 (Processor responsibilities)
```

**Processor Obligations:**
- Process data only per customer instructions
- Implement technical & organizational security measures
- Ensure sub-processor agreements are in place
- Assist with data subject access requests
- Enable data portability (export in machine-readable format)
- Delete or return data upon customer request
- Undergo regular security audits

### 2.3 Data Processing Agreement (DPA)

**Lexora provides a standard DPA covering:**
- Processing instructions (EU GDPR Article 28(3))
- Sub-processor management (Article 28(2) & 28(4))
- Data subject rights assistance (Articles 12-22)
- Security measures (Article 32)
- Data breach notification (Article 33)
- Data portability assistance (Article 20)
- Audit rights for customers & regulators (Article 28(3)(h))

**DPA Location**: `/legal/DPA_LEXORA_STANDARD.pdf` (to be executed at contract)

---

## 3. CATEGORIES OF PERSONAL DATA

### 3.1 Employee Data (Payroll Module)

**Why Collected**: Salary calculation, tax withholding, statutory reporting

| Data Element | Format | Sensitivity | Examples |
|---|---|---|---|
| **Name** | Text | Medium | John Doe, Marie Dubois |
| **Employee ID** | String | Low | EMP-001, SAL-2026-001 |
| **Email** | Email | Medium | john.doe@company.mu |
| **Phone** | Text | Medium | +230 57 123 456 |
| **National ID** | String | HIGH | [Mauritian ID Card Number] |
| **Bank Account** | String | HIGH | [Account for salary transfer] |
| **Salary** | Decimal | HIGH | MUR 45,000 monthly |
| **Tax ID** | String | Medium | [MRA Tax File Number] |
| **Deductions** | Decimal | HIGH | PAYE, CSG, NSF, insurance |
| **Emergency Contact** | Text | Medium | Spouse, parent names/phone |

**Legal Basis**: 
- **Contractual**: Necessary to perform employment contract (GDPR Article 6(1)(b))
- **Legal Obligation**: MRA tax reporting, CSG/NSF contributions (Article 6(1)(c))

**Data Retention**: 5 years (per Mauritian labor law & MRA records retention)

### 3.2 Company Data (GL Module)

**Why Collected**: Financial record keeping, audit compliance, tax filing

| Data Element | Format | Sensitivity | Examples |
|---|---|---|---|
| **Company Name** | Text | Low | DDS Mauritius Ltd |
| **Company Registration** | String | Low | [BRN: Business Registration Number] |
| **Address** | Text | Low | Port Louis, Mauritius |
| **VAT Number** | String | Low | MU[VAT-ID] |
| **Contact Person** | Text | Medium | Directeur, Comptable name |
| **Email** | Email | Medium | contact@company.mu |
| **Phone** | Text | Medium | +230 5X XXX XXXX |

**Legal Basis**: 
- **Contractual**: Required for SaaS service (GDPR Article 6(1)(b))
- **Legal Obligation**: VAT registration, Companies Act filing (Article 6(1)(c))

**Data Retention**: 7 years (per MRA & Mauritian Companies Act)

### 3.3 Financial Transaction Data (Invoices, Bank Transactions)

**Why Collected**: Revenue recognition, expense tracking, bank matching

| Data Element | Format | Sensitivity | Examples |
|---|---|---|---|
| **Invoice Number** | String | Low | INV-2026-0001 |
| **Supplier/Customer Name** | Text | Low | Supplier Corp Ltd |
| **Supplier/Customer Contact** | Email/Phone | Medium | supplier@co.mu |
| **Amount** | Decimal | Medium | MUR 100,000 |
| **Currency** | String | Low | MUR, USD, EUR |
| **Date** | Date | Low | 2026-05-22 |
| **Description** | Text | Low | Office supplies, consulting |
| **Bank Details** (supplier) | String | HIGH | Account number, routing |
| **VAT** | Decimal | Medium | 15% standard rate |

**Legal Basis**: 
- **Legal Obligation**: Tax records, business registration (Article 6(1)(c))
- **Legitimate Interest**: Contract performance (Article 6(1)(f))

**Data Retention**: 7 years (per MRA financial records retention)

### 3.4 User Access Data (System Logs)

**Why Collected**: Audit trail, system security, compliance verification

| Data Element | Format | Sensitivity | Examples |
|---|---|---|---|
| **User ID** | String | Medium | user-12345 |
| **Username/Email** | Email | Medium | comptable@company.mu |
| **Login Timestamp** | DateTime | Low | 2026-05-22 09:15:30 UTC |
| **IP Address** | IPv4/IPv6 | Medium | 102.123.45.67 |
| **Action Performed** | Text | Low | "Created invoice INV-001" |
| **Data Modified** | Text | Medium | GL entry IDs, invoice IDs |
| **Timestamp** | DateTime | Low | 2026-05-22 09:15:45 UTC |

**Legal Basis**: 
- **Legal Obligation**: Audit trail enforcement, fraud prevention (Article 6(1)(c))
- **Legitimate Interest**: System security (Article 6(1)(f))

**Data Retention**: 7 years (per audit & compliance requirements)

### 3.5 Data NOT Collected

Lexora **explicitly does NOT collect:**
- ❌ Biometric data (fingerprints, facial recognition)
- ❌ Health/medical information
- ❌ Political affiliations or beliefs
- ❌ Religious/philosophical beliefs
- ❌ Trade union membership
- ❌ Criminal convictions (except as required by law)
- ❌ Racial/ethnic origin (except name as required for payroll)
- ❌ Sexual orientation
- ❌ Genetic data
- ❌ Marketing cookies (system-only, first-party)
- ❌ Third-party tracking scripts

---

## 4. LEGAL BASIS FOR PROCESSING

### 4.1 Legitimate Reasons to Process Data

**Article 6 of GDPR lists 6 lawful bases:**

| Base | Data Type | Example | Duration |
|---|---|---|---|
| **Consent** | Optional preferences | "Remember me" cookie | Until withdrawn |
| **Contract** | Service data | Email, company info for SaaS | Contract duration |
| **Legal Obligation** | Tax, labor data | Employee names, salaries for MRA | 5-7 years |
| **Vital Interests** | Emergency contacts | Spouse/parent phone for HR | As needed |
| **Public Task** | N/A (not a government) | N/A | N/A |
| **Legitimate Interest** | System security, analytics | IP logs for fraud prevention | 7 years |

**Lexora's Primary Bases:**
1. **Contractual** (Article 6(1)(b)): Service delivery, user account management
2. **Legal Obligation** (Article 6(1)(c)): MRA compliance, tax reporting, audit trails
3. **Legitimate Interest** (Article 6(1)(f)): System security, fraud prevention, product improvement

### 4.2 Consent NOT Required For:

- ✅ Employee payroll processing (contractual necessity)
- ✅ Tax withholding & MRA reporting (legal obligation)
- ✅ Bank reconciliation (contractual necessity)
- ✅ Invoice storage & GL posting (contractual necessity)
- ✅ System audit logs (legal obligation & security)

### 4.3 Consent IS Required For:

- Optional marketing emails (newsletter signup)
- Optional product analytics beyond security logs
- Optional integration with third-party services
- Any processing beyond those described in this policy

---

## 5. DATA RETENTION & DELETION

### 5.1 Retention Schedules by Data Type

| Data Type | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| **Employee Payroll** | 5 years post-employment | Mauritian Labor Law | Cryptographic deletion |
| **Financial Records** | 7 years post-transaction | MRA Legal Requirement | Cryptographic deletion |
| **Tax Returns (PAYE)** | 7 years after filing | MRA Legal Requirement | Cryptographic deletion |
| **Invoice/GL Entries** | 7 years post-posting | MRA Audit File | Immutable (no deletion) |
| **User Audit Logs** | 7 years | Audit trail requirement | Cryptographic deletion |
| **Bank Statements (OCR)** | 7 years | MRA + Banking regulations | Cryptographic deletion |
| **System Backups** | 90 days rolling | Disaster recovery | Automatic purge |
| **Access Logs (IP, login)** | 2 years | Security incident response | Cryptographic deletion |
| **Transactional Emails** | 1 year | Dispute resolution | Automatic deletion |
| **Personal Preferences** | Contract duration | User choice | Immediate deletion |

### 5.2 Post-Retention Data Handling

**Once retention period expires:**

1. **Immediate Deletion** (Low sensitivity):
   - User preferences, temporary settings
   - Transactional emails
   - System logs beyond 2 years

2. **Scheduled Batch Deletion** (Medium sensitivity):
   - Access logs > 2 years
   - Employee data > 5 years post-termination
   - Processed through cryptographic key deletion

3. **Immutable Retention** (HIGH sensitivity - Required by law):
   - GL entries (ecritures_comptables_v2)
   - Invoice records (factures)
   - Bank transactions (transactions_bancaires)
   - Tax filings & MRA submissions
   - Audit logs (cannot be deleted, only marked historical)

### 5.3 Customer Requested Deletion

**Customers can request deletion of their own data:**

**Process:**
1. Submit formal request to: `privacy@lexora.mu` (to be established)
2. Verification: Confirm customer identity (account owner only)
3. Assessment: Identify data subject to deletion vs. legal hold
4. Execution: Delete non-immutable data within 30 days
5. Confirmation: Provide deletion report to customer

**Exceptions (Data NOT Deleted Even if Requested):**
- Financial records required for MRA (7-year hold)
- Audit logs required for compliance (7-year hold)
- GL entries (immutable per COSO framework)
- Data under legal dispute or litigation hold
- Data required for fraud investigation (up to 10 years)

### 5.4 Automatic Deletion Procedures

**Implemented Controls:**

```sql
-- Daily automated cleanup (scheduled at 02:00 UTC)
DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '2 years';
DELETE FROM user_preferences WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '90 days';
DELETE FROM transactional_emails WHERE sent_at < NOW() - INTERVAL '1 year';

-- Monthly notification for retention warnings
SELECT users.email, COUNT(*) as records_to_delete
FROM employee_records
WHERE termination_date < NOW() - INTERVAL '5 years'
  AND deletion_scheduled = FALSE
GROUP BY users.email;
```

**Backup Deletion:**
- Full backup retention: 90 days rolling
- After 90 days: Previous backups overwritten
- Immutable backup: 1 copy retained for disaster recovery

---

## 6. DATA SECURITY & ENCRYPTION

### 6.1 Encryption Standards

**At Rest (Database):**
- **Standard**: AES-256 bit encryption
- **Implementation**: PostgreSQL transparent data encryption (TDE) via Supabase
- **Key Management**: Provider-managed (Supabase handles key rotation quarterly)
- **Coverage**: All customer data in database tables

**In Transit (Network):**
- **Standard**: TLS 1.3 (minimum)
- **Implementation**: HTTPS only on all endpoints
- **Certificates**: Let's Encrypt (auto-renewed)
- **Enforcement**: HTTP → HTTPS 301 redirect on all routes

**Sensitive Fields (Additional Layer):**
- Bank account numbers: Masked display (show last 4 digits only)
- National IDs: Stored hashed (PBKDF2 with salt)
- Tax IDs: Indexed but encrypted for search
- Salaries: Encrypted per GDPR guidance on sensitive data

### 6.2 Key Management

**Encryption Key Rotation Schedule:**

| Key Type | Rotation Frequency | Responsibility | Approval |
|---|---|---|---|
| **Database Keys** | Quarterly | Supabase (automated) | Lexora Ops verified |
| **API Keys** | Semi-annually | Lexora Ops | Director sign-off |
| **Service Keys** | Semi-annually | Lexora Ops | Security review |
| **Backup Encryption** | Quarterly | Supabase | Automated |

**Key Access Control:**
- Only 2 people (Security Officer + DevOps Lead) have access to key escrow
- Keys stored in encrypted vault (AWS Secrets Manager)
- No plaintext key files on servers
- Audit log tracks all key access/rotation

### 6.3 Encryption Key Compromise Response

**If encryption key is compromised:**

1. **Immediate Actions** (0-1 hour):
   - Activate incident response plan
   - Notify Lexora security team
   - Begin forensic investigation
   - **DO NOT** delete backups (needed for recovery)

2. **Short Term** (1-24 hours):
   - Rotate all active encryption keys
   - Identify scope of data exposure
   - Prepare customer notifications (if required)
   - Preserve audit logs for investigation

3. **Medium Term** (1-7 days):
   - Complete forensic analysis
   - Notify customers of incident (if data breach threshold met)
   - Re-encrypt database with new keys
   - Deploy security patches

4. **Long Term** (1-3 months):
   - Conduct security audit (third-party)
   - Review & strengthen key management procedures
   - Update incident response plan
   - Implement preventive controls

See **Section 8: Data Breach Notification** for full procedure.

---

## 7. USER RIGHTS & ACCESS REQUESTS

### 7.1 Data Subject Rights (GDPR Articles 12-22)

Lexora customers and their employees have the following rights:

**1. Right to Access (Article 15)**
- Request: "I want to see all data you hold about me"
- Lexora provides: Downloadable export within 30 days
- Format: CSV, JSON, or PDF
- No fee unless request is manifestly unfounded

**2. Right to Rectification (Article 16)**
- Request: "This data about me is inaccurate, please correct it"
- Lexora provides: Correction within 30 days
- Audit trail: Old value preserved, change logged
- Notification: Customer notified of correction

**3. Right to Erasure (Article 17) - "Right to be Forgotten"**
- Request: "Please delete my personal data"
- Exceptions: Legal/regulatory requirement (MRA retention), contract necessity
- Response: Deletion within 30 days (where applicable)
- Cannot delete: Financial records (7-year MRA hold), GL entries (immutable)

**4. Right to Data Portability (Article 20)**
- Request: "I want my data in machine-readable format to switch providers"
- Lexora provides: Complete export (CSV/JSON) within 30 days
- Format: Structured, commonly-used format
- No fee unless request is manifestly unfounded

**5. Right to Restrict Processing (Article 18)**
- Request: "Don't use my data until you resolve my concern"
- Lexora response: Data marked as restricted, processing paused
- Exception: Required by law (MRA compliance continues)
- Duration: Until dispute resolved

**6. Right to Object (Article 21)**
- Request: "Stop processing my data for marketing/analytics"
- Lexora provides: Processing stops within 30 days
- Exception: Legal obligation (tax processing continues)

**7. Right to Human Review (Article 22)**
- Request: "I don't want automated decision-making about my data"
- Lexora response: N/A (no fully automated decisions affecting individuals)
- Manual review: All significant decisions reviewed by human

### 7.2 Data Access Request Process

**Customer/Employee Request:**

```
Step 1: Submit Request
├─ Email to: privacy@lexora.mu
├─ Include: Name, email, description of data sought
├─ Provide: Optional ID verification document

Step 2: Acknowledge (within 5 business days)
├─ Lexora responds: Request received & timeline
├─ Status: Assigned ticket number for tracking

Step 3: Process (within 30 calendar days)
├─ Identify relevant data across all systems
├─ Compile export (CSV/PDF/JSON as requested)
├─ Redact third-party/sensitive data if needed
├─ QA: Verify completeness & accuracy

Step 4: Deliver
├─ Secure transmission: Encrypted download link (expires 7 days)
├─ Alternative: USB drive (for offline access)
├─ Confirmation: Delivery tracked & logged

Step 5: Archive
├─ Keep copy of request & response (for audit trail)
├─ Retention: 3 years (per GDPR Article 12(5))
```

**Response Timeline:**
- Standard: 30 calendar days
- Complex requests: +60 days (with explanation)
- Multiple requests (>3 per month): Fee may apply per GDPR

### 7.3 Right to Access for Auditors

**Big 4 auditors have expanded access rights:**

**Auditor Access to Data:**
- GL entries (all history & supporting docs)
- Invoice records (all statuses & amendments)
- Bank transactions (all accounts & matching)
- Payroll records (employee data, tax filings)
- User audit logs (login, actions, changes)
- System controls documentation

**Auditor Limitations:**
- Cannot access other customers' data (multi-tenant isolation)
- Cannot export raw employee PII (unless explicitly needed)
- Cannot retain data post-audit (must delete/return copies)
- Must sign Confidentiality Agreement (CAA)

**Audit Access Controls:**
- Create dedicated auditor account (read-only, time-limited)
- Log all auditor queries (who, what, when)
- Notify customer of auditor access
- Automatic deactivation after audit completion

---

## 8. DATA BREACH NOTIFICATION PROCEDURES

### 8.1 Incident Classification

**Breach vs. Non-Breach:**

| Incident Type | Example | Is Breach? | Action |
|---|---|---|---|
| **Unauthorized Access** | Attacker gains DB access | YES | Notify (Section 8.4) |
| **Unencrypted Transmission** | Data sent over HTTP (logs only, no customer data) | NO | Fix immediately, audit |
| **Lost Device** | Laptop with encrypted backup | NO (encrypted) | Track, replace device |
| **Insider Threat** | Employee copies customer data | YES | Notify (Section 8.4) |
| **Failed Backup** | Backup file corrupted | NO | Recover from alternate |
| **Ransomware Attack** | Files encrypted by attacker | MAYBE | Assess data exposure |

**Breach = Unauthorized access to personal data WITH security risk**
- Must be reported if data cannot be proven inaccessible (encrypted well)

### 8.2 Incident Response Team

**Structure:**

```
Incident Response
├─ Security Officer (escalation, customer contact)
├─ DevOps Lead (forensics, containment)
├─ Database Administrator (data recovery, backup analysis)
├─ Legal/Compliance Officer (notification requirement assessment)
├─ Communications Manager (customer & regulator notification)
└─ CEO (approval for major notifications)
```

**Contact Protocol:**
- All team members notified within 1 hour of detection
- War room established (daily standup until resolved)
- Incident commander assigned (typically Security Officer)
- External legal counsel retained if breach confirmed

### 8.3 Incident Response Timeline

| Phase | Timeline | Actions |
|---|---|---|
| **Detection** | T+0 | Incident identified, team notified |
| **Assessment** | T+0-4h | Determine scope, what data exposed |
| **Containment** | T+4-24h | Stop ongoing attack, isolate affected systems |
| **Forensics** | T+24h-7d | Understand attack vector, find root cause |
| **Notification** | T+48-72h | Notify regulators (if required) & customers |
| **Recovery** | T+7d-30d | Restore systems, apply patches, test |
| **Post-Incident** | T+30d+ | Root cause analysis, policy updates, training |

### 8.4 Breach Notification Requirements

**Notification Triggers:**

**Must Notify (Within 72 hours):**
- ✅ Personal data of 10+ individuals compromised
- ✅ High-risk personal data (national ID, bank account, salary)
- ✅ Any encryption key compromise
- ✅ Insider threat (employee theft)
- ✅ Ransomware with confirmed data exfiltration

**May Notify (Within 30 days):**
- ⚠️ Personal data of <10 individuals compromised
- ⚠️ Low-risk data only (email, phone, non-sensitive)
- ⚠️ Data already publicly available (no new exposure)

**Notification Contents:**

1. **To Regulatory Authority (MRA, if Mauritius primary)**:
   ```
   - Notification within 72 hours (T+72h)
   - Contact: MRA Data Protection Officer
   - Content:
     a) Date/time of breach
     b) Data type compromised (employee payroll, GL, etc)
     c) Number of individuals affected
     d) Likely consequences for data subjects
     e) Measures taken/planned to address
   ```

2. **To Affected Individuals**:
   ```
   - Notification within 72 hours (or per local law, up to 30 days)
   - Via: Email + SMS (both required)
   - Content (plain language):
     a) What happened
     b) What data was compromised
     c) What Lexora is doing about it
     d) What individuals should do (monitor accounts, etc)
     e) Contact for questions: privacy@lexora.mu
   ```

3. **To Customers** (data controller):
   ```
   - Notification within 24 hours (before public announcement)
   - Provide: Full forensic report, timeline, impact assessment
   - Offer: Credit monitoring (if bank data exposed), legal support
   ```

4. **Public Announcement** (if breach is major):
   ```
   - Press release issued within 7 days
   - Details: Attack vector, data types, prevention measures
   - Tone: Transparent, accountable, future-focused
   ```

### 8.5 Example Breach Scenario

**Scenario: Database Dump Discovered**

```
T+0 (May 22, 14:00 UTC)
├─ Monitoring system detects unauthorized database export
├─ Incident response team activated immediately
├─ Forensic snapshot taken (preserves evidence)
└─ Incident #2026-05-22-DB-001 created

T+2h (May 22, 16:00 UTC)
├─ Initial assessment: 15,000 GL entries + 500 employee records exported
├─ Scope: 8 customers affected (DDS, OCC, and 6 others)
├─ Risk: Medium (financial data encrypted, employee data partially exposed)
└─ Decision: Breach notification required (>10 individuals)

T+4h (May 22, 18:00 UTC)
├─ Forensics complete: Attacker used stolen API key from former contractor
├─ Containment: API key revoked, contractor access removed
├─ Remediation: Rotate all API keys, force password reset for exposed users
└─ Backup: All backups confirmed unaffected & available for recovery

T+24h (May 23, 14:00 UTC)
├─ Drafts prepared:
│  ├─ MRA notification (72-hour deadline)
│  ├─ Customer notifications (8 companies)
│  └─ Individual data subject letters (500 employees)
└─ Legal review completed, CEO approves notifications

T+48h (May 24, 14:00 UTC)
├─ Notifications sent to:
│  ├─ MRA (Data Protection Officer) - formal letter + forensic report
│  ├─ 8 Customers - detailed incident report + remediation plan
│  └─ 500 Individuals - plain-language notice + credit monitoring offer
└─ Press release issued

T+7d (May 29)
├─ Root cause analysis complete (weak API key rotation)
├─ Process improvements implemented
│  ├─ Mandatory key rotation every 90 days
│  ├─ Enhanced contractor offboarding
│  └─ API key usage monitoring
└─ Third-party security audit scheduled
```

---

## 9. THIRD-PARTY DATA SHARING

### 9.1 Sub-Processors (GDPR Article 28)

Lexora uses the following sub-processors for data processing:

**Critical Infrastructure:**

| Service | Purpose | Data Types | Jurisdiction | DPA |
|---|---|---|---|---|
| **Supabase** | Database hosting & backups | All customer data | EU (Ireland) | Yes |
| **Vercel** | Web hosting & CDN | Logs, session data | US/EU | Yes |
| **Postmark** | Email delivery | Transactional emails | US | Yes |
| **Sentry** | Error monitoring | Error logs (no PII) | US | Yes |
| **Datadog** | Performance monitoring | Logs, metrics (no PII) | US | Yes |

**Data Categories by Sub-Processor:**

```
Supabase (Database)
├─ Employee data (names, salaries, national IDs)
├─ Company data (names, addresses, VAT IDs)
├─ Financial data (GL entries, invoices, amounts)
└─ User data (email, login history, preferences)

Vercel (Hosting)
├─ Session tokens (temporary, not personal)
├─ Access logs (IP addresses for security)
└─ Performance metrics (no customer data)

Postmark (Email)
├─ Transaction notifications (payslip, invoice generated)
├─ User email (for delivery only)
└─ No GL/financial/personal data retained
```

### 9.2 Data Processing Agreements (DPAs)

**All sub-processors have executed Standard Contractual Clauses (SCCs):**

- ✅ Supabase: DPA executed (2024-01-15)
- ✅ Vercel: DPA executed (2024-02-01)
- ✅ Postmark: DPA executed (2024-03-10)
- ✅ Sentry: DPA executed (2024-04-05)
- ✅ Datadog: DPA executed (2024-05-01)

**DPA Contents (per GDPR Article 28(3)):**
1. Subject matter & duration of processing
2. Nature & purpose of processing
3. Types of personal data
4. Categories of data subjects
5. Obligations & rights of controller (Lexora customer)
6. Security measures (encryption, access controls)
7. Sub-processor authorization
8. Assistance with data subject rights
9. Assistance with compliance obligations
10. Deletion or return of data upon termination

**Review Cycle**: Annually (April 15 of each year)

### 9.3 Data NOT Shared

**Data intentionally NOT shared with any third party:**
- ❌ Full salary/income data (used internally only)
- ❌ Complete employee records (only names/emails for communication)
- ❌ Bank account numbers (stored encrypted, masked for display)
- ❌ National ID numbers (not shared, stored hashed)
- ❌ Complete GL entries (audit only, not shared)
- ❌ Customer IP logs (stored for security, not shared)

**Optional Sharing (Customer Consent Required):**
- 🔄 Accounting software integrations (Xero, QuickBooks)
- 🔄 Bank feed connections (direct bank API)
- 🔄 MRA e-filing (when customer opts in)
- 🔄 Third-party analytics (if customer enables)

---

## 10. GDPR COMPLIANCE CHECKLIST

### 10.1 GDPR Compliance Status

**Compliance Assessment: ✅ COMPLIANT (where GDPR applies)**

| Requirement | Status | Evidence | Tested |
|---|---|---|---|
| **Article 5: Data principles** | ✅ | Data minimization policy, retention schedules | Q2 2026 |
| **Article 6: Lawful basis** | ✅ | Legal basis documented per data type | Q1 2026 |
| **Article 9: Special categories** | ✅ | Not collected (health, biometric, etc) | Q1 2026 |
| **Article 13/14: Privacy notice** | 🔄 | Template available, needs customer deployment | Q3 2026 |
| **Article 15: Right to access** | ✅ | API export function, manual process | Q2 2026 |
| **Article 16: Right to rectify** | ✅ | Edit functionality in all modules | Ongoing |
| **Article 17: Right to erasure** | ⚠️ | Partial (legal holds prevent full deletion) | Q2 2026 |
| **Article 18: Right to restrict** | 🔄 | Manual workaround, system flag not yet implemented | Q3 2026 |
| **Article 20: Data portability** | ✅ | CSV/JSON export available | Q2 2026 |
| **Article 21: Right to object** | 🔄 | Email opt-out implemented, product opt-out TBD | Q3 2026 |
| **Article 22: Automated decisions** | ✅ | No fully automated decisions (no impact) | N/A |
| **Article 28: DPA** | ✅ | Standard DPA, all sub-processors signed | Q1 2026 |
| **Article 32: Security** | ✅ | AES-256, TLS 1.3, access controls | Q2 2026 |
| **Article 33: Breach notification** | ✅ | Process documented, 72-hour procedure | Q1 2026 |
| **Article 34: Individuals notification** | ✅ | Procedure documented, not yet tested | Q2 2026 |
| **Article 35: DPIA** | 🔄 | Framework ready, templates TBD | Q3 2026 |
| **Article 36: Consultation** | 🔄 | TBD based on DPIA findings | Q3 2026 |
| **Article 37: DPO** | ❌ | Not required (small org, no systematic monitoring) | N/A |
| **Article 40: Codes of conduct** | 🔄 | ISO 27001 alignment, formal certification TBD | Q4 2026 |
| **Article 42: Certification** | 🔄 | SOC 2 audit planned (Q3 2026) | Q3 2026 |

**Legend:**
- ✅ = Compliant & implemented
- 🔄 = In progress / partial
- ⚠️ = Compliant but with workarounds
- ❌ = Not required or out of scope

### 10.2 Data Impact Assessment (DPIA) Requirements

**DPIA Required For:**

1. **✅ Automatic Payroll Calculations**
   - Frequency: Annual
   - Risk: Medium (financial data at scale)
   - Status: DPIA completed (Q1 2026)

2. **✅ Bank Transaction OCR/Matching**
   - Frequency: Continuous
   - Risk: High (automated + high volume)
   - Status: DPIA completed (Q1 2026)

3. **✅ User Access & Activity Monitoring**
   - Frequency: Continuous
   - Risk: High (surveillance-like, auditable data)
   - Status: DPIA completed (Q1 2026)

4. **🔄 AI-Powered GL Classification** (planned Phase 2)
   - Frequency: Continuous
   - Risk: High (automated + impacts data integrity)
   - Status: DPIA template prepared, to be completed before launch

**DPIA Template:**
Location: `/legal/DPIA_TEMPLATE.md`

**DPIA Review Schedule:**
- Annual review (May 15)
- Major process changes (ad-hoc)
- Regulatory updates (ad-hoc)

---

## 11. APPENDICES

### Appendix A: Data Subject Rights Request Template

**Email Template for Data Access Request:**

```
To: privacy@lexora.mu
Subject: Data Subject Rights Request - [Your Name]

I am requesting the following under GDPR Article [15-21]:

REQUEST TYPE (select one):
☐ Right to Access (Article 15) - Provide all data held about me
☐ Right to Rectification (Article 16) - Correct inaccurate data
☐ Right to Erasure (Article 17) - Delete my data
☐ Right to Data Portability (Article 20) - Export data in machine-readable format
☐ Right to Restrict (Article 18) - Stop processing pending review
☐ Right to Object (Article 21) - Stop marketing/analytics processing

REQUESTOR INFORMATION:
Name: [Full Name]
Email: [Email Address]
Employee ID / Company: [If applicable]
Date of Birth: [To verify identity]

DETAILS OF REQUEST:
[Describe specific data or concern, e.g., "Please provide all salary data held for the year 2025"]

IDENTITY VERIFICATION:
[Attach: Passport scan, ID card, or other proof of identity]

I confirm that I am the data subject (or authorized representative).

Signed: _______________
Date: _______________
```

**Lexora Response Timeline:**
- Acknowledgment: Within 5 business days
- Fulfillment: Within 30 calendar days (or 60 days for complex requests)
- Delivery method: Secure download link or encrypted USB

---

### Appendix B: Privacy Notice Template for Customers

**Template for customer to deploy to employees/suppliers:**

```markdown
# Privacy Notice - [Company Name]

[Company Name] ("We" or "Us") collects and processes personal data through our accounting system, Lexora.

## What data do we collect?

- Names, email addresses, phone numbers
- Employment information (salary, tax ID, bank account for salary transfer)
- Financial transaction data (invoices, amounts, dates)
- System access information (login history, IP addresses)

## Why do we collect it?

- To calculate and process payroll (contractual)
- To file taxes with the MRA (legal obligation)
- To maintain accounting records (legal obligation)
- To secure our systems (legitimate interest)

## How long do we keep it?

- Employee data: 5 years after employment ends
- Financial records: 7 years per MRA requirements
- System logs: 7 years for audit trail

## What are your rights?

You have the right to:
- Access your personal data
- Correct inaccurate data
- Request deletion (except where required by law)
- Export your data
- Object to certain processing

To exercise your rights, contact: [privacy@company.mu]

For more information, see our full Privacy Policy at: [URL]
```

---

### Appendix C: Incident Response Plan Summary

**Quick Reference Card:**

```
INCIDENT DETECTED
├─ Stop unauthorized access immediately
├─ Isolate affected system (if safe to do so)
├─ Do NOT delete evidence (preserve backups)
└─ Call incident commander: +230 [to be defined]

WITHIN 1 HOUR
├─ Activate incident response team
├─ Brief CEO/Board
├─ Preserve all evidence (logs, backups, configuration)
└─ Begin forensic investigation

WITHIN 4 HOURS
├─ Determine what data was exposed
├─ Assess risk to data subjects (is it encrypted? publicly available?)
├─ Notify legal counsel
└─ Prepare breach notification (if required)

WITHIN 72 HOURS
├─ Notify regulators (if data breach threshold met)
├─ Notify affected individuals (if required)
├─ Apply security patches & rotate keys
└─ Publish status update (if breach is major)

WITHIN 7 DAYS
├─ Complete forensic analysis
├─ Determine root cause
├─ Implement preventive controls
└─ Begin customer communication plan

ONGOING
├─ Weekly incident updates
├─ Bi-weekly improvement implementation
└─ 30-day full review meeting
```

---

### Appendix D: Key Dates & Deadlines

| Item | Deadline | Owner |
|---|---|---|
| Annual Privacy Policy Review | May 15, 2027 | Compliance Officer |
| DPIA Annual Review | May 15, 2027 | Security Officer |
| DPA Sub-Processor Review | April 15, 2027 | Legal |
| SOC 2 Audit Planning | June 30, 2026 | Director |
| Incident Response Drill | Q3 2026 | Security Officer |
| Employee Privacy Training | August 31, 2026 | HR |
| Regulatory Compliance Check (MRA) | December 15, 2026 | Finance |

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial document | Compliance Officer |

**Approval:**

- [ ] Lexora Board
- [ ] Legal Counsel (External)
- [ ] Big 4 Audit Firm (for audit readiness)
- [ ] Privacy Officer / Compliance Lead

**Next Review**: May 22, 2027

---

**END OF PRIVACY POLICY & GDPR COMPLIANCE DOCUMENTATION**

*For questions or clarifications, contact: privacy@lexora.mu*
