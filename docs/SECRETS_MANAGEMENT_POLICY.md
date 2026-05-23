# Lexora Secrets Management Policy

**Status**: Phase 1-2 - In Progress  
**Last Updated**: 2026-05-22  
**Owner**: Security Team  
**Compliance**: Audit-Ready, SOC 2 Type II  

## 1. Executive Summary

All secrets (API keys, database passwords, tokens) in Lexora must be:
- ✅ **Never stored in code** (git, .env files, docs)
- ✅ **Stored in secure vaults** (GitHub Secrets, Supabase Vault)
- ✅ **Rotated quarterly** (minimum)
- ✅ **Masked from logs** (no plaintext output)
- ✅ **Audit-logged** (track who accessed what, when)

## 2. Secret Classification

### 2.1 Secrets Inventory

| Secret Type | Current Location | ⚠️ Risk | Action Required |
|------------|-----------------|--------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub Secrets ✅ | None | OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GitHub Secrets ✅ | Low (public key) | OK |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets ⚠️ | **CRITICAL** | Move to Vault |
| `VERCEL_DEPLOY_HOOK_URL` | GitHub Secrets ✅ | Medium | OK (rotate yearly) |
| Database password | ❌ Not yet audited | **CRITICAL** | Use Vault |
| N8N API keys | ❌ Not yet audited | **CRITICAL** | Use Vault |
| WATI API keys | ❌ Not yet audited | **CRITICAL** | Use Vault |
| Resend API key | ❌ Not yet audited | **CRITICAL** | Use Vault |
| Anthropic API key | ❌ Not yet audited | **CRITICAL** | Use Vault |

### 2.2 Secret Sensitivity Levels

**CRITICAL** (must use Vault + rotation):
- Database passwords
- Service role keys (Supabase, Firebase, etc.)
- API keys with write/delete permissions
- SSH keys, private keys
- Master encryption keys

**HIGH** (must use secure storage):
- Third-party API keys (N8N, WATI, Resend, etc.)
- OAuth tokens
- Deploy/automation tokens

**MEDIUM** (GitHub Secrets acceptable):
- Public API keys (anon keys)
- Webhook URLs (not sensitive themselves)
- Public URLs

## 3. Storage Solutions

### 3.1 GitHub Secrets (Current)

**Usage**: 
- ✅ For CI/CD variables in GitHub Actions
- ✅ For non-critical secrets (anon keys, public URLs)

**How to Set**:
1. Go to repository `Settings → Secrets and variables → Actions`
2. Click `New repository secret`
3. Enter name (uppercase, underscores): `SUPABASE_URL`
4. Paste value (hidden in UI)
5. Click `Add secret`

**How to Use in Workflows**:
```yaml
jobs:
  deploy:
    steps:
      - name: Deploy
        env:
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: ./deploy.sh
```

**Rotation Policy**: Quarterly for critical secrets

### 3.2 Supabase Vault (Recommended)

**Purpose**: Store secrets server-side, never exposed to client  
**Tier**: Available on Supabase Pro & above

**Setup** (Supabase Dashboard):
1. Go to `Project Settings → Vault`
2. Click `New secret`
3. Key: `service_role_key` (or other name)
4. Value: `eyJhbGc...` (paste actual key)
5. Encryption enabled automatically

**Access from Edge Functions**:
```typescript
// In Supabase Edge Function
import { createClient } from '@supabase/supabase-js'

const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!

// Never log this
console.log('Connected to Supabase')
```

**Access from Node.js Backend**:
```typescript
// In /app/api/internal/route.ts
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
// This is injected by Vercel environment variables
```

### 3.3 Environment Configuration

#### .env.local (NEVER COMMIT)

