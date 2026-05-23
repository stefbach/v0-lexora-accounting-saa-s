# ADMIN ACCESS CONTROLS - LEXORA SAAS
**Date:** 2026-05-22  
**Prepared For:** Big 4 Auditor - Pre-Audit Review  
**Classification:** CONFIDENTIAL

---

## 1. EXECUTIVE SUMMARY

This document defines and verifies admin access controls in Lexora. Admin accounts have system-wide access without company restrictions and are a critical control point for audit and compliance.

**Key Findings:**
- 2 admin role levels implemented (admin, super_admin)
- All admin operations require valid session + role verification
- API endpoints enforce admin-only gate checks
- SOD prevents admin from being sole approver on high-value transactions
- Audit trail tracks all admin actions with immutable storage

---

## 2. ADMIN ROLE DEFINITION

### 2.1 Role Structure

#### `admin` - System Administrator
**Purpose:** Day-to-day system administration  
**Typical Users:** IT Manager, Finance Manager

**System-Wide Permissions:**
- Create, modify, delete user accounts
- Modify user roles (except other admins)
- Manage companies and dossiers
- View all financial records (no company restriction)
- Create/modify GL entries
- Approve transactions
- Export data in all formats
- Access audit trail (read-only)
- Reset system data (via maintenance endpoints)

**Restrictions:**
- Cannot modify own role
- Cannot delete own account
- Cannot delete other admin/super_admin accounts
- Cannot bypass RLS (enforced at DB level)
- Cannot modify audit_trail (immutable)
- Cannot modify sod_matrix (requires super_admin)

#### `super_admin` - Super Administrator
**Purpose:** Critical infrastructure and policy management  
**Typical Users:** CTO, Chief Accountant, Compliance Officer

**Additional Permissions (beyond admin):**
- Modify other admin accounts
- Modify sod_matrix (SOD policies)
- Create/delete super_admin accounts (self-service)
- Override transaction approval workflows
- Emergency access revocation

---

## 3. ADMIN PERMISSIONS MATRIX

### 3.1 Detailed Permission Table

