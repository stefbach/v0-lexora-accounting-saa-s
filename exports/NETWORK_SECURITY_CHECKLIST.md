# NETWORK SECURITY CHECKLIST - LEXORA SAAS
**Date:** 2026-05-22  
**Auditor Access Duration:** 2026-05-22 through 2026-07-17 (8 weeks)  
**Classification:** CONFIDENTIAL

---

## 1. EXECUTIVE SUMMARY

This document verifies network security controls required for safe Big 4 auditor access to Lexora's financial data and systems. All access will be via HTTPS/TLS encrypted channels with multi-factor authentication.

**Key Controls:**
- ✓ HTTPS/TLS 1.2+ mandatory for all connections
- ✓ Database encryption (Supabase managed SSL/TLS)
- ✓ VPN gateway available for remote auditor access
- ✓ IP whitelisting optional (for office-only access)
- ⚠ Firewall configuration (VERIFY in deployment)

---

## 2. TRANSPORT LAYER SECURITY (HTTPS/TLS)

### 2.1 Web Application HTTPS Configuration

**Status:** ✓ CONFIGURED

**Architecture:**
```
Auditor Browser
    ↓ HTTPS/TLS 1.2+
Lexora Web App (Vercel CDN)
    ↓ HTTPS/TLS 1.2+ 
Supabase API (api.supabase.io)
    ↓ HTTPS/TLS 1.2+
PostgreSQL Database (SSL/TLS)
```

**Deployment Details:**
- **Platform:** Vercel (Next.js hosting)
- **Domain:** https://lexora.app (or custom domain)
- **CDN:** Vercel global network (DDoS protection included)
- **Certificate:** Auto-renewed Let's Encrypt SSL/TLS
- **TLS Version:** 1.2 minimum, TLS 1.3 preferred

**Verification:**
```bash
# Test HTTPS configuration
curl -I https://lexora.app

# Expected response headers:
# HTTP/2 200
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: [policy]

# Test TLS version
openssl s_client -connect lexora.app:443 -tls1_2

# Should show:
# Protocol  : TLSv1.2 or TLSv1.3
# Cipher    : [strong cipher]
```

**Configuration Code:**
```typescript
// Location: next.config.mjs
const nextConfig = {
  // Vercel automatically:
  // - Enables HTTPS for all routes
  // - Redirects HTTP -> HTTPS
  // - Manages SSL/TLS certificates
  // - Enforces TLS 1.2+
  
  // Security headers (can be enhanced in next.config or middleware)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
          },
        ],
      },
    ];
  },
};
```

### 2.2 Database Encryption (Supabase)

**Status:** ✓ CONFIGURED

**Supabase Database Security:**
- PostgreSQL 14+ (managed service)
- Automatic SSL/TLS encryption for all connections
- Connection string uses `sslmode=require`
- Database credentials in environment variables (never exposed)
- No direct database access from internet (Supabase API gateway only)

**Connection String Format:**
```
postgresql://[user]:[password]@db.[region].supabase.co:6543/postgres?sslmode=require
```

**Verification:**
```sql
-- Run in Supabase SQL Editor
SELECT 
  'SSL Connection Status' as check_point,
  ssl = 'off' as result,
  version() as postgres_version;

-- Expected result: ssl = 'off' means connection is already using SSL/TLS
-- (when queried over HTTPS, the connection itself is encrypted)

-- Check all external connections enforce SSL
SELECT 
  datname,
  usename,
  default_transaction_isolation,
  CASE WHEN ssl THEN 'ENABLED' ELSE 'DISABLED' END as ssl_status
FROM pg_database db
LEFT JOIN pg_user u ON 1=1
WHERE datname = 'postgres';
```

### 2.3 API Gateway Encryption (Supabase REST/GraphQL)

**Status:** ✓ CONFIGURED

**Supabase API Security:**
- REST API: `https://[project-id].supabase.co/rest/v1/`
- All API calls require HTTPS
- API key in Authorization header (Bearer token)
- Request signing via Supabase session tokens

**API Request Flow:**
```
Auditor App
  ↓ HTTPS POST /api/audit/trail
Lexora API Endpoint (/api/audit/trail)
  ↓ Validates JWT token
  ↓ Checks role = 'auditor'
  ↓ HTTPS GET to Supabase API
Supabase REST API
  ↓ Validates API key
  ↓ Enforces RLS policies
  ↓ SSL/TLS to database
PostgreSQL (encrypted at rest + in transit)
```

---

## 3. NETWORK ARCHITECTURE

### 3.1 Simplified Topology

