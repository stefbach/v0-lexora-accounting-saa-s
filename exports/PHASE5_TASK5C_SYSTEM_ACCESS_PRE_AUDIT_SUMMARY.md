# PHASE 5 - TASK 5C: SYSTEM ACCESS PRE-AUDIT
## Executive Summary & Execution Guide

**Timeline:** Weeks 9-10 (2026-05-22 through 2026-06-06)  
**Effort:** 15 hours  
**Owner:** IT + Security  
**Auditor Access Period:** 2026-05-22 through 2026-07-17 (8 weeks)

---

## MISSION STATEMENT

Prepare Lexora's user access controls, security infrastructure, and administrative procedures to safely grant Big 4 auditor read-only access to all financial data during the audit period.

**Success Criteria:**
- All user access documented and roles verified
- Auditor account created with appropriate read-only restrictions
- Network security configured for remote auditor access
- Access logs clean and immutable
- System ready for Big 4 auditor to begin fieldwork

---

## DELIVERABLES OVERVIEW

### Deliverable 1: USER_ACCESS_AUDIT.md
**Status:** ✓ COMPLETED  
**Location:** `/exports/USER_ACCESS_AUDIT.md`

**Contains:**
- Comprehensive user access structure (16 roles documented)
- Multi-company access via user_societes junction table
- Role hierarchy and RLS policy architecture
- Dormant account verification procedures
- Current system security status assessment
- SQL queries for access verification

**Key Findings:**
- ✓ Role-based access control properly implemented
- ✓ RLS policies on all sensitive tables
- ✓ Audit trail immutable (triggers + RLS prevent modification)
- ✓ SOD matrix enforced at database level
- ⚠ Admin password policy compliance: NEEDS VERIFICATION
- ⚠ 2FA status: NEEDS VERIFICATION

### Deliverable 2: ADMIN_ACCESS_CONTROLS.md
**Status:** ✓ COMPLETED  
**Location:** `/exports/ADMIN_ACCESS_CONTROLS.md`

**Contains:**
- Admin role definition (admin vs. super_admin)
- Detailed permissions matrix (32 operations documented)
- API authorization code (`requireAdmin()` function)
- Admin account security requirements:
  - Password policy (12+ chars, 90-day rotation)
  - 2FA enablement (TOTP/SMS)
  - Session management (30-minute timeout)
  - IP whitelisting (optional)
- Separation of Duties enforcement
- Admin activity audit trail queries
- Incident response procedures
- Monthly/quarterly verification checklist

**Key Controls:**
- ✓ All admin operations require `requireAdmin()` gate check
- ✓ All changes logged to immutable audit_trail
- ✓ SOD prevents self-approval on transactions > 10,000 MUR
- ✓ Super-admin can modify other admins
- ⚠ Password rotation & 2FA: NEEDS VERIFICATION

### Deliverable 3: NETWORK_SECURITY_CHECKLIST.md
**Status:** ✓ COMPLETED  
**Location:** `/exports/NETWORK_SECURITY_CHECKLIST.md`

**Contains:**
- Transport layer security (HTTPS/TLS 1.2+)
- Database encryption (Supabase SSL/TLS)
- Network architecture diagram
- VPN configuration (optional for remote auditors)
- IP whitelisting procedures
- DDoS protection and rate limiting
- Firewall rules verification
- Certificate and key management
- Security monitoring procedures
- Pre/during/post-audit checklists

**Key Verifications:**
- ✓ HTTPS/TLS 1.2+ mandatory (Vercel enforced)
- ✓ Database SSL/TLS configured (Supabase managed)
- ✓ API authentication required (JWT tokens)
- ✓ DDoS protection (Vercel CDN automatic)
- ⚠ VPN configuration: TO DETERMINE (depends on auditor location)
- ⚠ IP whitelisting: TO CONFIGURE (if required)

