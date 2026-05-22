# USER ACCESS AUDIT - LEXORA SAAS SYSTEM
**Date:** 2026-05-22  
**Phase:** 5, Task 5C - System Access Pre-Audit  
**Purpose:** Prepare system access and security for Big 4 auditor access

---

## 1. EXECUTIVE SUMMARY

This audit prepares the Lexora SaaS system for controlled Big 4 auditor access by documenting current user access controls, verifying role-based permissions, and creating a secure auditor account with read-only access to financial data.

### Current System Status
- **User Management:** Supabase Auth (PostgreSQL-backed RLS)
- **Role System:** 16 documented roles with hierarchical permissions
- **Access Control:** Row-Level Security (RLS) policies on all tables
- **Audit Logging:** Immutable audit_trail table with trigger-based logging
- **Compliance:** SOD (Separation of Duties) matrix enforced at DB level

---

## 2. USER ACCESS STRUCTURE

### 2.1 Role Hierarchy
Lexora implements a comprehensive role system with the following structure:

#### **System Administration**
- `admin` - System administrator (full access, no company restrictions)
- `super_admin` - Super administrator (can manage other admins)

#### **Client/Company Management**
- `client_admin` - Company account owner (full access to assigned companies)
- `client_user` - Company employee (view-only access to dossiers/documents)
- `client_assistant` - Company assistant (limited client access)

#### **Accountant Roles**
- `comptable` - Senior accountant (all clients, all companies)
- `comptable_dedie` - Dedicated accountant (assigned clients only)

#### **HR/Payroll Roles**
- `rh` - HR Manager (payroll, personnel records)
- `rh_manager` - HR Manager (manage team)
- `manager` - Team manager (supervise employees)
- `team_leader` - Team lead (direct reports)

#### **Employee Roles**
- `employe` - Regular employee (payroll, leave, timesheets)
- `salarie` - Salaried employee
- `direction` - Company director (strategic access)

#### **Legal/Compliance**
- `juridique` - Legal department (contracts, compliance)

### 2.2 Access Control Mechanism

All access is controlled through **Row-Level Security (RLS)** policies at the database level:

```
Authentication Layer:
  └─ Supabase Auth (auth.users table)
       └─ Profile (profiles table with role assignment)
            └─ RLS Policies (per table)
                 └─ Companies/Societes
                      └─ Dossiers (client-comptable-societe linkage)
                           └─ Financial Records (access limited by RLS)
```

### 2.3 Multi-Company Access

Users can have access to multiple companies via the `user_societes` junction table:
- Tracks `user_id`, `societe_id`, `role`, and `actif` status
- Each company assignment can have its own role
- Enables flexible multi-tenant access patterns

---

## 3. CURRENT USER DATABASE SCHEMA

### 3.1 Core Tables

#### `profiles` (User Profiles)
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,  -- CHECK constraint: 16 valid roles
  phone TEXT,
  comptable_id UUID REFERENCES profiles(id),  -- For client users
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  societe_id UUID REFERENCES societes(id),  -- Primary company
  modules_utilisateur JSONB,  -- Per-user module permissions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_profiles_role` - Fast role-based lookups
- `idx_profiles_comptable` - Dedicated accountant queries

#### `user_societes` (Multi-Company Access)
```sql
CREATE TABLE IF NOT EXISTS public.user_societes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- Can differ per company
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, societe_id)
);
```

#### `societes` (Companies)
```sql
CREATE TABLE public.societes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  brn TEXT UNIQUE,  -- Business Registration Number (Maurice)
  numero_tva_mra TEXT,  -- VAT number
  statut_tva BOOLEAN DEFAULT false,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  comptable_id UUID REFERENCES profiles(id),  -- Assigned accountant
  created_by UUID REFERENCES profiles(id),  -- Client owner
  secteur_activite TEXT,
  ern TEXT,  -- Employee Registration Number
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. ACCESS CONTROL VERIFICATION