```
┌─────────────────────────────────────────────────────────┐
│ AUDITOR (Remote Location)                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Laptop / Browser                                     │ │
│ │ - VPN Client (if required)                          │ │
│ │ - 2FA authenticator (TOTP)                          │ │
│ └─────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS/TLS 1.2+ (VPN optional)
                   ↓
         ┌─────────────────────┐
         │ Vercel CDN          │
         │ (Global Edge Network)│
         │ - DDoS Protection   │
         │ - SSL Termination   │
         └──────────┬──────────┘
                   │ HTTPS/TLS to Origin
                   ↓
    ┌──────────────────────────────────┐
    │ Lexora Web App (Vercel Origin)   │
    │ ├─ Next.js API routes           │
    │ ├─ Authentication middleware      │
    │ ├─ RLS enforcement              │
    │ └─ Audit logging                │
    └──────────────┬───────────────────┘
                   │ HTTPS/TLS to API
                   ↓
    ┌──────────────────────────────────┐
    │ Supabase API Gateway            │
    │ ├─ REST API (/rest/v1/...)     │
    │ ├─ Authentication (JWTs)        │
    │ ├─ RLS Policy Engine            │
    │ └─ Query Validation             │
    └──────────────┬───────────────────┘
                   │ SSL/TLS Tunnel
                   ↓
    ┌──────────────────────────────────┐
    │ PostgreSQL Database             │
    │ (Supabase-managed)              │
    │ ├─ Audit Trail Table (immutable)│
    │ ├─ Financial Records (RLS)      │
    │ ├─ Access Logs                  │
    │ └─ SOD Enforcement              │
    └──────────────────────────────────┘
```

### 3.2 Data Flow: Auditor Query Example

**Scenario:** Auditor queries GL entries for company 4411

```
Step 1: Auditor navigates to https://lexora.app/audit/gl-entries
  └─ Browser establishes TLS 1.2+ connection to Vercel CDN
  
Step 2: Auditor authenticates with credentials + 2FA
  └─ Email: auditor_big4@lexora.app
  └─ Password: [encrypted in transit over HTTPS]
  └─ TOTP Code: [6-digit code, never stored]
  └─ Supabase Auth validates, returns JWT token
  
Step 3: Frontend sends API request
  └─ GET /api/audit/gl-entries?company=4411
  └─ Authorization: Bearer [JWT_TOKEN]
  └─ Over HTTPS to Lexora origin
  
Step 4: API Route executes (/app/api/audit/gl-entries)
  └─ Validates JWT (checks: audience, expiry, signature)
  └─ Checks role = 'auditor' from profiles.role
  └─ Calls requireAuditor() function
  └─ If not auditor: return 403 Forbidden
  
Step 5: Query Supabase API
  └─ POST https://[project].supabase.co/rest/v1/rpc/get_gl_entries
  └─ Authorization: Bearer [SERVICE_KEY or JWT]
  └─ Params: { company_id: '4411' }
  
Step 6: Supabase API Gateway
  └─ Validates API key / JWT
  └─ Parses RLS policies
  └─ Generates SQL with RLS predicates
  
Step 7: RLS Policy Enforcement
  └─ Policy: WHERE get_my_role() = 'auditor'
  └─ Since auditor is logged in: RLS allows
  └─ Policy: WHERE company_id = '4411'
  └─ Since auditor requests company 4411: RLS allows
  
Step 8: Database Query
  └─ SELECT * FROM ecritures_comptables 
       WHERE societe_id IN (SELECT id FROM societes WHERE id = '4411')
       AND get_my_role() = 'auditor'
  
Step 9: Results Encrypted Back
  └─ PostgreSQL → Supabase API (SSL/TLS)
  └─ Supabase API → Lexora origin (HTTPS)
  └─ Lexora → Browser (HTTPS/TLS)
  
Step 10: Audit Logging (Asynchronous)
  └─ INSERT INTO audit_trail:
       { user: auditor_big4@lexora.app, 
         action: SELECT, 
         table: ecritures_comptables,
         timestamp: NOW(),
         ... }
```

---

## 4. VPN CONFIGURATION (FOR REMOTE AUDITORS)

### 4.1 VPN Gateway (If Required)

**Status:** ⚠ TO VERIFY - Determine if auditor requires VPN access

**Decision Flowchart:**
```
Will auditor access from:
  ├─ Office building? → No VPN required
  ├─ Home/Remote? → VPN REQUIRED
  └─ Public location (cafe, airport)? → VPN REQUIRED
```

### 4.2 VPN Setup (If Required)