Local development only, should be `.gitignored`:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (secret, never share)
ANTHROPIC_API_KEY=sk-ant-...
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/deploy/...
```

#### .env.local.example (Safe Template)

Shows structure WITHOUT actual values:

```bash
# Current: ✅ SAFE - no secrets
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=sk-ant-...
WATI_API_KEY=
N8N_BASE_URL=https://n8n.example.com
N8N_API_KEY=
```

**Verification**: Run audit to ensure no secrets in `.env.local.example`

```bash
npm run audit:env-example
```

#### .gitignore (Already Configured)

```gitignore
.env*.local        # Local .env files (secrets)
.claude/          # Claude Code internal files
node_modules/     # Dependencies
.next/            # Next.js build output
```

## 4. Secrets Rotation Policy

### 4.1 Rotation Schedule

| Secret Type | Rotation Frequency | Next Rotation | Owner |
|------------|-------------------|---------------|-------|
| Database password | Every 6 months | 2026-11-22 | DevOps |
| Service role keys | Every 3 months | 2026-08-22 | Security |
| Third-party API keys | Every 6 months | 2026-11-22 | Team |
| Supabase anon key | Quarterly | 2026-08-22 | Security |
| Deploy hooks | Yearly | 2027-05-22 | DevOps |

### 4.2 Rotation Procedure

**Step 1: Generate New Secret**
```bash
# For API keys, use service provider dashboard
# For tokens, request new one with old one still active
# For passwords, generate secure one: openssl rand -base64 32
```

**Step 2: Update in Vault**
```bash
# 1. Update GitHub Secrets (Settings → Secrets)
# OR update Supabase Vault (Project → Vault)
# 2. Test in staging environment first
```

**Step 3: Deploy & Monitor**
```bash
# 1. Deploy to staging (test with new secret)
# 2. Monitor logs for failures (old secret no longer works)
# 3. Deploy to production (all systems use new secret)
```

**Step 4: Retire Old Secret**
```bash
# 1. After 7 days with no failures
# 2. Revoke old secret in service provider
# 3. Document rotation in audit log
```

**Step 5: Document**
- Add rotation record to SECRETS_ROTATION_LOG.md
- Update SECRET_INVENTORY.md
- Create ticket for next rotation (quarterly reminder)

### 4.3 Emergency Rotation

If a secret is compromised:

1. **Immediate** (< 5 minutes):
   - Revoke old secret in service provider
   - Generate new secret
   - Update in Vault/Secrets

2. **Short-term** (< 1 hour):
   - Deploy updated secret to all environments
   - Verify all systems use new secret
   - Monitor logs for errors

3. **Follow-up** (< 24 hours):
   - Document incident
   - Notify relevant stakeholders
   - Audit access logs
   - Post-mortem (if needed)

## 5. Secret Handling Best Practices

### 5.1 In Code

❌ **NEVER DO THIS**:
```typescript
// BAD: Hardcoded secret
const API_KEY = "sk-ant-abc123...";
const dbPassword = "MySecretPassword123";
const serviceRoleKey = "eyJhbGc...";
```

✅ **DO THIS INSTEAD**:
```typescript
// GOOD: Use environment variables
const apiKey = process.env.ANTHROPIC_API_KEY!
const dbPassword = process.env.DATABASE_PASSWORD!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
```

### 5.2 In Logs

❌ **NEVER LOG SECRETS**:
```typescript
// BAD: Logs API key
console.log('Using API key:', apiKey)
console.error('Failed to connect with password:', dbPassword)
```

✅ **LOG SAFELY**:
```typescript
// GOOD: Log action, not secret
console.log('Connecting to API')
console.error('Failed to connect to database')

// GOOD: Mask sensitive data
const maskedKey = apiKey.substring(0, 7) + '***'
console.log('Using API key:', maskedKey)
```

### 5.3 In URLs

❌ **NEVER INCLUDE SECRETS IN URLS**:
```typescript
// BAD: Key in URL
fetch(`https://api.example.com?key=${apiKey}`)

// BAD: Password in connection string
const dbUrl = `postgresql://user:password@localhost/db`
```

✅ **USE HEADERS OR ENV VARS**:
```typescript
// GOOD: Use Authorization header
fetch('https://api.example.com', {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
})