### Deliverable 4: AUDITOR_ACCESS_SETUP.md
**Status:** PENDING (PHASE 5 EXECUTION)  
**Location:** `/exports/AUDITOR_ACCESS_SETUP.md`

**To Include:**
- Auditor role creation procedure
- Credentials generation and secure delivery
- 2FA setup walkthrough
- Access duration management (8-week expiry)
- Auditor RLS policies
- API-level read-only enforcement
- Credential rotation procedures
- Access revocation procedure

### Deliverable 5: DATA_ACCESS_LOGS_SAMPLE.csv
**Status:** PENDING (PHASE 5 EXECUTION)  
**Location:** `/exports/DATA_ACCESS_LOGS_SAMPLE.csv`

**To Contain:**
- 30-day sample of system access logs
- Columns: timestamp, user_email, user_role, action, table_name, row_id, ip_address
- Sensitive data masked:
  - Passwords: [MASKED]
  - API keys: [MASKED]
  - Bank accounts: Last 4 digits only
  - Salaries: [MASKED]
  - Employee SIRETs: Last 4 digits only

### Deliverable 6: SENSITIVE_DATA_MASKING_VERIFICATION.md
**Status:** PENDING (PHASE 5 EXECUTION)  
**Location:** `/exports/SENSITIVE_DATA_MASKING_VERIFICATION.md`

**To Include:**
- Data classification matrix (SECRET, SENSITIVE, CONFIDENTIAL)
- Masking rules per data type
- SQL queries demonstrating masking
- Audit log spot-checks
- Verification that no sensitive data leaks in logs

---

## EXECUTION ROADMAP (WEEKS 9-10)

### Week 9 (2026-05-22 to 2026-05-28)

#### Days 1-2: Verification Phase
**Tasks:**
1. Run user access audit queries
   ```sql
   SELECT p.id, p.email, p.role, p.is_active, COUNT(DISTINCT us.societe_id) as companies
   FROM profiles p
   LEFT JOIN user_societes us ON us.user_id = p.id
   WHERE p.is_active = true
   GROUP BY p.id
   ORDER BY p.role;
   ```

2. Verify admin accounts
   ```sql
   SELECT p.email, p.role, a.last_password_change, 
          CURRENT_DATE - a.last_password_change::date as days_since_change
   FROM profiles p
   JOIN auth.users a ON a.id = p.id
   WHERE p.role IN ('admin', 'super_admin');
   ```

3. Check dormant accounts (no login > 90 days)
   ```sql
   SELECT p.email, p.role, a.last_sign_in_at,
          CURRENT_DATE - a.last_sign_in_at::date as days_inactive
   FROM profiles p
   LEFT JOIN auth.users a ON a.id = p.id
   WHERE p.is_active = true
   AND a.last_sign_in_at < CURRENT_DATE - INTERVAL '90 days';
   ```

4. Test HTTPS/TLS configuration
   ```bash
   curl -I https://lexora.app
   openssl s_client -connect lexora.app:443 -tls1_2
   ```

**Output:** User access audit report with findings

#### Days 3-4: Admin Security Verification
**Tasks:**
1. Verify password policy compliance
   - Check all admin passwords changed within 90 days
   - Plan password updates for non-compliant accounts

2. Verify 2FA enrollment
   - Confirm all admin accounts have MFA enabled
   - Test TOTP enrollment process
   - Generate recovery codes

3. Document admin account holders
   - Email, full name, department, business justification
   - Creation date, last password change, 2FA status

**Output:** Admin Access Controls documentation with verification checklist

#### Days 5-7: Network Security & Auditor Preparation
**Tasks:**
1. Network security verification
   - Verify HTTPS/TLS 1.2+ on all endpoints
   - Test database SSL/TLS connection
   - Verify API authentication
   - Test rate limiting

2. Determine auditor access method
   - Office-only access?
   - VPN required?
   - Public internet with 2FA only?

3. Plan auditor account creation
   - Credentials to be generated
   - 2FA setup procedure
   - Access duration: 2026-05-22 to 2026-07-17