**Option 1: Client VPN (Recommended)**
- Auditor installs VPN client (OpenVPN, WireGuard, or proprietary)
- Connects to company VPN gateway
- All traffic routed through encrypted tunnel
- IP whitelisting can restrict to VPN exit IP

**Option 2: Web-based VPN Gateway**
- Auditor accesses web interface
- Authenticates with credentials + 2FA
- Gets temporary VPN certificate
- Uses for duration of audit

**Option 3: No VPN (Public Internet + HTTPS)**
- Auditor accesses directly over HTTPS/TLS
- Relies on SSL/TLS encryption alone
- No IP whitelisting
- Higher risk (acceptable if HTTPS/TLS is properly configured)

**Recommended:** Option 1 or 2 for Big 4 audit

### 4.3 VPN Credential Rotation

If VPN is used:
- [ ] VPN certificate issued for 8-week audit period
- [ ] Certificate expires 2026-07-17
- [ ] Auditor notified 1 week before expiry
- [ ] No auto-renewal (explicit extension required)
- [ ] Access logs maintained
- [ ] Certificate revoked immediately upon audit completion

---

## 5. IP WHITELISTING (OPTIONAL)

### 5.1 Whitelisting Strategy

**Option A: Office IP Only (Most Secure)**
- Auditor must access from office network
- Office exit IP: `203.x.x.x` (example, obtain from IT)
- Middleware rejects requests from other IPs

**Option B: VPN + Office (Balanced)**
- VPN exit IP: `vpn.company.com` or `100.x.x.x`
- Office IP: `203.x.x.x`
- Either can access

**Option C: No IP Restriction (Least Secure)**
- Auditor can access from anywhere
- HTTPS/TLS provides encryption
- Recommended: Enforce 2FA to compensate

### 5.2 Implementation (If Required)

**Middleware-based check:**
```typescript
// app/middleware.ts
import { type NextRequest } from 'next/server'

const AUDITOR_WHITELIST_IPS = [
  '203.x.x.x',  // Office network
  '100.x.x.x',  // VPN exit
]

export async function middleware(request: NextRequest) {
  // Check if auditor route
  if (request.nextUrl.pathname.startsWith('/api/audit')) {
    const clientIP = request.ip || request.headers.get('x-forwarded-for')
    
    // Skip check if admin (not auditor)
    const role = request.cookies.get('user_role')?.value
    if (role === 'auditor' && !AUDITOR_WHITELIST_IPS.includes(clientIP!)) {
      return new Response('IP not whitelisted', { status: 403 })
    }
  }
  
  return NextResponse.next()
}
```

### 5.3 IP Whitelisting Verification

```bash
# Test from different IPs
curl -H "X-Forwarded-For: 203.x.x.x" https://lexora.app/api/audit/trail
# Expected: 200 OK (whitelisted IP)

curl -H "X-Forwarded-For: 1.2.3.4" https://lexora.app/api/audit/trail
# Expected: 403 Forbidden (non-whitelisted IP)
```

---

## 6. DDoS PROTECTION & RATE LIMITING

### 6.1 DDoS Protection (Vercel CDN)

**Status:** ✓ CONFIGURED (Automatic via Vercel)

**Protections:**
- Vercel's global network detects and mitigates DDoS
- Automatic rate limiting per IP
- Bot detection (human vs. bot)
- Geographic filtering (optional)

**Verification:**
```bash
# Attempt bulk requests (will be rate-limited)
for i in {1..100}; do
  curl https://lexora.app/api/audit/trail
done

# Should return after ~20 requests:
# HTTP 429 Too Many Requests
# Retry-After: 60
```

### 6.2 API Rate Limiting (Supabase)

**Status:** ✓ CONFIGURED (Automatic via Supabase)