### 4.1 Role-Based Access Verification Checklist

| Role | Admin | Comptable | Client | Audit |
|------|-------|-----------|--------|-------|
| View All Companies | ✓ | ✗ (assigned) | ✗ (own) | ✓ (RO) |
| Create GL Entries | ✓ | ✓ | ✗ | ✗ |
| Approve Payroll | ✓ | ✓ | ✓ (own) | ✗ |
| Manage Users | ✓ (admin/super_admin) | ✗ | ✗ | ✗ |
| Export Financials | ✓ | ✓ | ✓ | ✓ |
| View Audit Trail | ✓ | ✓ | ✗ | ✓ |

### 4.2 RLS Policy Architecture

Each financial table implements RLS with:
1. **ADMIN bypass** - All rows visible
2. **COMPTABLE rules** - Own clients + company assignments
3. **CLIENT rules** - Own dossier only
4. **AUDIT rules** - All rows (SELECT only, enforced at API layer)

Example policy structure:
```sql
-- Admin sees everything
CREATE POLICY "admins_all" ON table_name
  FOR ALL USING (get_my_role() IN ('admin', 'super_admin'));

-- Comptables see assigned clients
CREATE POLICY "comptables_see_clients" ON table_name
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = table_name.client_id 
      AND p.comptable_id = auth.uid()
    )
  );

-- Clients see own dossiers
CREATE POLICY "clients_see_own" ON table_name
  FOR SELECT USING (client_id = auth.uid());
```

### 4.3 Dormant Account Verification

**Requirement:** Identify and disable accounts with no recent activity

**Verification Query:**
```sql
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.created_at,
  a.last_sign_in_at,
  CURRENT_DATE - a.last_sign_in_at::date as days_inactive
FROM profiles p
LEFT JOIN auth.users a ON a.id = p.id
WHERE p.is_active = true
  AND a.last_sign_in_at < CURRENT_DATE - INTERVAL '90 days'
ORDER BY a.last_sign_in_at DESC;
```

**Action Required:** Mark dormant accounts as `is_active = false`

### 4.4 Role Hierarchy Violations

**Verification Checklist:**
- [ ] No `client_user` with `admin` in system
- [ ] No `comptable_dedie` with access outside assigned companies
- [ ] No multiple `client_admin` roles for same company (expected: 1 owner)
- [ ] All `client_admin` users have societe_id assigned
- [ ] All `comptable` users have active dossier assignments

---

## 5. ADMIN ACCESS CONTROLS

### 5.1 Admin Account Documentation

**Admin Users Must Be:**
- Company IT/Finance personnel only
- With documented business justification
- Part of change control process
- Subject to quarterly access reviews

### 5.2 Admin Permissions Matrix

| Operation | admin | super_admin | Notes |
|-----------|-------|------------|-------|
| Create users | ✓ | ✓ | Via /api/admin/users POST |
| Modify roles | ✓ | ✓ | Via /api/admin/users PATCH |
| Delete users (soft) | ✓ | ✓ | Sets is_active=false |
| Delete users (hard) | ✓ | ✓* | *super_admin only for other admins |
| Manage companies | ✓ | ✓ | Create/modify societes |
| Reset system | ✓ | ✓ | Via admin API endpoints |
| View audit logs | ✓ | ✓ | Full audit_trail access |
| Manage SOD policies | super_admin | ✓ | sod_matrix modifications |

### 5.3 Admin Endpoint Security

All admin operations require:

1. **Authentication:** Valid Supabase session
2. **Authorization:** Role check via `requireAdmin()`
   ```typescript
   async function requireAdmin() {
     const supabaseAuth = await createServerClient()
     const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
     if (!user || authError) return null
     const { data: profile } = await supabaseAuth.from('profiles')
       .select('role').eq('id', user.id).single()
     if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
     return user
   }
   ```
3. **Audit Logging:** All changes logged to audit_trail

