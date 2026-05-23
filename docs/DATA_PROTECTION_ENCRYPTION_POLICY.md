# Data Protection & Encryption Policy
## Lexora Accounting SaaS Platform

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Jurisdiction**: Mauritius, European Union (GDPR)  
**Prepared for**: Big 4 Audit Compliance  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Encryption Standards](#encryption-standards)
3. [Data Classification](#data-classification)
4. [Key Management](#key-management)
5. [Encryption Implementation](#encryption-implementation)
6. [Access Controls](#access-controls)
7. [Breach Response](#breach-response)
8. [Audit & Compliance](#audit--compliance)
9. [Appendices](#appendices)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Protection Commitment

Lexora is committed to protecting customer data through:

✅ **Strong Encryption**: AES-256 at rest, TLS 1.3 in transit  
✅ **Key Management**: Quarterly rotation, secure escrow  
✅ **Access Control**: Multi-factor authentication, role-based access, IP whitelisting  
✅ **Monitoring**: 24/7 intrusion detection, anomaly alerts  
✅ **Incident Response**: 72-hour breach notification, forensics  

### 1.2 Principles

**Lexora Data Protection is based on:**

1. **Encryption by Default**: All customer data encrypted unless explicitly exempted
2. **Defense in Depth**: Multiple layers (encryption + access control + monitoring)
3. **Least Privilege**: Users access only data they need
4. **Regular Testing**: Annual penetration tests, vulnerability scans
5. **Transparency**: Customers can audit security measures

---

## 2. ENCRYPTION STANDARDS

### 2.1 Encryption at Rest

**Standard**: AES-256 (Advanced Encryption Standard, 256-bit keys)

**Implementation**:
- **Database Encryption**: PostgreSQL Transparent Data Encryption (TDE) via Supabase
- **Backup Encryption**: Same AES-256 (backups encrypted as stored)
- **Key Length**: 256-bit keys (industry standard for sensitive data)
- **Algorithm**: AES-256-GCM (Galois/Counter Mode) for authenticated encryption

**Coverage**:
```
ENCRYPTED:
├─ GL entries (ecritures_comptables_v2)
├─ Invoices (factures)
├─ Bank transactions (transactions_bancaires)
├─ Employee records (employes, bulletins_paie)
├─ User credentials (passwords, API keys)
├─ Tax declarations (declarations_annuelles)
└─ Audit logs (audit_logs - new in Phase 2)

NOT ENCRYPTED (Low sensitivity):
├─ Chart of accounts (public reference data)
├─ User names (required for display)
├─ Company names (required for display)
└─ System configuration (non-sensitive settings)
```

**Encryption Speed**:
- Encryption overhead: <1% latency impact (negligible)
- Decryption: 1-2ms per large record (automatic at query time)
- No user-facing performance impact

### 2.2 Encryption in Transit

**Standard**: TLS 1.3 (Transport Layer Security, latest version)

**Implementation**:
- **Protocol**: HTTPS only (HTTP → HTTPS 301 redirect)
- **Certificate Authority**: Let's Encrypt (free, auto-renewed)
- **Certificate Validation**: Full chain validation (no self-signed certs)
- **Cipher Suites**: Only strong ciphers (no weak/deprecated algorithms)

**Certificate Details**:
```
Domain: lexora.mu
Issued: Let's Encrypt
Expiry: Auto-renewed every 90 days
SHA: SHA-256 (secure hash)
Key Size: 2048-bit RSA
Certificate Chain: Full chain (including intermediate)
```

**TLS 1.3 Features**:
- ✅ Perfect Forward Secrecy (PFS): Old sessions unreadable if key is compromised
- ✅ 0-RTT: Fast connection resumption (secure resumption token)
- ✅ No weak ciphers: TLS 1.2 weak algorithms removed
- ✅ Downgrade protection: Cannot force downgrade to TLS 1.2

**Enforcement**:
```
API Requirements:
├─ All API calls must use HTTPS
├─ All requests without HTTPS rejected with 400 error
├─ HSTS header: "Strict-Transport-Security: max-age=31536000"
│  └─ Tells browser: Always use HTTPS for this domain
└─ Enforce-TLS-Version: 1.3+ only
```

**Certificate Pinning** (for high-security customers):
- Optional: Customer can pin certificate (for mobile apps, integrations)
- Prevents man-in-the-middle attack (even if Certificate Authority compromised)
- Reduces security to "certificate compromised + transport compromised" (extreme scenario)

### 2.3 Encryption of Sensitive Fields

**Additional Layer for High-Sensitivity Data:**

| Field | Encryption Method | Key Management | Access |
|---|---|---|---|
| **Bank Account Number** | AES-256 + hashing | Provider-managed | Masked for display |
| **National ID** | PBKDF2 + salt (one-way) | Provider-managed | Search only, not display |
| **Salary Amount** | AES-256 (double-encrypted) | Customer-managed key (optional) | Restricted to HR/CFO |
| **Tax ID** | AES-256 + indexed encryption | Provider-managed | Searchable, encrypted |
| **API Keys** | PBKDF2 + salt | Lexora-managed | Display once only on creation |

**Example: Salary Encryption**

```
User Input: Salary = 50,000 MUR
             
Step 1: Hash + Salt (for validation)
└─ Hashed value: 5f4dcc3b5aa765d61d8327deb882cf99 (PBKDF2)

Step 2: Encrypt with Lexora key (Provider-managed)
└─ Encrypted: AES-256(key1) = "0x8a7f3c..."

Step 3: Optional: Customer re-encrypt with own key (if enabled)
└─ Double-encrypted: AES-256(key2) = "0x2b5e9a..." (only customer can decrypt)

Storage in DB:
├─ salaire_chiffre (encrypted with both keys if double-encryption enabled)
├─ salaire_hash (for validation)
└─ audit_trail (logs all access + modifications)

Display:
├─ Finance Director sees: 50,000 MUR (decrypted in memory)
├─ Comptable sees: [RESTRICTED] (no access)
└─ Payroll Officer sees: 50,000 MUR (decrypted in memory)
```

---

## 3. DATA CLASSIFICATION

### 3.1 Data Classification Levels

**Lexora classifies data by sensitivity:**

| Level | Examples | Encryption | Access Control |
|---|---|---|---|
| **SECRET (S)** | Bank account, salary, national ID | AES-256 double-encrypted | Restricted roles + IP whitelist |
| **CONFIDENTIAL (C)** | GL entries, invoices, tax data | AES-256 encrypted | Role-based access (Comptable+) |
| **INTERNAL (I)** | Company info, account settings | AES-256 encrypted | Authenticated users |
| **PUBLIC (P)** | COA (chart of accounts), help docs | Not encrypted | All (available publicly) |

**Classification in Practice:**

```
GL Entry: CONFIDENTIAL
├─ Account code: 6200 (Salaries)
├─ Amount: 50,000 (encrypted, labeled CONFIDENTIAL)
├─ Date: 2026-05-20 (not sensitive, INTERNAL)
├─ Reference: INV-2026-0001 (not sensitive, INTERNAL)
└─ Access: Comptable, Directeur, Auditor (no Comptable Agent)

Employee Record: SECRET
├─ Name: John Doe (encrypted, need-to-know only, CONFIDENTIAL)
├─ Salary: 50,000 (encrypted, double-encrypted, SECRET)
├─ Bank account: 123456789 (encrypted, masked, SECRET)
├─ Email: john@company.mu (encrypted, CONFIDENTIAL)
└─ Access: HR Manager, CFO, Payroll Officer ONLY
```

### 3.2 Data Residency & Jurisdiction

**Customer data location:**

```
Primary Storage:
├─ Host: Supabase (PostgreSQL)
├─ Region: EU (Ireland)
├─ Jurisdiction: EU GDPR-compliant
└─ Encryption: AES-256 (Supabase managed)

Backup #1 (Synchronous):
├─ Region: EU (Paris)
├─ Sync frequency: Real-time (within 1 second)
├─ Jurisdiction: EU GDPR-compliant
└─ Use case: Disaster recovery (if Ireland fails)

Backup #2 (Asynchronous):
├─ Region: EU (Frankfurt)
├─ Sync frequency: Daily
├─ Jurisdiction: EU GDPR-compliant
└─ Use case: Long-term retention (quarterly rotation)

Data Egress:
├─ Email service (Postmark): Data sent to US (covered by DPA)
├─ Monitoring (Datadog): Logs sent to US (covered by DPA, anonymized)
└─ Analytics (optional): Only if customer enables, DPA in place
```

**Guarantee to Customers:**
- ✅ Data never leaves EU unless customer explicitly exports
- ✅ If customer is in Mauritius: Data stored in EU (GDPR-compliant)
- ✅ If customer exports: Customer responsible for storage security
- ✅ Lexora retains no copy of exported data

---

## 4. KEY MANAGEMENT

### 4.1 Encryption Key Lifecycle

**Key Lifecycle Management:**

```
Step 1: Key Generation (Initial)
├─ Time: During Supabase setup (2024-01-15)
├─ Method: Cryptographically random generation (512-bit entropy)
├─ Authority: Supabase security team
├─ Location: AWS Secrets Manager (encrypted storage)
└─ Access: 2-person rule (Security Officer + DevOps Lead)

Step 2: Key Rotation (Quarterly)
├─ Schedule: Every 90 days (fixed: Jan 15, Apr 15, Jul 15, Oct 15)
├─ Method: Automated rotation (Supabase handles)
├─ New key: Generated automatically
├─ Old data: Re-encrypted with new key (transparent to users)
├─ Timeline: 1 hour (during off-peak, announced 24h in advance)
└─ Verification: Both keys work during transition period

Step 3: Key Escrow (Backup)
├─ Location: AWS Secrets Manager (encrypted)
├─ Custodians: Security Officer, CFO (escrow account)
├─ Access: 2-person rule for decryption
├─ Purpose: Recovery if key is compromised
└─ Retention: 7 years (per audit requirements)

Step 4: Key Compromise (Emergency)
├─ Detection: Automated alerts (key access anomaly)
├─ Response: Immediate key rotation (see Section 4.2)
├─ Communication: Customer notified within 24 hours
└─ Investigation: Forensics to determine scope

Step 5: Key Decommission (Retirement)
├─ Timeline: 2 years after rotation (old key retained for decryption)
├─ Method: Cryptographic deletion (unrecoverable)
├─ Evidence: Deletion certificate signed by Security Officer
└─ Audit trail: Destruction logged & archived
```

### 4.2 Key Rotation Schedule

**Regular Rotation (Planned):**

| Quarter | Date | Duration | Announced | Notes |
|---|---|---|---|---|
| Q1 | Jan 15, 02:00 UTC | 1 hour | Jan 1 | New year key |
| Q2 | Apr 15, 02:00 UTC | 1 hour | Apr 1 | Spring rotation |
| Q3 | Jul 15, 02:00 UTC | 1 hour | Jul 1 | Mid-year rotation |
| Q4 | Oct 15, 02:00 UTC | 1 hour | Oct 1 | Pre-year-end |

**Emergency Rotation (Unplanned):**

If key compromise suspected:

```
T+0: Detection of compromise
├─ Alert: Automated system detects unusual key access
├─ Action: Incident response team activated
└─ Decision: Rotate immediately (no advance notice)

T+15 min: Rotation begins
├─ New key: Generated
├─ Data: Re-encrypted in place (transparent to customers)
├─ Service: Brief outage possible (1-2 minutes)
└─ Notification: Email sent to all customers

T+1 hour: Rotation complete
├─ Verification: All systems using new key
├─ Monitoring: Extra logging for 48 hours
└─ Communication: Root cause analysis initiated

T+24 hours: Customer communication
├─ Scope: Which customers affected?
├─ Impact: Any data accessed?
├─ Actions: What is Lexora doing to prevent recurrence?
└─ Support: Dedicated point of contact for questions
```

### 4.3 Key Access Control

**Who has access to encryption keys:**

```
Lexora Personnel:
├─ Security Officer (full access to escrow key)
├─ DevOps Lead (full access for key rotation)
├─ CEO (access to decision, no technical access)
├─ CTO (audit-only access, cannot decrypt)
└─ Database Administrators: NONE (keys not directly accessible)

Customers:
├─ Can request: Encrypted export of their data
├─ Cannot request: Lexora's encryption key
├─ Optional: Bring-your-own-key (BYOK) program (Q4 2026)
│  └─ Customer provides own key for double-encryption

Auditors:
├─ Can audit: Key management procedures
├─ Cannot access: Actual encryption keys
├─ Can verify: Key rotation dates & cryptography

Third Parties:
├─ Supabase: Manages database encryption (no key access to Lexora)
├─ AWS: Hosts escrow key (no access to decryption)
└─ None: No vendor has access to both key + encrypted data
```

**2-Person Rule (For Key Escrow):**

```
Scenario: Disaster recovery requires decryption
├─ Person 1 (Security Officer): Approves key release
├─ Person 2 (CFO): Verifies business need + countersigns
├─ Both must be present: No solo key access
├─ Audit trail: Decryption logged with both names, reason, timestamp
└─ Recovery: Key used to decrypt backup, restore customer data
```

### 4.4 Key Monitoring & Auditing

**Key Access is Monitored:**

```
Daily Monitoring:
├─ Automated alerts: Any key access logged
├─ Threshold: Alert if key accessed >5 times/day (abnormal)
├─ Exception: Expected access only (planned rotation)
└─ Alert destination: Security Officer email + Slack

Weekly Review (Every Monday):
├─ Report: Key access logs for past 7 days
├─ Verify: All access legitimate (expected or explained)
├─ Investigate: Any unusual access patterns
└─ Document: Findings in security log

Quarterly Audit:
├─ Full key lifecycle review
├─ Verify: Rotation dates documented
├─ Verify: Escrow key still secured
├─ Verify: No unauthorized access
└─ Report: Included in quarterly security review
```

---

## 5. ENCRYPTION IMPLEMENTATION

### 5.1 Database Encryption (PostgreSQL)

**Supabase Implementation:**

```sql
-- Enable Transparent Data Encryption (TDE)
-- (Handled automatically by Supabase, no SQL needed)

-- Customer data tables (all encrypted):
CREATE TABLE ecritures_comptables_v2 (
  id UUID PRIMARY KEY,
  societe_id UUID NOT NULL,
  montant_debit DECIMAL(15,2),      -- Encrypted
  montant_credit DECIMAL(15,2),     -- Encrypted
  code_journal VARCHAR(3),
  compte_debit VARCHAR(10),
  compte_credit VARCHAR(10),
  reference VARCHAR(50),
  created_at TIMESTAMP,
  created_by UUID,
  -- All text fields encrypted at storage level
);

-- Example: Salary data (double encryption available)
CREATE TABLE bulletins_paie (
  id UUID PRIMARY KEY,
  employe_id UUID NOT NULL,
  salaire_brut DECIMAL(15,2),       -- Encrypted
  salaire_net DECIMAL(15,2),        -- Encrypted (double-encrypted if BYOK enabled)
  paye_withholding DECIMAL(15,2),   -- Encrypted
  -- All sensitive fields encrypted
);
```

**Encryption at Rest - How It Works:**

```
User writes: INSERT INTO ecritures_comptables_v2 VALUES (...)
                                     ↓
System: "montant_debit = 50000"
                                     ↓
PostgreSQL TDE: Encrypt("50000") = "0x8a7f3c..." (AES-256-GCM)
                                     ↓
Storage: Write encrypted blob "0x8a7f3c..." to disk
                                     ↓
Backup: Encrypted blob copied to backup (remains encrypted)
                                     ↓
User reads: SELECT montant_debit FROM ecritures_comptables_v2 WHERE id = X
                                     ↓
PostgreSQL TDE: Decrypt("0x8a7f3c...") = "50000" (automatic, in-memory)
                                     ↓
Display: Show 50,000 to authorized user (Directeur) or [RESTRICTED] (Comptable)
```

### 5.2 Application-Level Encryption

**Sensitive fields encrypted in application code:**

```typescript
// Example: Encrypt bank account number before storing
import crypto from 'crypto';

const encryptBankAccount = (accountNumber: string, key: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(accountNumber, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  // Return: iv + authTag + encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

// Usage:
const accountNumber = '123456789';
const encryptedAccount = encryptBankAccount(accountNumber, ENCRYPTION_KEY);
// Store in DB: encryptedAccount (never plain text)

// Display (with masking):
const displayBankAccount = (encrypted: string): string => {
  const decrypted = decryptBankAccount(encrypted, ENCRYPTION_KEY);
  // Return: "****6789" (last 4 digits only)
  return `****${decrypted.slice(-4)}`;
};
```

### 5.3 Backup Encryption

**Backups maintain encryption:**

```
Daily Backup Schedule:
├─ Time: 02:00 UTC (off-peak)
├─ Frequency: Continuous snapshots (every 15 minutes)
├─ Method: Supabase automated backup
├─ Retention: 90 days rolling (oldest backups purged)
└─ Encryption: Same AES-256 (inherited from production)

Backup Properties:
├─ Location: EU region (Ireland + Paris redundancy)
├─ Size: ~500 MB (compressed)
├─ Status: Verified daily (test restore)
├─ Encryption: AES-256 (same keys as production)
└─ Access: Only authorized DevOps team

Recovery Process (if needed):
├─ Time to Recovery (RTO): 4 hours (for full GL module)
├─ Data Loss (RPO): 1 hour (maximum data loss)
├─ Process:
│  ├─ 1. Identify backup point (which day/time)
│  ├─ 2. Decrypt backup (using escrow key if needed)
│  ├─ 3. Verify backup integrity (test data queries)
│  ├─ 4. Restore to new database instance
│  ├─ 5. Validate all GL entries present
│  ├─ 6. Switch traffic to restored DB
│  └─ 7. Communicate to customers (email + dashboard)
```

---

## 6. ACCESS CONTROLS

### 6.1 Authentication & Authorization

**Multi-Layer Access Control:**

```
Layer 1: Identity (WHO ARE YOU?)
├─ Method: Email + password (minimum 12 characters)
├─ Strength: PBKDF2 + salt (one-way hashing)
├─ MFA: Optional (recommended for sensitive roles)
│  └─ TOTP (Time-based One-Time Password)
│  └─ SMS (if no authenticator app)
└─ Reset: Email verification link (24-hour expiry)

Layer 2: Authorization (WHAT CAN YOU DO?)
├─ Role-based access:
│  ├─ Comptable: Create GL entries, match invoices
│  ├─ Directeur: Approve GL, sign-off reconciliation
│  ├─ HR Manager: Manage employees, process payroll
│  └─ Auditor: Read-only access (all data)
├─ Societe_id scoping: Users can only access own company
├─ Amount-based: Large transactions require additional approval
└─ Data-level: Salary visible to HR, not to Comptable

Layer 3: Session Management
├─ Session tokens: 30-minute expiry (auto-logout)
├─ Concurrent sessions: 1 per user (logout other sessions if new login)
├─ CSRF protection: Anti-CSRF tokens on form submissions
└─ Secure cookies: HttpOnly, Secure, SameSite flags

Layer 4: IP Whitelisting (Optional)
├─ For high-security customers: Enable IP restrictions
├─ Example: Comptable can only login from office (10.0.0.0/8)
├─ Exception: Escalation request for VPN/remote work
└─ Audit: All IP-based access blocked (with reason logged)
```

### 6.2 Access Logging

**All access is logged:**

```
Access Log Entry:
├─ User: comptable@company.mu
├─ Action: View GL entry ECC-2026-00047
├─ Time: 2026-05-22 10:15:30 UTC
├─ IP: 196.203.45.67 (Mauritius)
├─ Device: Chrome browser (Windows 10)
├─ Resource: /api/gl-entries/ECC-2026-00047
├─ Result: Success (200 OK)
└─ Purpose: Routine accounting work (inferred from role)

Audit Trail (7 years):
├─ Weekly report: All access logs reviewed
├─ Monthly report: Summary statistics (active users, failed logins)
├─ Quarterly report: Access anomalies flagged
└─ Annual audit: Comprehensive review with external auditor
```

### 6.3 Least Privilege Principle

**Users get minimum access needed:**

```
Example: New Comptable hired
├─ Assigned role: Comptable (only)
├─ Can access:
│  ├─ GL entry creation (for assigned company)
│  ├─ Invoice processing (for assigned company)
│  ├─ Bank transaction matching
│  └─ Reports (read-only)
├─ Cannot access:
│  ├─ Payroll module (only HR Manager)
│  ├─ Approval function (only Directeur)
│  ├─ Other companies (multi-tenant isolation)
│  ├─ User management (only Directeur)
│  └─ System configuration
└─ Audit: Access review quarterly (verify still appropriate)
```

---

## 7. BREACH RESPONSE

### 7.1 Breach Definition

**What constitutes a breach:**

```
BREACH = Unauthorized access to encrypted data
         BUT encryption was compromised/bypassed

Examples of BREACHES:
├─ Encryption key stolen + data decrypted by attacker
├─ Database dumped + decrypted with stolen key
├─ Insider decrypts & copies GL entries
└─ API vulnerability bypasses encryption checks

Examples of NOT BREACHES:
├─ Encrypted database backup lost (unreadable without key)
├─ Encrypted hard drive lost (AES-256, unreadable)
├─ SSL certificate stolen (doesn't decrypt past traffic due to PFS)
└─ API key leaked (only future access, not historical data)

Key difference: Encryption must be COMPROMISED for it to be a breach
               (encrypted data in wrong hands = not a breach)
```

### 7.2 Breach Response Procedure

**72-hour notification requirement (GDPR/PDPA):**

```
T+0 (DETECTION)
├─ Alert received: Intrusion detection system alerts
├─ Action: Incident response team activated (all 5 members)
├─ Scope: Determine what data was accessed
├─ Containment: Stop ongoing attack, isolate systems
└─ Evidence: Preserve all logs, backups (no deletion)

T+2 hours (INITIAL ASSESSMENT)
├─ Question: Was encryption compromised?
├─ If YES: Proceed to breach notification
├─ If NO: Security incident only (may not require notification)
├─ Scope estimate: How many records exposed?
├─ Sensitivity: What type of data (salary, GL, bank info)?
└─ Decision: Notify regulators, customers, individuals?

T+4 hours (FORENSIC INVESTIGATION)
├─ Analysis: How did attacker gain access?
├─ Timeline: When did compromise start? When detected?
├─ Scope: All data or subset? Which customers affected?
├─ Containment: Has attacker been removed? Any backdoors?
└─ Risk: Could attacker decrypt data with stolen key?

T+24 hours (CUSTOMER NOTIFICATION DRAFT)
├─ Draft 1: Plain-language explanation for customers
├─ Draft 2: Technical details for auditors
├─ Draft 3: Data protection offer (credit monitoring, legal support)
├─ Review: Legal counsel review for accuracy & liability
└─ Approval: CEO sign-off before sending

T+48 hours (REGULATOR NOTIFICATION)
├─ If >10 individuals affected: MRA + PDPA notification
├─ Content:
│  ├─ Description of the incident
│  ├─ Likely consequences for affected persons
│  ├─ Measures taken to address the breach
│  └─ Contact for further information
├─ Method: Formal letter + online portal (if available)
└─ Confirmation: Receipt acknowledgment from regulator

T+72 hours (INDIVIDUAL NOTIFICATION)
├─ Email: Personal notification from Lexora CEO
├─ Content: Plain language, no legal jargon
├─ Timeline: How this will unfold for affected individuals
├─ Actions: What can individuals do (monitor accounts, etc)
├─ Support: Offer of credit monitoring, legal resources
├─ Contact: Direct phone number for questions
└─ Method: Both email + SMS (two-factor confirmation)

T+7 days (PUBLIC COMMUNICATION)
├─ Press release: If breach is major (>1000 individuals)
├─ Tone: Transparent, accountable, forward-focused
├─ Content: What happened, what we're doing, prevention
├─ Media: Proactive disclosure (don't wait for press)
└─ Update: Daily status updates to affected customers

T+30 days (ROOT CAUSE ANALYSIS)
├─ Forensic report: Complete investigation findings
├─ Recommendations: What will change to prevent recurrence
├─ Process: Better segmentation, stronger authentication, etc.
└─ Timeline: When will changes be implemented?

T+60 days (IMPLEMENTATION)
├─ Changes deployed: Security improvements in place
├─ Testing: Penetration test to verify fixes work
├─ Verification: Third-party audit of changes
└─ Communication: Update to affected customers & regulators
```

### 7.3 Example Breach Scenario

**Scenario: Encryption Key Leaked in GitHub Commit**

```
T+0 (2026-05-22 14:30 UTC)
├─ Alert: Security scanning tool detects API key in GitHub
├─ Key detected: ENCRYPTION_KEY="0x8a7f3c..." in env.example
├─ Scope: Key was in commit for 2 days (pushed 2026-05-20)
├─ Impact: Attacker could decrypt any data (HIGH RISK)
└─ Action: Incident response team activated

T+2h (2026-05-22 16:30 UTC)
├─ Assessment: This IS a breach (encryption key compromised)
├─ Scope estimate: 8 customer accounts (DDS, OCC, 6 others)
├─ Data exposed: All GL entries + invoices + payroll (encrypted, now readable)
├─ Likelihood of compromise: MEDIUM (key public for 2 days, detected by scanner)
└─ Decision: Will require customer notification

T+4h (2026-05-22 18:30 UTC)
├─ Forensics:
│  ├─ Check: Was key accessed before removal?
│  ├─ Find: Any attacker IP addresses in logs?
│  ├─ Determine: Data was likely not accessed (low confidence)
│  └─ Recommend: Assume worst case (key was obtained by attacker)
├─ Containment:
│  ├─ Revoke leaked key immediately
│  ├─ Remove from GitHub (purge from history)
│  ├─ Rotate all encryption keys (emergency rotation)
│  ├─ Force password reset for all users
│  └─ Enable MFA for all accounts
└─ Communication: Prepare notifications

T+24h (2026-05-23 14:30 UTC)
├─ Drafts completed:
│  ├─ Customer notification email
│  ├─ Technical briefing for auditors
│  ├─ Credit monitoring offer (6-month free subscription)
│  └─ Legal support offer (attorney on-call)
├─ Legal review: Approved for sending
└─ Notification sent to 8 customers + 2 auditors

T+48h (2026-05-24 14:30 UTC)
├─ MRA notification: Formal letter + supporting docs
├─ Individual notification: Email to 500+ affected individuals
├─ Press release: Published (proactive disclosure)
└─ Customer hotline: 24/7 support line established

T+7d (2026-05-29)
├─ Root cause analysis complete:
│  └─ Issue: env.example should not contain real keys (template only)
├─ Process improvements:
│  ├─ Add pre-commit hook to prevent key commits
│  ├─ Rotate keys more frequently (every 30 days, not 90)
│  ├─ Implement BYOK (bring-your-own-key) for customers
│  └─ Add code review requirement for env files
└─ Communication: Update published to all affected customers

T+60d (2026-07-22)
├─ Improvements deployed:
│  ├─ Pre-commit hooks: Scanning for secrets in all commits
│  ├─ Quarterly key rotation: Automatic rotation now every 30 days
│  ├─ BYOK program: Customers can manage own encryption keys
│  └─ Code review: All sensitive config changes require review
├─ Verification: Penetration test confirms no residual vulnerabilities
└─ Communication: Final update to all parties
```

---

## 8. AUDIT & COMPLIANCE

### 8.1 Security Audit Schedule

**Lexora conducts regular security audits:**

| Audit Type | Frequency | Scope | Owner | Evidence |
|---|---|---|---|---|
| **Vulnerability Scan** | Quarterly | All systems | Security Ops | Report + remediation list |
| **Penetration Test** | Annual | Perimeter + internal | Third-party | Detailed report + signed off |
| **Code Review** | Every release | Source code | Development | Findings log |
| **Key Rotation Audit** | Quarterly | Encryption keys | Security Officer | Rotation certificates |
| **Access Control Audit** | Semi-annual | User permissions | Compliance | SOD matrix verification |
| **Backup Testing** | Monthly | Disaster recovery | DevOps | Restore test results |

### 8.2 Compliance Checklist

**GDPR/PDPA Encryption Requirements:**

| Requirement | Status | Evidence |
|---|---|---|
| Encryption at rest (Article 32) | ✅ Compliant | AES-256 implementation doc |
| Encryption in transit (Article 32) | ✅ Compliant | TLS 1.3 configuration |
| Key management procedures | ✅ Compliant | Key rotation schedule + escrow |
| Data breach notification (Article 33) | ✅ Compliant | 72-hour breach response plan |
| Data Protection Impact Assessment | ✅ Compliant | DPIA completed (see Privacy Policy) |
| Processor DPA with encryption terms | ✅ Compliant | DPA references encryption standards |
| Incident response plan tested | ✅ Compliant | Annual breach drill (Q3 2026) |

### 8.3 SOC 2 Audit Coverage

**Lexora pursuing SOC 2 Type II (encryption controls):**

```
SOC 2 Trust Service Principles:
├─ Security (CC: Criteria 1-6, 8-9)
│  └─ Encryption controls tested & working
├─ Availability (A: Criteria 1-2)
│  └─ Encryption doesn't impact uptime
├─ Processing Integrity (PI: Criteria 1-2)
│  └─ Data remains accurate through encryption/decryption
├─ Confidentiality (C: Criteria 1-3)
│  └─ Encryption prevents unauthorized access
└─ Privacy (PV: Criteria 1-2)
   └─ Encryption supports data subject rights

Testing:
├─ Design of controls: Do encryption procedures exist?
├─ Operating effectiveness: Do encryption procedures work?
├─ Compensating controls: If encryption fails, what backup?
└─ Evidence: System logs, configuration screenshots, test results

Target: SOC 2 Type II report ready by Q3 2026
```

---

## 9. APPENDICES

### Appendix A: Encryption Implementation Checklist

**For Developers:**

```
☐ Data Classification
  ☐ Identify all customer data fields
  ☐ Label each as PUBLIC, INTERNAL, CONFIDENTIAL, or SECRET
  ☐ Document classification in code comments

☐ Database Encryption
  ☐ Verify Supabase TDE is enabled
  ☐ Verify AES-256-GCM is used (not other algorithms)
  ☐ Test: Unencrypted data cannot be read from disk
  ☐ Backup: Verify backups also encrypted

☐ Application Encryption
  ☐ Implement crypto for SECRET fields (bank account, salary)
  ☐ Use PBKDF2 + salt for password hashing
  ☐ Use AES-256-GCM for symmetric encryption (not AES-256-CBC)
  ☐ Implement IV (initialization vector) for each encryption

☐ Transmission Security
  ☐ Enforce HTTPS (reject HTTP with 301)
  ☐ Add HSTS header (max-age=31536000)
  ☐ Verify TLS 1.3 is used (disable TLS 1.2)
  ☐ Test: No unencrypted data in transit (packet capture)

☐ Key Management
  ☐ Never hardcode keys in source code
  ☐ Store keys in encrypted vault (AWS Secrets Manager)
  ☐ Implement key rotation (quarterly automatic)
  ☐ Document key access (who has what, why)

☐ Testing
  ☐ Unit test: Encryption/decryption of sample data
  ☐ Integration test: E2E encryption in system
  ☐ Security test: Penetration test encryption controls
  ☐ Backup test: Verify encrypted backups can be restored

☐ Audit
  ☐ Document all encryption algorithms used
  ☐ Document all key management procedures
  ☐ Generate key rotation certificates
  ☐ Log all encryption key access
```

### Appendix B: Encryption Key Rotation Procedure

**For Operations Team:**

```
Pre-Rotation (24 hours before)
├─ [ ] Notify all customers (email + dashboard alert)
├─ [ ] Verify backup system is healthy
├─ [ ] Test restore procedure (with old key)
├─ [ ] Ensure 2 team members available during rotation
└─ [ ] Document planned rotation time

Rotation Execution (During maintenance window)
├─ [ ] Stop non-critical services (if needed)
├─ [ ] Generate new encryption key (automated)
├─ [ ] Begin re-encryption of data (background process)
├─ [ ] Monitor progress (% complete, errors)
├─ [ ] Verify both keys work (dual-key period)
└─ [ ] Switch to new key as default

Post-Rotation (After completion)
├─ [ ] Verify all systems using new key
├─ [ ] Test: Encrypt new data with new key
├─ [ ] Test: Decrypt old data with old key
├─ [ ] Test: Decrypt new data with new key (should work)
├─ [ ] Generate rotation certificate (signed by both team members)
├─ [ ] Archive old key in escrow (2-year retention)
├─ [ ] Log rotation in audit trail
└─ [ ] Communicate completion to customers
```

### Appendix C: Encryption Algorithm Details

**For Security Reviews:**

```
AES-256-GCM (Algorithm)
├─ Standard: NIST FIPS 197 (Advanced Encryption Standard)
├─ Block size: 128 bits (16 bytes)
├─ Key size: 256 bits (32 bytes)
├─ Mode: GCM (Galois/Counter Mode)
│  └─ Provides: Both confidentiality + authenticity (AEAD)
├─ IV (Initialization Vector): 96 bits (12 bytes, random)
├─ Authentication tag: 128 bits (16 bytes)
└─ Security level: 2^256 possible keys (brute force impossible)

TLS 1.3 (Transport)
├─ Protocol: RFC 8446 (latest version)
├─ Handshake: ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)
│  └─ Provides: Perfect Forward Secrecy (PFS)
├─ Cipher suites: Only modern, secure options
│  ├─ TLS_AES_256_GCM_SHA384 (preferred)
│  └─ TLS_CHACHA20_POLY1305_SHA256 (alternative)
├─ Key exchange: 256-bit elliptic curve
└─ Security level: 2^256 possible keys (brute force impossible)

PBKDF2 (Password Hashing)
├─ Standard: RFC 2898 (Password-Based Key Derivation Function)
├─ Hash function: SHA-256 (HMAC-SHA256)
├─ Iterations: 100,000+ (slow by design)
├─ Salt: Random 128-bit salt per password
└─ Output: 256-bit hash (impossible to reverse)
```

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial document | Security Officer |

**Approval:**

- [ ] Lexora Board
- [ ] Security Audit Team
- [ ] Big 4 Compliance Review

**Next Review**: May 22, 2027 (or upon encryption algorithm changes)

---

**END OF DATA PROTECTION & ENCRYPTION POLICY**

*For technical questions, contact: security@lexora.mu*  
*For audit requests, contact: compliance@lexora.mu*