**Output:** Network Security Checklist with decisions documented

### Week 10 (2026-05-29 to 2026-06-06)

#### Days 1-3: Auditor Account Creation & Setup
**Tasks:**
1. Create auditor user account
   ```bash
   curl -X POST https://lexora.app/api/admin/users \
     -H "Content-Type: application/json" \
     -d '{
       "email": "auditor_big4@lexora.app",
       "password": "[random 20-char password]",
       "full_name": "Big 4 Auditor",
       "role": "auditor",
       "societe_ids": ["4411", "4412", "4410"]
     }'
   ```

2. Generate credentials securely
   - Temporary password: [generated, shared via secure channel]
   - Recovery codes: [generated, printed, stored securely]

3. Setup 2FA (TOTP)
   - Auditor enrolls authenticator app (Google Authenticator, Authy, etc.)
   - Recovery codes backup
   - Test login with TOTP code

4. Create API key for auditor (if needed)
   - Limited to SELECT operations
   - Rate limited to 100 req/min
   - Expires 2026-07-17

**Output:** Auditor credentials and access documentation

#### Days 4-5: Log Preparation & Data Export
**Tasks:**
1. Extract 30-day audit trail sample
   ```sql
   SELECT timestamp, user_email, user_role, action, table_name, 
          description, ip_address
   FROM public.audit_trail
   WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'
   ORDER BY timestamp DESC
   LIMIT 5000;
   ```

2. Apply data masking rules
   - Remove password fields
   - Mask API keys (show only last 6 chars)
   - Mask bank accounts (show only last 4 digits)
   - Mask salary amounts
   - Mask employee SIRETs (show only last 4 digits)

3. Export to CSV
   - Format: `/exports/DATA_ACCESS_LOGS_SAMPLE.csv`
   - Columns: timestamp, user_email, user_role, action, table_name, ip_address

4. Verify no sensitive data leaked
   - Grep for password patterns: [NONE]
   - Grep for API key patterns: [NONE]
   - Grep for bank account patterns: [Properly masked]
   - Grep for salary amounts: [Properly masked]

**Output:** DATA_ACCESS_LOGS_SAMPLE.csv (30-day sample, masked)

#### Days 6-7: Final Documentation & Delivery
**Tasks:**
1. Create AUDITOR_ACCESS_SETUP.md
   - Account creation procedure
   - Credentials delivery protocol
   - 2FA setup walkthrough
   - RLS policies for auditor role
   - Access revocation procedure (for 2026-07-17)

2. Create SENSITIVE_DATA_MASKING_VERIFICATION.md
   - Data classification matrix
   - Masking rules documentation
   - SQL examples showing masking
   - Spot-check audit logs
   - Verification statement

3. Final audit readiness verification
   - All users documented: ✓
   - Admin access controls documented: ✓
   - Network security verified: ✓
   - Auditor account created: ✓
   - Access logs prepared: ✓
   - Sensitive data masked: ✓

4. Deliver credentials to auditor liaison
   - Email with temporary password (subject line only, no body)
   - SMS with 2FA setup link
   - Printed recovery codes (hand-delivered if possible)

**Output:** All 6 deliverables completed, auditor ready for access

---

## CRITICAL PATH & DEPENDENCIES

```
Week 9, Days 1-2: User Access Audit Verification
        ↓
Week 9, Days 3-4: Admin Security Verification
        ↓
Week 9, Days 5-7: Network Security Verification
        ↓
Week 10, Days 1-3: Auditor Account Creation
        ↓
Week 10, Days 4-5: Log Extraction & Data Masking
        ↓
Week 10, Days 6-7: Final Documentation & Delivery
        ↓
2026-05-22: AUDITOR FIELDWORK BEGINS (8-week audit period)
```

---

## SIGN-OFF & APPROVALS

### IT Security Team
- [ ] User access audit verified
- [ ] Admin access controls documented
- [ ] Network security configuration confirmed
- [ ] Auditor account setup completed
- [ ] 2FA enrollment verified