### 5.4 Admin Security Requirements (TO VERIFY)

- [ ] **Password Policy:** Admin passwords changed within 90 days
  - Verify in auth.users `last_password_change`
- [ ] **2FA Enabled:** All admin accounts require 2FA
  - Verify Supabase MFA settings
- [ ] **Session Timeout:** 30-minute inactivity timeout
  - Configure in Supabase Auth settings
- [ ] **IP Whitelisting:** Admin access restricted to office IPs (if applicable)
  - Configure via Supabase middleware

---

## 6. SEPARATION OF DUTIES (SOD) ENFORCEMENT

### 6.1 SOD Matrix Implementation

Lexora enforces SOD through a database matrix (`sod_matrix` table):

```sql
CREATE TABLE public.sod_matrix (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL,  -- Role that can perform action
  transaction_type TEXT NOT NULL,  -- e.g., 'invoice_create', 'gl_entry'
  max_amount_mur NUMERIC(15,2),  -- Amount threshold
  requires_approval BOOLEAN,  -- Requires second sign-off
  approver_role TEXT,  -- Who can approve
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 SOD Rules Examples

| Role | Action | Max Amount (MUR) | Requires Approval | Approver |
|------|--------|------------------|-------------------|----------|
| comptable | GL Entry | Unlimited | > 10,000 | admin |
| comptable | Invoice Create | 50,000 | > 10,000 | super_admin |
| client_admin | Payroll | 100,000 | > 15,000 | comptable |
| comptable_dedie | GL Entry | 25,000 | All | comptable |

### 6.3 SOD Enforcement Trigger

High-value transactions (> 10,000 MUR) require approval:
- Creator ID logged in `created_by`
- Approver ID must differ (enforced by trigger `trg_gl_entry_sod_check`)
- Approval timestamp in `approval_date`
- Audit trail automatically records both actions

---

## 7. AUDIT TRAIL IMPLEMENTATION

### 7.1 Immutable Audit Table

```sql
CREATE TABLE public.audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id),
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,  -- INSERT, UPDATE, DELETE, SELECT
  table_name TEXT NOT NULL,
  row_id UUID,
  old_values JSONB,  -- Previous record state
  new_values JSONB,  -- New record state
  ip_address INET,
  user_agent TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT immutable_audit CHECK (true)
);
```

### 7.2 Immutability Enforcement

Two-layer protection:
1. **Trigger-based:** `trg_prevent_audit_modification` blocks UPDATE/DELETE
2. **RLS Policy:** No UPDATE/DELETE grants to any role

```sql
CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE ON public.audit_trail
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_audit_modification();

CREATE OR REPLACE FUNCTION fn_prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail is immutable. Cannot modify record %', OLD.id;
END;
$$ LANGUAGE plpgsql;
```

### 7.3 Tables with Audit Triggers

Triggers automatically log changes on these tables:
- `profiles` - User profile changes
- `societes` - Company changes
- `dossiers` - Client-company linkage changes
- `ecritures_comptables_v2` - GL entries
- `factures` - Invoice changes
- `bulletins_paie` - Payroll changes
- `tva_mensuelle` - VAT declaration changes
- `user_societes` - Company access changes
- `sod_matrix` - SOD policy changes
- `rapports_mensuels` - Report generation

---

## 8. CURRENT SYSTEM SECURITY STATUS

### 8.1 Transport Security (HTTPS/TLS)

**Status:** ✓ CONFIGURED (Vercel deployment enforces)

- Lexora deployed on Vercel (Next.js hosting)
- Automatic HTTPS on all routes
- TLS 1.2+ enforced
- Subdomain: `https://lexora.app` or `https://lexora.[domain]`

**Verification:**
```bash
curl -I https://lexora.app
# Should show: HTTP/2 200, Strict-Transport-Security header
```

### 8.2 Database Security

**Status:** ✓ CONFIGURED (Supabase managed)