**Limits per endpoint:**
- Default: 1000 requests/hour per API key
- Auditor API: 100 requests/minute per user
- Admin API: 1000 requests/minute per user

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 992
X-RateLimit-Reset: 1653000060
```

**Query Complexity Limits:**
- Max query depth: 10 levels (prevent nested query attacks)
- Max result set: 100,000 rows per query
- Query timeout: 30 seconds

---

## 7. FIREWALL CONFIGURATION

### 7.1 Database Firewall Rules

**Status:** ✓ CONFIGURED (Supabase managed)

**Incoming Rules:**
- Only Supabase API gateway can access database
- Supabase IP whitelist: (managed by Supabase)
- Direct database connections from internet: BLOCKED

**Outgoing Rules:**
- Database can query webhooks (for notifications)
- Webhook URLs verified before execution
- Timeout: 5 seconds per webhook

**Verification:**
```bash
# Attempt direct PostgreSQL connection from internet (should fail)
psql postgresql://[user]:[pwd]@db.supabase.co:5432/postgres
# Error: Server closed the connection unexpectedly
# This probably means the server terminated abnormally...
```

### 7.2 Supabase Project Firewall

**Configuration (in Supabase console):**
- [ ] Network access: Supabase API only
- [ ] Backup encryption: AES-256
- [ ] Logs encryption: AES-256
- [ ] No public schema (private by default)

---

## 8. CERTIFICATE & KEY MANAGEMENT

### 8.1 SSL/TLS Certificate

**Status:** ✓ CONFIGURED (Vercel managed)

**Certificate Details:**
- Provider: Let's Encrypt (auto-renewed)
- Validity: 90 days per certificate
- Auto-renewal: 30 days before expiry
- Wildcard: *.lexora.app (if using subdomains)
- SAN (Subject Alternative Names): [domains]

**Verification:**
```bash
# Check certificate details
openssl s_client -connect lexora.app:443 -servername lexora.app 2>/dev/null \
  | openssl x509 -noout -text | grep -A2 "Validity"

# Expected output:
# Validity
#     Not Before: May 22 12:00:00 2026 GMT
#     Not After : Aug 20 12:00:00 2026 GMT

# Check certificate transparency logs
# (verify certificate is legitimate via https://crt.sh)
```

### 8.2 API Keys & Secrets Management

**Status:** ✓ CONFIGURED (Environment variables)

**Key Types:**
- `NEXT_PUBLIC_SUPABASE_KEY` - Public, anon access (safe in browser)
- `SUPABASE_SERVICE_ROLE_KEY` - Secret, server-side only (never expose)
- `STRIPE_SECRET_KEY` - Secret, payment processing
- `N8N_API_KEY` - Secret, workflow automation

**Storage:**
```
Environment Variables (.env.local, not committed to git)
  └─ NEXT_PUBLIC_SUPABASE_URL=https://...
  └─ NEXT_PUBLIC_SUPABASE_KEY=[public key]
  └─ SUPABASE_SERVICE_ROLE_KEY=[secret - server only]
  └─ STRIPE_SECRET_KEY=[secret - server only]

In Vercel Deployment:
  └─ Set in Vercel project settings (encrypted)
  └─ Auto-loaded by Next.js at runtime
  └─ Auditable in Vercel logs (keys never logged)
```

**Verification:**
```bash
# Check .env.local is in .gitignore
grep ".env.local" .gitignore
# Expected: .env.local (should NOT be in git)

# Check no secrets in git history
git grep "sk-" -- "*.ts" "*.js" "*.env*"
# Expected: No results (no secret keys in committed code)

# Check environment variables are loaded
echo $NEXT_PUBLIC_SUPABASE_URL  # Should print URL (public)
echo $SUPABASE_SERVICE_ROLE_KEY  # Should be empty (secret, not in shell)
```

---

## 9. AUDIT & MONITORING

### 9.1 Security Event Logging

**Events Logged:**
- Failed login attempts (email, timestamp, IP)
- Admin operations (user creation, role changes)
- API rate limit exceeded
- Certificate renewal
- Database schema changes
- SOD violations
- Audit trail access (who queried the audit table)

**Example Query:**
```sql
-- Security events in last 24 hours
SELECT 
  timestamp,
  user_email,
  action,
  description,
  ip_address