**Sign-off:** _________________ Date: _______

### Finance Director
- [ ] Access audit reviewed
- [ ] Admin account holders verified
- [ ] Auditor access period confirmed (8 weeks)
- [ ] Ready for audit fieldwork

**Sign-off:** _________________ Date: _______

### Big 4 Auditor Liaison
- [ ] Received auditor credentials
- [ ] 2FA setup confirmed
- [ ] Access period acknowledged (2026-05-22 to 2026-07-17)
- [ ] Ready to begin fieldwork

**Sign-off:** _________________ Date: _______

---

## REFERENCE DOCUMENTS

All documents stored in: `/home/user/v0-lexora-accounting-saa-s/exports/`

1. **USER_ACCESS_AUDIT.md** - User access structure & verification
2. **ADMIN_ACCESS_CONTROLS.md** - Admin security & permissions
3. **NETWORK_SECURITY_CHECKLIST.md** - Transport & network security
4. **AUDITOR_ACCESS_SETUP.md** - Auditor account creation (to create)
5. **DATA_ACCESS_LOGS_SAMPLE.csv** - 30-day audit logs, masked (to create)
6. **SENSITIVE_DATA_MASKING_VERIFICATION.md** - Data masking verification (to create)

---

## POST-AUDIT CLEANUP (After 2026-07-17)

**Immediate (Day of audit completion):**
1. [ ] Disable auditor account (set is_active = false)
2. [ ] Invalidate all auditor sessions
3. [ ] Revoke 2FA on auditor account
4. [ ] Revoke any temporary API keys

**Within 1 week:**
1. [ ] Delete recovery codes (or securely archive)
2. [ ] Remove VPN certificate (if used)
3. [ ] Archive audit logs for compliance retention
4. [ ] Post-audit security review

**Documentation:**
1. [ ] Final audit trail export (8-week period)
2. [ ] Access summary report (what was accessed when)
3. [ ] Compliance confirmation (all controls held)

---

## CONTACT & ESCALATION

**During Execution (Weeks 9-10):**
- IT Manager: [TO FILL IN]
- Security Lead: [TO FILL IN]
- Finance Director: [TO FILL IN]

**During Audit Period (8 weeks):**
- Auditor Support: [TO FILL IN]
- Emergency Escalation: [TO FILL IN - 24/7]

**Post-Audit:**
- Audit Liaison: [TO FILL IN]
- Compliance Officer: [TO FILL IN]

---

## APPENDIX: QUICK START COMMANDS

### Verify User Access
```bash
# Run in Supabase SQL Editor
SELECT COUNT(*) as total_users, 
       COUNT(CASE WHEN is_active THEN 1 END) as active_users,
       COUNT(DISTINCT role) as unique_roles
FROM public.profiles;
```

### Create Auditor Account (Post-Phase-5)
```bash
curl -X POST https://lexora.app/api/admin/users \
  -H "Authorization: Bearer [ADMIN_JWT]" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "auditor_big4@lexora.app",
    "password": "[20-character random password]",
    "full_name": "Big 4 Auditor",
    "role": "auditor"
  }'
```

### Test Auditor Access
```bash
# Login as auditor
curl -X POST https://lexora.app/api/auth/login \
  -d '{"email": "auditor_big4@lexora.app", "password": "..."}' \
  -c cookies.txt

# Query GL entries
curl -X GET https://lexora.app/api/audit/gl-entries \
  -b cookies.txt
# Expected: 200 OK with GL entries, no INSERT/UPDATE/DELETE allowed
```

### Extract Audit Logs
```bash
psql "postgresql://..." -c "
SELECT timestamp, user_email, action, table_name 
FROM audit_trail 
WHERE timestamp > NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;" > audit_logs.csv
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Status:** READY FOR PHASE 5 EXECUTION  
**Next Milestone:** Auditor fieldwork begins (2026-05-22)