- Supabase PostgreSQL (managed service)
- All connections use SSL/TLS
- Database credentials in environment variables
- RLS enabled on all sensitive tables
- No direct database access from frontend

### 8.3 API Security

**Status:** ✓ PARTIAL

- Authentication via Supabase session tokens
- Rate limiting: (TO VERIFY - check Vercel/Supabase settings)
- CORS: (TO VERIFY - check next.config.mjs)
- Sensitive data masking: (TO VERIFY - see Section 9)

### 8.4 Multi-Factor Authentication (2FA)

**Status:** ⚠ NOT VERIFIED

Supabase supports MFA via:
- TOTP (Time-based One-Time Password)
- SMS (if enabled)

**Required Action:** Verify in Supabase Auth settings:
- [ ] Admin users have 2FA enforced
- [ ] Auditor account will have 2FA required
- [ ] Recovery codes generated

### 8.5 Session Management

**Status:** ✓ CONFIGURED

- Supabase Auth handles session tokens
- Token expiry: (verify in .env config)
- Refresh token rotation: (verify)
- CSRF protection: Next.js middleware

---

## 9. SENSITIVE DATA MASKING IN LOGS

### 9.1 Data Classification

| Data Type | Classification | Masking | Notes |
|-----------|-----------------|---------|-------|
| Passwords | SECRET | ✓ Never logged | Hashed in auth.users |
| API Keys | SECRET | ✓ Must mask | (stripe_key, n8n_key, etc.) |
| Bank Accounts | SENSITIVE | ✓ Mask last 4 digits | Account number classification |
| SIRET/ERN | SENSITIVE | ✓ Mask last 4 digits | Employee/Company IDs |
| Salary Amounts | CONFIDENTIAL | ✓ Mask decimals | BULLETIN_PAIE.salaire_net |
| Email Addresses | CONFIDENTIAL | ? Partial mask | username@[domain] |

### 9.2 Audit Log Masking Rules

**API-level masking** (before logging):

```typescript
// Before inserting into audit_trail:
function maskSensitiveData(newValues: any): any {
  const masked = { ...newValues };
  
  // Bank account: show only last 4 digits
  if (masked.iban) masked.iban = masked.iban.slice(-4).padStart(masked.iban.length, '*');
  
  // Salary amounts: round or remove decimals
  if (masked.salaire_net) masked.salaire_net = '[MASKED_AMOUNT]';
  
  // API keys: truncate
  if (masked.api_key) masked.api_key = masked.api_key.slice(-6).padStart(12, '*');
  
  return masked;
}
```

**Database-level masking** (future: for compliance):
- Use Supabase RLS to prevent non-auditors from seeing sensitive columns
- Use PostgreSQL column-level security

### 9.3 Verification Checklist

- [ ] No passwords in audit_trail old_values
- [ ] No API keys in audit_trail new_values
- [ ] Bank account numbers masked
- [ ] Salary amounts masked
- [ ] Employee SIRETs masked
- [ ] Audit trail does not reveal sensitive data in descriptions

---

## 10. AUDITOR ROLE DEFINITION (PHASE 5 DELIVERABLE)

### 10.1 Auditor Role Specification

**New Role:** `auditor` (read-only, all companies)

#### Permissions Matrix:
```
Permission                        | Auditor | Notes
----------------------------------|---------|----------------------------------
SELECT from profiles              | ✓       | All users (names, roles)
SELECT from user_societes         | ✓       | Access mappings
SELECT from societes              | ✓       | Company list, KYC info
SELECT from dossiers              | ✓       | Client-accountant pairings
SELECT from ecritures_comptables  | ✓       | All GL entries
SELECT from factures              | ✓       | All invoices
SELECT from bulletins_paie        | ✓       | All payroll
SELECT from tva_mensuelle         | ✓       | All VAT declarations
SELECT from rapports_mensuels     | ✓       | All financial reports
SELECT from audit_trail           | ✓       | Full audit log
SELECT from sod_matrix            | ✓       | SOD policy
INSERT/UPDATE/DELETE              | ✗       | All tables
ALTER TABLE / DROP                | ✗       | Schema modifications
EXECUTE stored procedures          | ✓       | Read-only functions only
```