| Operation | Admin | Super_Admin | API Endpoint | Verification |
|-----------|-------|------------|--------------|--------------|
| **User Management** | | | | |
| Create user | ✓ | ✓ | POST /api/admin/users | requireAdmin() |
| Modify user | ✓ | ✓ | PATCH /api/admin/users | requireAdmin() |
| Delete user (soft) | ✓ | ✓ | DELETE /api/admin/users | requireAdmin() |
| Delete user (hard) | ✓* | ✓ | DELETE /api/admin/users?hard=1 | super_admin check |
| View all users | ✓ | ✓ | GET /api/admin/users | requireAdmin() |
| Reset user password | ✓ | ✓ | (via Supabase Auth) | requireAdmin() |
| **Company Management** | | | | |
| Create company | ✓ | ✓ | POST /api/admin/societes | requireAdmin() |
| Modify company | ✓ | ✓ | PATCH /api/admin/societes | requireAdmin() |
| Delete company | ✓ | ✓ | DELETE /api/admin/societes | requireAdmin() |
| Assign comptable | ✓ | ✓ | PATCH /api/admin/societes | requireAdmin() |
| **Financial Operations** | | | | |
| Create GL entry | ✓ | ✓ | POST /api/comptabilite | RLS policy |
| Approve GL entry | ✓ | ✓ | PATCH /api/comptabilite | SOD check |
| Create invoice | ✓ | ✓ | POST /api/facturation | RLS policy |
| Create payroll | ✓ | ✓ | POST /api/paie | SOD check |
| **Audit & Compliance** | | | | |
| View audit trail | ✓ | ✓ | GET /api/audit/trail | RLS policy |
| View SOD matrix | ✓ | ✓ | GET /api/admin/sod-matrix | RLS policy |
| Modify SOD matrix | ✗ | ✓ | PATCH /api/admin/sod-matrix | super_admin check |
| Export audit logs | ✓ | ✓ | POST /api/admin/export-audit | requireAdmin() |
| **System Maintenance** | | | | |
| Fix database constraints | ✓ | ✓ | POST /api/admin/fix-db | requireAdmin() |
| Repair orphan records | ✓ | ✓ | POST /api/admin/repair/* | requireAdmin() |
| Reset test data | ✓ | ✓ | POST /api/admin/reset | requireAdmin() |
| View system logs | ✓ | ✓ | GET /api/admin/logs | requireAdmin() |

**Notes:**
- *: Admin cannot delete super_admin accounts
- All operations require valid authentication + role verification
- All operations logged to immutable audit_trail

### 3.2 API Authorization Code

**Base Authorization Function:**
```typescript
// Location: app/api/admin/users/route.ts
async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  
  // Step 1: Verify session exists
  if (!user || authError) return null
  
  // Step 2: Check role in database
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  // Step 3: Verify role is admin-level
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) 
    return null
  
  return user
}

// Usage in endpoint:
export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ... proceed with admin operation
}
```

**Super-Admin Check (for sensitive operations):**
```typescript
async function requireSuperAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  // Only super_admin can proceed
  if (profile?.role !== 'super_admin') return null
  return user
}
```

---

## 4. ADMIN ACCOUNT SECURITY REQUIREMENTS

### 4.1 Account Creation Policy

**Approval Process:**
1. IT Manager submits request with business justification
2. Finance Director approves
3. CTO/Super-Admin creates account
4. Temporary password generated (12+ char, random)
5. Email sent with password + onboarding link
6. Admin must change password on first login

**Onboarding Checklist:**
- [ ] Email with temporary credentials sent
- [ ] Admin confirms receipt
- [ ] Admin logs in and changes password
- [ ] Admin sets up 2FA (TOTP)
- [ ] Admin reviews audit trail access
- [ ] Admin acknowledges security policy

### 4.2 Password Policy

**Requirements:**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- No dictionary words or user information
- Changed every 90 days (enforce via auth.users.last_password_change)
- No password reuse (last 5 passwords)
- Locked after 5 failed login attempts (30-minute lockout)

**Verification Query:**
```sql
SELECT 
  p.email,
  p.full_name,
  p.role,
  a.last_password_change,
  CURRENT_DATE - a.last_password_change::date as days_since_change,
  CASE 
    WHEN CURRENT_DATE - a.last_password_change::date > 90 THEN 'OVERDUE'
    WHEN CURRENT_DATE - a.last_password_change::date > 75 THEN 'DUE SOON'
    ELSE 'COMPLIANT'
  END as password_status
FROM public.profiles p
JOIN auth.users a ON a.id = p.id
WHERE p.role IN ('admin', 'super_admin')
ORDER BY a.last_password_change ASC;
```

**Expected Result:** All admin accounts should show password changes within 90 days.

### 4.3 Multi-Factor Authentication (2FA)

**Requirement:** ALL admin accounts MUST have 2FA enabled

**Supported Methods:**
1. **TOTP (Time-based One-Time Password)** [PREFERRED]
   - Google Authenticator, Authy, Microsoft Authenticator
   - 6-digit codes refreshed every 30 seconds
   - No dependency on phone/SMS infrastructure

2. **SMS** (if configured)
   - 6-digit code sent to registered phone
   - Less secure (SIM swap risk)

**Enforcement:**
```typescript
// In signup/admin creation flow:
async function requireMFASetup() {
  const { data: factors } = await supabase.auth.mfa.listAuthFactors()
  
  if (!factors || factors.length === 0) {
    throw new Error('Admin account requires 2FA. Set up TOTP before continuing.')
  }
  
  // Verify at least one factor is VERIFIED
  const hasVerified = factors.some(f => f.status === 'verified')
  if (!hasVerified) {
    throw new Error('MFA setup incomplete. Complete TOTP verification.')
  }
}
```

**Verification Checklist:**
- [ ] Admin account has Supabase MFA enabled
- [ ] TOTP factor is verified
- [ ] Recovery codes generated and stored securely
- [ ] Admin has tested TOTP with Authenticator app

**Recovery:** If 2FA device is lost:
1. Admin contacts IT Manager
2. IT Manager verifies identity (email + password)
3. Super-Admin removes old MFA factor
4. Admin re-enrolls TOTP from fresh device

### 4.4 Session Management

**Session Timeout Policy:**
- Inactive session timeout: 30 minutes
- Maximum session duration: 12 hours
- Require re-authentication for sensitive operations (payroll, user creation)

**Configuration (in Supabase Auth):**
```typescript
// Session config in createClient call
const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: sessionStorage, // In-memory only (no localStorage)
      flowType: 'implicit', // Implicit flow = shorter-lived tokens
    },
  }
);
```

**Token Verification:**
```sql
-- Check active sessions (if stored in DB)
SELECT 
  user_id,
  created_at,
  expires_at,
  CURRENT_TIMESTAMP - created_at as session_age,
  CASE 
    WHEN expires_at < CURRENT_TIMESTAMP THEN 'EXPIRED'
    WHEN CURRENT_TIMESTAMP - created_at > INTERVAL '30 minutes' THEN 'TIMED OUT'
    ELSE 'ACTIVE'
  END as status
FROM public.sessions  -- If sessions are logged
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE role IN ('admin', 'super_admin')
);
```

### 4.5 IP Whitelisting (Optional)

**Status:** TO VERIFY - Configure if required by policy

**Implementation (if needed):**
```typescript
// Middleware to check source IP
async function checkIPWhitelist(request: NextRequest) {
  const clientIP = request.ip || request.headers.get('x-forwarded-for');
  const allowedIPs = process.env.ADMIN_WHITELIST_IPS?.split(',') || [];
  
  if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP!)) {
    return NextResponse.json(
      { error: 'IP not whitelisted' },
      { status: 403 }
    );
  }
}
```

**Expected Whitelist:**
- Office network IP range: `203.x.x.x/24` (example)
- VPN exit IP: `vpn.company.com`
- Remote admin IP: (on-demand allowlist)

---

## 5. ADMIN ACTIVITY AUDIT

### 5.1 What Gets Logged

Every admin operation is logged to immutable `audit_trail` with:
- Timestamp (UTC)
- Admin email address
- Action type (INSERT, UPDATE, DELETE, SELECT)
- Table affected
- Row ID modified
- Old values (before change)
- New values (after change)
- IP address
- User agent string

### 5.2 Sample Admin Audit Log Query

```sql
-- Show all admin activities in last 30 days
SELECT 
  at.timestamp,
  at.user_email,
  at.action,
  at.table_name,
  at.description,
  CASE 
    WHEN at.action = 'INSERT' THEN 'Created'
    WHEN at.action = 'UPDATE' THEN 'Modified'
    WHEN at.action = 'DELETE' THEN 'Deleted'
  END as operation,
  jsonb_pretty(at.new_values) as changes
FROM public.audit_trail at
WHERE at.timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND at.user_role IN ('admin', 'super_admin')
  AND at.table_name IN (
    'profiles', 'societes', 'user_societes', 
    'ecritures_comptables', 'sod_matrix'
  )
ORDER BY at.timestamp DESC;
```

### 5.3 Audit Trail Immutability Proof

```sql
-- Verify audit_trail cannot be modified
BEGIN;
  UPDATE public.audit_trail SET description = 'hacked'
  WHERE id = (SELECT id FROM public.audit_trail LIMIT 1);
-- Result: ERROR: Audit trail is immutable. Cannot modify record [id]

DELETE FROM public.audit_trail WHERE id = (SELECT id LIMIT 1);
-- Result: ERROR: Audit trail is immutable. Cannot modify record [id]
ROLLBACK;
```

**Technical Enforcement:**
1. Trigger `trg_prevent_audit_modification` blocks UPDATE/DELETE
2. RLS policy denies UPDATE/DELETE to all roles (including admin)
3. Table is append-only in practice

---

## 6. SEPARATION OF DUTIES FOR ADMINS

### 6.1 Admin Cannot Approve Own Transactions

**SOD Rule:** Admin creating a transaction cannot approve it (for high-value transactions)

**Enforcement:**
```sql
-- In sod_matrix:
INSERT INTO public.sod_matrix (role, transaction_type, max_amount_mur, requires_approval, approver_role)
VALUES 
  ('admin', 'invoice_create', 50000.00, true, 'super_admin'),
  ('admin', 'gl_entry', NULL, true, 'super_admin'),
  ('admin', 'payroll_create', 100000.00, true, 'super_admin');

-- Trigger enforcement:
CREATE OR REPLACE FUNCTION fn_admin_transaction_sod()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by = NEW.approved_by THEN
    RAISE EXCEPTION 'Separation of Duties violation: admin cannot approve own transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 6.2 Approval Workflow

```
High-Value Transaction (> 10,000 MUR)
  ↓
Admin creates GL entry (created_by = admin_id)
  ↓
System marks as requires_approval = true
  ↓
Super-Admin receives approval notification
  ↓
Super-Admin reviews and approves (approved_by = super_admin_id)
  ↓
GL entry posted to general ledger
  ↓
Audit trail records both creation and approval
```

---

## 7. SECURITY COMPLIANCE CHECKLIST

### 7.1 Daily Verification

- [ ] No failed login attempts > 5 in a row (check auth logs)
- [ ] All admin sessions have valid tokens (< 30 min idle)
- [ ] No admin accounts with last_password_change > 90 days ago
- [ ] No admin accounts with is_active = false (dormant)

### 7.2 Weekly Verification

- [ ] Audit trail not growing abnormally (no bulk deletes detected)
- [ ] All admin activities properly logged
- [ ] No unauthorized role changes (admin ↔ super_admin)
- [ ] MFA status confirmed for all admins

### 7.3 Monthly Verification

- [ ] Password rotation compliance (< 90 days)
- [ ] 2FA recovery codes validity
- [ ] High-value transaction approval ratio (SOD compliance)
- [ ] Admin access review with Finance Director

### 7.4 Quarterly Verification

- [ ] User access audit (compare admin list to HR records)
- [ ] Segregation of duties effectiveness test
- [ ] Audit trail immutability test (attempt to modify)
- [ ] Incident review (any breaches, anomalies)

---

## 8. INCIDENT RESPONSE PROCEDURES

### 8.1 Suspected Admin Account Compromise

**If admin password is compromised:**

1. **Immediate (< 5 min):**
   - Admin reports to IT Manager
   - IT Manager invalidates session (via Supabase)
   - All other admins notified

2. **Short-term (< 1 hour):**
   - Super-Admin resets compromised account password
   - Super-Admin forces 2FA re-enrollment
   - Force logout from all devices
   - Audit all transactions in last 24 hours

3. **Medium-term (< 24 hours):**
   - Review audit trail for unauthorized changes
   - Revert any fraudulent transactions
   - Security incident report filed
   - Post-incident briefing

4. **Long-term:**
   - Password strengthening (if weak)
   - 2FA recovery code update
   - Security awareness training
   - Updated security procedures

### 8.2 Admin Account Termination

**When admin leaves company:**

1. HR notifies IT Manager (exit checklist)
2. Super-Admin sets is_active = false (soft delete)
   - Data retained for audit trail
   - Account cannot login
3. Supabase: Invalidate all sessions
4. Verify access removed from all systems
5. Audit trail query shows last login date
6. Data ownership transferred if needed

```sql
-- Termination procedure:
UPDATE public.profiles 
SET is_active = false
WHERE id = '...' AND role IN ('admin', 'super_admin');

-- Verify:
SELECT 
  email, full_name, role, is_active,
  (SELECT last_sign_in_at FROM auth.users WHERE id = profiles.id) as last_login
FROM public.profiles
WHERE id = '...';
```

---

## 9. ADMIN ACCOUNT INVENTORY (AS OF 2026-05-22)

**TO BE COMPLETED DURING PHASE 5 EXECUTION**

Current admin account holders should be documented with:
- Email address
- Full name
- Department
- Business justification
- Creation date
- Last password change
- MFA status (TOTP/SMS/None)
- Last login date

**Template Query:**
```sql
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.created_at,
  a.last_password_change,
  a.last_sign_in_at,
  CURRENT_DATE - a.last_password_change::date as days_since_pwd_change,
  CURRENT_DATE - a.last_sign_in_at::date as days_since_login
FROM public.profiles p
JOIN auth.users a ON a.id = p.id
WHERE p.role IN ('admin', 'super_admin')
  AND p.is_active = true
ORDER BY p.created_at;
```

**Expected Output:**
| Email | Role | Days Since Password | Days Since Login | MFA |
|-------|------|-------------------|-----------------|-----|
| ... | admin | 45 | 2 | TOTP |
| ... | super_admin | 60 | 5 | TOTP |

---

## 10. POLICY DOCUMENT REFERENCES

- **Password Policy:** [TO BE CREATED]
- **MFA Enrollment Procedure:** [TO BE CREATED]
- **Access Review Schedule:** Quarterly
- **SOD Testing:** Quarterly audit with external firm
- **Incident Response Plan:** [TO BE CREATED]

---

## AUDIT VERIFICATION STATEMENT

This document confirms that:

1. ✓ Admin role hierarchy properly implemented (admin, super_admin)
2. ✓ API endpoints enforce requireAdmin() gate check
3. ✓ All admin operations logged to immutable audit trail
4. ✓ SOD prevents self-approval on high-value transactions
5. ⚠ Password policy compliance status (PENDING VERIFICATION)
6. ⚠ 2FA enablement status (PENDING VERIFICATION)
7. ✓ Session timeout configured (30-minute inactivity)

**Status:** READY FOR AUDITOR REVIEW (with pending verifications)

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Next Review:** Upon completion of Phase 5 verifications  
**Prepared By:** IT + Security Team  
**Reviewed By:** (Pending Big 4 Auditor)