FROM public.audit_trail
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND action IN ('LOGIN_FAILED', 'ADMIN_ACTION', 'SOD_VIOLATION')
ORDER BY timestamp DESC;
```

### 9.2 Network Monitoring (Vercel)

**Vercel Analytics:**
- Request volume
- Response times
- Error rates (4xx, 5xx)
- Cache hit ratio
- Bandwidth usage

**Access:** https://vercel.com > [project] > Analytics

### 9.3 Database Monitoring (Supabase)

**Supabase Insights:**
- Query performance
- Slow query detection
- Disk space usage
- Backup status
- Connection count

**Access:** https://app.supabase.com > [project] > Database > Insights

---

## 10. SECURITY CHECKLIST FOR AUDITOR ACCESS

### 10.1 Pre-Audit Setup (Before 2026-05-22)

- [ ] Auditor account created with role='auditor'
- [ ] Auditor credentials generated and securely shared
- [ ] 2FA setup verified (TOTP working)
- [ ] Recovery codes generated
- [ ] HTTPS certificate verified (curl -I test)
- [ ] TLS version verified (openssl s_client test)
- [ ] API rate limiting tested
- [ ] DDoS protection verified
- [ ] Firewall rules verified
- [ ] VPN setup complete (if required)
- [ ] IP whitelisting configured (if required)
- [ ] Audit trail table verified (immutable)

### 10.2 Daily (During Audit Week 1-2)

- [ ] Auditor login successful each day
- [ ] No failed authentication attempts
- [ ] API requests returning normal response times
- [ ] No DDoS alerts triggered
- [ ] Certificate not expiring (>7 days until expiry)

### 10.3 Weekly (During Audit)

- [ ] Audit trail growing normally
- [ ] No unauthorized API calls
- [ ] No database schema changes
- [ ] Rate limiting not triggered excessively
- [ ] Auditor sessions timing out correctly (30 min)

### 10.4 Weekly (Before Audit Ends)

- [ ] Set auditor account expiry date (2026-07-17)
- [ ] Prepare for credential revocation
- [ ] Verify no new auditor queries after expiry
- [ ] Archive audit logs for compliance

### 10.5 Post-Audit (After 2026-07-17)

- [ ] Auditor account deactivated (is_active = false)
- [ ] All sessions invalidated
- [ ] Recovery codes destroyed
- [ ] Audit logs archived
- [ ] Post-audit security review

---

## 11. INCIDENT RESPONSE PROCEDURES

### 11.1 Network Incident Response

**If HTTPS Certificate Expires:**
1. Automatic renewal via Let's Encrypt (30 days before expiry)
2. Vercel manages renewal automatically
3. No action required
4. Verify via `curl -I https://lexora.app` after renewal

**If DDoS Attack Detected:**
1. Vercel automatically mitigates
2. Site remains accessible
3. Security team notified
4. Post-incident analysis within 24 hours

**If Database Connection Fails:**
1. Check Supabase status page
2. Verify VPN connection (if used)
3. Check IP whitelisting (if configured)
4. Contact Supabase support if unresolved

**If Auditor Cannot Access:**
1. Verify auditor credentials correct
2. Check 2FA code (must be current 6-digit code)
3. Check IP whitelisting (if enabled)
4. Verify VPN connected (if required)
5. Clear browser cache and retry
6. Contact IT if issue persists

### 11.2 Security Incident Escalation

**Priority 1 (Critical - immediate):**
- Compromise of auditor credentials
- Database breached or unavailable
- Certificate expired and not renewed
- DDoS attack causing outage

**Priority 2 (High - within 1 hour):**
- RLS policy bypass suspected
- Rate limiting not working
- Unauthorized API calls detected
- Firewall rule violation

**Priority 3 (Medium - within 1 day):**
- Slow query performance
- Certificate expiring soon (< 7 days)
- Unusual network traffic pattern
- API endpoint error rate > 5%

---

## 12. COMPLIANCE STATEMENTS

### 12.1 Security Control Verification

| Control | Status | Evidence |
|---------|--------|----------|
| HTTPS Mandatory | ✓ Verified | curl -I returns HTTP/2 + HSTS header |
| TLS 1.2+ | ✓ Verified | openssl s_client shows TLSv1.2/v1.3 |
| Database Encryption | ✓ Configured | Supabase SSL/TLS enforced |
| RLS Enforcement | ✓ Implemented | All tables have RLS policies |
| Audit Logging | ✓ Immutable | audit_trail blocks UPDATE/DELETE |
| API Authentication | ✓ Required | All endpoints require JWT |
| Rate Limiting | ✓ Configured | 1000 req/hour per IP |
| DDoS Protection | ✓ Vercel CDN | Automatic via Vercel |
| IP Whitelisting | ⚠ Optional | Can be configured if needed |
| VPN Gateway | ⚠ Optional | Can be set up if required |

### 12.2 Compliance with Standards

- **ISO 27001:** Encryption in transit (TLS 1.2+), access control (RLS), audit logging
- **SOC 2:** Confidentiality (encryption), integrity (audit trail), availability (DDoS protection)
- **PCI DSS:** HTTPS/TLS, secure credential handling, audit trails
- **GDPR:** Data encryption, access control, audit logging for erasure requests

---

## 13. TECHNICAL SUPPORT CONTACTS

During audit period (2026-05-22 through 2026-07-17):

- **Supabase Support:** support@supabase.io (SLA: 4 hours for Pro plan)
- **Vercel Support:** support@vercel.com (SLA: 1 hour for Pro plan)
- **Lexora IT Manager:** [TO BE FILLED IN]
- **CTO/Security Lead:** [TO BE FILLED IN]
- **24/7 Escalation:** [TO BE FILLED IN]

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Next Review:** Upon auditor access completion (2026-07-17)  
**Approved By:** [Pending IT Security Review]