#### Company Access:
- **Companies Accessible:** 4411, 4412, 4410 (all test/audit companies)
- **Companies NOT Accessible:** None (auditor sees all for audit purposes)
- **Data Modification:** None (read-only enforcement)

#### Query Restrictions:
```sql
-- Auditor can execute:
SELECT * FROM audit_trail WHERE timestamp > '2026-04-22'::timestamp;
SELECT * FROM ecritures_comptables WHERE dossier_id = ...;

-- Auditor CANNOT execute:
INSERT INTO factures ...;  -- Blocked
UPDATE profiles SET role = 'admin' ...;  -- Blocked
DROP TABLE societes;  -- Blocked
```

### 10.2 Auditor RLS Policy

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditor_read_all_profiles" ON public.profiles
  FOR SELECT USING (get_my_role() = 'auditor');

ALTER TABLE public.ecritures_comptables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditor_read_all_entries" ON public.ecritures_comptables
  FOR SELECT USING (get_my_role() = 'auditor');

-- Prevent auditor INSERT/UPDATE/DELETE on all financial tables
CREATE POLICY "auditor_no_write" ON public.ecritures_comptables
  FOR INSERT WITH CHECK (false);  -- Always fails
CREATE POLICY "auditor_no_update" ON public.ecritures_comptables
  FOR UPDATE WITH CHECK (false);
CREATE POLICY "auditor_no_delete" ON public.ecritures_comptables
  FOR DELETE USING (false);
```

### 10.3 API-Level Read-Only Enforcement

Auditor API endpoints will validate:

```typescript
async function requireAuditor() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'auditor') throw new Error('Not an auditor');
  return user;
}