// GOOD: Connection from environment
const dbUrl = process.env.DATABASE_URL!
```

### 5.4 In Documentation

❌ **NEVER INCLUDE ACTUAL SECRETS IN DOCS**:
```markdown
[NEVER] To set up, use this API key: sk-ant-abc123xyz
```

✅ **USE PLACEHOLDERS**:
```markdown
[GOOD] To set up:
1. Go to [Service Provider](https://example.com)
2. Generate an API key
3. Add to `.env.local`: ANTHROPIC_API_KEY=sk-ant-...
```

## 6. Secret Detection & Prevention

### 6.1 Pre-commit Checks

GitHub automatically scans for secrets:

**What TruffleHog Detects**:
- AWS access keys (`AKIA...`)
- API tokens (GitHub, Slack, etc.)
- Database URLs with passwords
- Private keys (RSA, EC, etc.)
- Stripe/Twilio/AWS keys

**If Secret is Detected**:
1. GitHub will create an alert
2. PR cannot merge
3. Remove secret immediately:
   ```bash
   # Rewrite history (git-filter-repo)
   pip install git-filter-repo
   git filter-repo --invert-paths --path secrets.txt
   ```

### 6.2 Local Scanning

Install local secret scanner:

```bash
# Install truffleHog locally
pip install truffleHog

# Scan your commits
truffleHog filesystem . --json

# Scan git history
git log -p | trufflehog stdin --json
```

### 6.3 Audit Secrets in Repository

```bash
# Run full audit (weekly recommended)
npm run audit:secrets

# Check .env.local.example for secrets
grep -E "sk-|AKIA|eyJhbGc" .env.local.example
```

## 7. Access Control & Audit Trail

### 7.1 Who Has Access to Secrets?

| Role | GitHub Secrets | Supabase Vault | Database | Rotation |
|------|----------------|----------------|----------|----------|
| Developer | Read (CI/CD only) | No | Development only | No |
| DevOps | Read/Write | Read/Write | Admin | Yes |
| Security | Audit only | Audit | Audit | Yes |
| Admin | Read/Write | Read/Write | Admin | Yes |

### 7.2 Audit Logging

**GitHub Secrets Access**:
- View history: `Settings → Secrets → View History`
- Records: Who changed, when, old/new value hash
- Retention: 90 days minimum

**Supabase Vault Access**:
- View history: `Project → Vault → View History`
- Records: User, timestamp, action (read/write)
- Retention: 1 year minimum

**Database Password Changes**:
- Logged in PostgreSQL audit table: `audit.logged_actions`
- Timestamp, old value hash, new value hash
- Retention: 1 year (MRA requirement)

## 8. Integration with CI/CD

### 8.1 GitHub Actions Secrets

Secrets are automatically available in GitHub Actions:

```yaml
name: Deploy

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        run: |
          curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

**Note**: Secrets are masked in logs automatically: `***`

### 8.2 Vercel Environment Variables

Secrets are also stored in Vercel project settings:

1. Go to `Project Settings → Environment Variables`
2. Add variables for production, preview, development
3. Vercel injects them at build/runtime

**Sensitive Variables**:
```
SUPABASE_SERVICE_ROLE_KEY    (used by server-side code only)
ANTHROPIC_API_KEY             (server-side only)
DATABASE_PASSWORD             (server-side only)
```

## 9. Compliance & Audit Requirements

### 9.1 MRA (Mauritius Revenue Authority)

**Requirement**: All secrets related to financial data must be:
- Encrypted at rest (Vault)
- Never logged
- Rotated at least annually
- Audit-trail for all access

### 9.2 SOC 2 Type II

**Requirement**: 
- Principle 1: Secure secrets storage
- Principle 2: Access controls (role-based)
- Principle 3: Audit trail (who, what, when)

### 9.3 Big 4 Audit

**Questions**:
- ✅ Are secrets stored securely? → Vault + GitHub Secrets
- ✅ Are they rotated? → Quarterly policy documented
- ✅ Who has access? → Role-based access control
- ✅ Is there an audit trail? → GitHub/Supabase logging
- ✅ Are they in code? → TruffleHog prevents commits

## 10. Incident Response

### 10.1 If a Secret is Exposed

**Immediate Actions** (< 1 hour):
1. ❌ Don't panic, this can be fixed
2. ✅ Revoke the secret in service provider
3. ✅ Generate new secret
4. ✅ Update in Vault/Secrets
5. ✅ Deploy to all environments
6. ✅ Notify team leads

**Investigation** (< 24 hours):
1. Check git history: Who committed it? When?
2. Check access logs: Was it accessed? How many times?
3. Check service logs: Was it used after exposure?
4. Determine impact: What could be accessed with this secret?

**Prevention** (< 1 week):
1. Document what happened
2. Update documentation/training
3. Rotate related secrets as precaution
4. Add to incident prevention log

**Example Incident**:
```
2026-05-15 15:30: Developer accidentally committed SUPABASE_SERVICE_ROLE_KEY
2026-05-15 15:35: GitHub detected and alerted
2026-05-15 15:40: Key revoked in Supabase dashboard
2026-05-15 15:50: New key generated and deployed
2026-05-16: Audit - key was not accessed by anyone post-exposure
2026-05-17: Post-mortem - update .gitignore guidance
```

## 11. Checklist for New Team Members

- [ ] Received `.env.local.example` template (no secrets)
- [ ] Can run app locally with own secrets
- [ ] Cannot see other team members' secrets
- [ ] Understand rotation policy
- [ ] Know how to report exposed secrets
- [ ] Read this entire policy

## 12. Success Criteria (Audit Ready)

- ✅ 0 secrets in git history
- ✅ 0 secrets in `.env.local.example` or docs
- ✅ All critical secrets in Vault (not GitHub Secrets)
- ✅ TruffleHog scanning enabled on all PRs
- ✅ Quarterly rotation policy enforced
- ✅ Audit trail for all secret access
- ✅ RTO for emergency rotation: < 1 hour

## 13. References

- [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault)
- [GitHub Secrets Best Practices](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [OWASP Secrets Management](https://owasp.org/www-community/Sensitive_Data_Exposure)
- [Deployment Controls](DEPLOYMENT_CONTROLS.md)

---

**Next Steps**:
1. Set up Supabase Vault for service role key (Week 1)
2. Rotate all critical secrets (Week 2)
3. Set up quarterly rotation reminders (Ongoing)