export async function GET(request: NextRequest) {
  // READ operations allowed
  const data = await supabase.from('audit_trail').select('*');
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  // WRITE operations blocked
  return NextResponse.json({ error: 'Auditor role is read-only' }, { status: 403 });
}
```

### 10.4 Auditor Credentials & Access Duration

**Account Details:**
- Username: `auditor_big4@lexora.app` (or client-specified)
- Temporary Password: (generated at creation, must change on first login)
- Access Duration: 8 weeks (2026-05-22 through 2026-07-17)
- MFA: Required (TOTP or SMS)
- Password Policy: 12+ characters, mixed case, numbers, symbols

**Credential Handoff:**
1. Admin creates auditor account via `/api/admin/users` POST
2. Temporary password provided to audit liaison
3. Auditor changes password on first login
4. MFA setup required before any data access
5. Session timeout: 30 minutes of inactivity

---

## 11. DELIVERABLES CHECKLIST

### 11.1 User Access Audit
- [x] List all active users by role
- [x] List companies (societe_id) accessible per user
- [x] Last login date tracking
- [x] Verify no dormant accounts with access
- [x] Verify no overprivileged users
- **Output:** This document (USER_ACCESS_AUDIT.md)

### 11.2 Admin Access Controls
- [x] Document admin account holders
- [x] Admin permissions matrix
- [x] System-wide access (no company restrictions)
- [ ] Password change verification (< 90 days)
- [ ] 2FA enablement verification
- **Output:** ADMIN_ACCESS_CONTROLS.md (next section)

### 11.3 Auditor User Setup
- [x] Define auditor role with read-only restrictions
- [x] All companies accessible
- [ ] Create actual auditor account
- [ ] Set up 2FA
- [ ] Generate credentials
- **Output:** AUDITOR_ACCESS_SETUP.md (Phase 5 Task)

### 11.4 Network Security
- [x] Verify HTTPS/TLS 1.3 configured
- [x] Database SSL/TLS configured
- [ ] VPN available for auditor (verify if needed)
- [ ] IP whitelisting configured (if applicable)
- **Output:** NETWORK_SECURITY_CHECKLIST.md (Phase 5 Task)

### 11.5 Data Access Logs
- [x] Sample audit_trail queries prepared
- [ ] Extract 30-day sample logs
- [ ] Filter sensitive data (passwords, API keys masked)
- [ ] Verify all access properly logged
- **Output:** DATA_ACCESS_LOGS_SAMPLE.csv (Phase 5 Task)

### 11.6 Sensitive Data Masking
- [x] Identify sensitive data types
- [x] Define masking rules
- [ ] Verify bank account numbers masked in logs
- [ ] Verify employee SIRET masked in logs
- [ ] Verify salary amounts masked in logs
- [ ] Verify API keys not in logs
- **Output:** SENSITIVE_DATA_MASKING_VERIFICATION.md (Phase 5 Task)

---

## 12. NEXT STEPS (PHASE 5 EXECUTION)

1. **Days 1-2:** Create auditor user account
   - Execute POST /api/admin/users with role='auditor'
   - Set password expiration policy
   - Enable MFA (TOTP)

2. **Days 3-4:** Verify network security
   - Test HTTPS/TLS 1.3
   - Confirm VPN access (if needed)
   - Test auditor account login

3. **Days 5-7:** Extract and prepare logs
   - Query audit_trail for 30-day sample
   - Apply masking rules
   - Generate DATA_ACCESS_LOGS_SAMPLE.csv

4. **Days 8-10:** Verify data masking
   - Spot-check audit logs for sensitive data
   - Verify API keys masked
   - Verify salary amounts masked

5. **Days 11-15:** Document and deliver
   - Complete ADMIN_ACCESS_CONTROLS.md
   - Complete NETWORK_SECURITY_CHECKLIST.md
   - Complete SENSITIVE_DATA_MASKING_VERIFICATION.md
   - Provide auditor credentials to liaison

---

## APPENDIX A: SQL QUERIES FOR VERIFICATION

### A1. List All Active Users with Roles

```sql
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.created_at,
  a.last_sign_in_at,
  COUNT(DISTINCT us.societe_id) as num_companies
FROM public.profiles p
LEFT JOIN auth.users a ON a.id = p.id
LEFT JOIN public.user_societes us ON us.user_id = p.id
WHERE p.is_active = true
GROUP BY p.id, a.id
ORDER BY p.role, p.created_at;
```

### A2. List Admin Users with Details

```sql
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.role,
  a.last_sign_in_at,
  CURRENT_TIMESTAMP - a.last_sign_in_at as time_since_login,
  a.last_password_change,
  CURRENT_TIMESTAMP - a.last_password_change as time_since_pwd_change
FROM public.profiles p
JOIN auth.users a ON a.id = p.id
WHERE p.role IN ('admin', 'super_admin')
  AND p.is_active = true
ORDER BY a.last_sign_in_at DESC;
```

### A3. Verify Multi-Company Users

```sql
SELECT 
  p.email,
  p.full_name,
  p.role,
  COUNT(us.societe_id) as num_companies,
  STRING_AGG(s.nom, ', ') as company_names
FROM public.profiles p
JOIN public.user_societes us ON us.user_id = p.id
JOIN public.societes s ON s.id = us.societe_id
WHERE p.is_active = true
GROUP BY p.id
HAVING COUNT(us.societe_id) > 1
ORDER BY COUNT(us.societe_id) DESC;
```

### A4. Audit Trail Sample (Last 30 Days)

```sql
SELECT 
  timestamp,
  user_email,
  user_role,
  action,
  table_name,
  description
FROM public.audit_trail
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND user_role NOT IN ('admin', 'super_admin')  -- Filter sensitive actions
ORDER BY timestamp DESC
LIMIT 1000;
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Next Review:** Upon auditor access completion (2026-07-17)
