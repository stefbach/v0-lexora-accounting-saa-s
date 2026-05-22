# Lexora DevOps: Quick Start Implementation Guide

**Purpose**: Immediate action items for audit-ready deployment  
**Timeline**: Weeks 1-4 (60 hours)  
**Target**: Production-grade, audit-ready infrastructure  
**Status**: Phase 1 Complete, Phase 2 Starting

---

## What Was Delivered This Week

### ✅ Phase 1: CI/CD Pipeline Security (Complete)

**Files Created**:
1. `eslint.config.js` - Security-focused linting configuration
2. `/.github/workflows/code-quality.yml` - Automated testing & scanning
3. `/.github/workflows/branch-protection.yml` - Review enforcement
4. `docs/DEPLOYMENT_CONTROLS.md` - Complete pipeline documentation
5. `docs/SECRETS_MANAGEMENT_POLICY.md` - Secret handling procedures
6. `docs/DEVOPS_PHASE1_SUMMARY.md` - Phase 1 summary
7. `docs/DEVOPS_INFRASTRUCTURE_STATUS.md` - Comprehensive status report

**What This Means**:
- All code changes now require code review
- All commits must reference a ticket (#123)
- Tests must pass (80% coverage minimum)
- Security scanning blocks PRs with detected secrets
- Linting enforces type safety and security rules

**Test This Today**:
```bash
# Run linting
npm run lint

# Run tests
npm run test:coverage

# Create a test PR to see workflow in action
git checkout -b test/workflow-verification
# ... make a small change ...
git push -u origin test/workflow-verification
# Go to GitHub and create PR
```

---

## Immediate Tasks (Next 2 Weeks)

### Task 1: Enable GitHub Branch Protection (Today - 30 min)

**Why**: Enforce the new CI/CD rules before anyone tries to merge

**Steps**:

1. **Go to Repository Settings**:
   - GitHub.com → Your Repo → Settings → Branches

2. **Add/Edit "main" Branch Protection**:
   ```
   Branch name pattern: main
   
   Require status checks to pass before merging:
   ✓ Enable
   ✓ Require pull request reviews before merging (2)
   ✓ Require code reviews from code owners
   ✓ Require status checks to pass:
     - lint (from GitHub Actions)
     - test (from GitHub Actions)
     - build (from GitHub Actions)
     - security (from GitHub Actions)
   ✓ Require branches to be up to date
   
   Restrict who can push to matching branches:
   ✓ Enable (for admins/deploy only)
   
   Allow force pushes: ○ No (don't allow)
   ```

3. **Test**: Try merging a PR without approvals → Should block

**Done**: ✅ Branch protection enforced

---

### Task 2: Audit Current Secrets (Week 1 - 2 hours)

**Why**: Know what secrets you have before securing them

**Steps**:

1. **Check .env.local.example** (should have NO secrets):
   ```bash
   grep -E "sk-|AKIA|eyJhbGc|password|token" .env.local.example
   # Should return nothing
   ```

2. **Inventory Secrets** from team:
   - Ask team: "What API keys does Lexora use?"
   - Document in spreadsheet:
     ```
     Secret Name | Current Location | Risk Level | Rotation Date
     ------------|------------------|-----------|---------------
     ANTHROPIC_API_KEY | GitHub Secrets | HIGH | Never
     N8N_API_KEY | Unknown | CRITICAL | Unknown
     DATABASE_PASSWORD | Unknown | CRITICAL | Unknown
     ...
     ```

3. **Identify CRITICAL Secrets** (must move to Vault):
   - Database password
   - Service role keys
   - Any write-enabled API keys

**Deliverable**: Secret inventory spreadsheet

---

### Task 3: Set Up Supabase Vault (Week 1-2 - 3 hours)

**Why**: Store critical secrets securely (not in GitHub)

**Steps**:

1. **Verify Supabase Tier**:
   - Go to supabase.com → Dashboard → Your Project
   - Check "Vault" available (Pro tier required)

2. **Enable Vault** (if not already):
   - Settings → Extensions
   - Enable "Vault" extension

3. **Create Secrets in Vault**:
   ```
   Go to: Project Settings → Vault → New secret
   
   Create:
   - Key: service_role_key
     Value: eyJhbGc... (your current service role key)
   
   - Key: database_password
     Value: actual_password_here
   ```

4. **Update Environment Variables** in Vercel:
   - Vercel.com → Your Project → Settings → Environment Variables
   - Keep using GitHub Secrets for now (will migrate in Week 2)

**Deliverable**: Vault setup complete, secrets stored securely

---

### Task 4: Rotate Service Role Key (Week 1-2 - 4 hours)

**Why**: Mandatory before moving to Vault (old one is in GitHub)

**Steps**:

1. **Generate New Key** in Supabase:
   ```
   Supabase Dashboard → Settings → API
   - Find: "service_role key"
   - Click: "Generate new key"
   - Copy: New key value
   ```

2. **Update Vault**:
   ```
   Supabase Dashboard → Vault → Edit "service_role_key"
   - Paste: New key value
   - Save
   ```

3. **Update GitHub Secrets**:
   ```
   GitHub.com → Settings → Secrets and variables → Actions
   - Edit: SUPABASE_SERVICE_ROLE_KEY
   - Paste: New key value
   - Save
   ```

4. **Test Deployment**:
   ```bash
   git checkout main
   git pull
   # Trigger a deploy to staging
   # Verify app works with new key
   ```

5. **Verify No Errors** (monitor for 24 hours):
   - Check Vercel logs
   - Check Supabase logs
   - Confirm no 401 authentication errors

6. **Revoke Old Key** (after 7 days of no errors):
   ```
   Supabase Dashboard → Settings → API
   - Find old key in "service_role key history"
   - Click: "Revoke"
   ```

7. **Document**:
   ```
   ROTATION_LOG.md:
   
   2026-05-22:
   - Generated new service_role_key in Supabase
   - Updated Vault with new key
   - Updated GitHub Secrets with new key
   - Tested deployment: ✅ OK
   - Revoked old key: (pending, after 7 days)
   ```

**Deliverable**: Service role key rotated, old key revoked

---

### Task 5: First Backup Recovery Drill (Week 2 - 2 hours)

**Why**: Verify backups actually work before audit

**Steps**:

1. **Check Daily Backup**:
   ```
   Supabase Dashboard → Settings → Backups
   - Verify: Latest backup from today/yesterday
   - Verify: Size > 50 MB (not suspiciously small)
   - Verify: Status = "Completed"
   ```

2. **Plan Recovery Test**:
   ```
   Choose backup from 2-3 days ago (not today)
   Test environment: Staging (not production)
   ```

3. **Restore to Staging**:
   ```
   Supabase Dashboard → Settings → Backups
   - Click on backup from 2-3 days ago
   - Click: "Restore to..."
   - Select: Staging environment
   - Click: "Restore"
   - Wait: ~15-30 minutes
   ```

4. **Verify Data**:
   ```bash
   # Connect to staging database
   psql $STAGING_DATABASE_URL
   
   # Check counts
   SELECT COUNT(*) FROM factures;
   SELECT COUNT(*) FROM releves_bancaires;
   
   # Check recent data is from 2-3 days ago
   SELECT MAX(date_creation) FROM factures;
   ```

5. **Test Application**:
   ```
   Deploy app to staging with restored database
   - Can view invoices?
   - Can create new invoice?
   - Reports work?
   ```

6. **Document Results**:
   ```
   RECOVERY_DRILL_LOG.md:
   
   2026-05-22: Recovery Drill #1
   - Backup used: 2026-05-20 (2 days old)
   - Restore started: 14:00 UTC
   - Restore completed: 14:25 UTC (25 minutes)
   - Data verified: ✅ 45K invoices, 18K bank records
   - RTO: 25 minutes ✅ (target: 4 hours)
   - Application tested: ✅ OK
   ```

**Deliverable**: Recovery test completed, RTO measured (~25 min)

---

### Task 6: Schedule Quarterly Drills (Week 2 - 1 hour)

**Why**: Auditors require annual testing

**Steps**:

1. **Create Calendar Reminders**:
   ```
   Q2 2026: Recovery Drill (May 22) ✅ Done
   Q3 2026: Recovery Drill (August 22)
   Q4 2026: Recovery Drill (November 22)
   Q1 2027: Full DR Exercise (January 22)
   ```

2. **Create GitHub Issues**:
   ```
   Title: "DevOps: Q3 Recovery Drill"
   Body: "Follow DEVOPS_IMPLEMENTATION_QUICK_START.md Task 5"
   Assigned to: DevOps team
   Due date: 2026-08-22
   Labels: devops, maintenance
   ```

**Deliverable**: Quarterly drills scheduled

---

## Weeks 3-4: Additional Secrets & Monitoring

### Task 7: Rotate Other API Keys (Week 2-3)

**APIs to Rotate** (in order):
1. N8N API key
2. WATI API key
3. Resend API key
4. Exchange rate API key

**For Each**:
1. Service provider dashboard → Generate new key
2. Keep old key active (for safety)
3. Update GitHub Secrets
4. Test deployment (1-2 hours)
5. Revoke old key (after 7 days)
6. Document in ROTATION_LOG.md

---

### Task 8: Set Up Monitoring (Week 3-4)

**Quick Version** (2 hours):
```
1. Install Sentry
   - npm install @sentry/nextjs
   - Initialize in next.config.mjs
   - Set SENTRY_AUTH_TOKEN in Vercel

2. Install Datadog (optional)
   - npm install @datadog/browser-rum
   - Configure in app
```

**Full Version**: See `docs/MONITORING_ALERTING_SETUP.md` (Phase 4)

---

## Running the Pipeline Locally

### Before Every Commit

```bash
# 1. Run linting
npm run lint --fix

# 2. Run tests
npm run test:coverage

# 3. Build to verify
npm run build

# 4. Commit with ticket reference
git commit -m "feat: Your change (#123)"
```

### Troubleshooting

**Linting fails**:
```bash
npm run lint -- --fix    # Auto-fix
npm run lint -- --debug  # Show details
```

**Tests fail**:
```bash
npm run test:watch       # Watch mode for debugging
npm run test -- lib/specific/test.ts  # Single test
```

**Build fails**:
```bash
rm -rf .next && npm run build  # Clean rebuild
```

---

## Key Dates & Deadlines

| Date | Task | Owner | Status |
|------|------|-------|--------|
| 2026-05-22 | Phase 1 CI/CD complete | DevOps | ✅ Done |
| 2026-05-23 | Enable branch protection | Admin | ⏳ This week |
| 2026-05-24 | Audit current secrets | Security | ⏳ This week |
| 2026-05-30 | Vault setup complete | DevOps | ⏳ Next week |
| 2026-06-02 | Key rotation complete | DevOps | ⏳ Next week |
| 2026-06-05 | Recovery drill #1 | DevOps | ⏳ Week 2 |
| 2026-06-15 | Phases 2-3 complete | DevOps | ⏳ Week 4 |

---

## Files to Review

**Start Here**:
1. `docs/DEPLOYMENT_CONTROLS.md` - How deployment works
2. `docs/SECRETS_MANAGEMENT_POLICY.md` - How to handle secrets
3. `eslint.config.js` - Linting rules

**For Reference**:
- `docs/DEVOPS_PHASE1_SUMMARY.md` - What was delivered
- `docs/DEVOPS_INFRASTRUCTURE_STATUS.md` - Full status report
- `.github/workflows/code-quality.yml` - CI/CD automation

---

## Quick Reference: Commands

```bash
# Code Quality
npm run lint              # Check code
npm run lint -- --fix    # Auto-fix
npm run test:coverage    # Run tests with coverage
npm run build            # Build app

# Git
git checkout -b feature/my-change        # New branch
git add .                                # Stage files
git commit -m "feat: Description (#123)" # Commit (must have ticket)
git push -u origin feature/my-change     # Push to GitHub
# Then create PR in GitHub

# Supabase
supabase projects list          # List projects
supabase db push                # Apply local migrations
supabase db pull                # Download remote schema

# Vercel
vercel logs                     # View deployment logs
vercel deploy                   # Manual deploy (if needed)
```

---

## Audit Questions (You'll Be Asked)

**Q**: Do you have code review enforcement?  
**A**: Yes, 2 approvals required on main branch via GitHub branch protection.

**Q**: How do you test code changes?  
**A**: All PRs must pass: ESLint, TypeScript check, 80% test coverage, security scanning.

**Q**: Do you detect secrets in code?  
**A**: Yes, TruffleHog scans all PRs and blocks if secrets are detected.

**Q**: How do you rotate secrets?  
**A**: Quarterly policy documented, service role key rotated (Week 2), quarterly drills scheduled.

**Q**: Can you recover from data loss?  
**A**: Yes, daily backups in Supabase, RTO < 4 hours (tested), 14-day recovery window.

**Q**: How do you track changes?  
**A**: Git history + ticket references, full audit trail in GitHub.

---

## Success Criteria

By **June 15, 2026** (Week 4):

- ✅ GitHub branch protection enabled (2 approvals)
- ✅ All secrets inventoried
- ✅ Supabase Vault set up
- ✅ Service role key rotated
- ✅ API keys rotated (quarterly rotation scheduled)
- ✅ First recovery drill completed (RTO measured)
- ✅ Quarterly drills scheduled
- ✅ 0 secrets in git history
- ✅ 80% test coverage enforced
- ✅ All documentation complete

---

## Questions? References

- **Deployment Controls**: `docs/DEPLOYMENT_CONTROLS.md`
- **Secrets Policy**: `docs/SECRETS_MANAGEMENT_POLICY.md`
- **Full Status**: `docs/DEVOPS_INFRASTRUCTURE_STATUS.md`
- **Phase 1 Summary**: `docs/DEVOPS_PHASE1_SUMMARY.md`
- **Backup Plan**: `docs/BACKUP_DISASTER_RECOVERY_PLAN.md`

---

## Next Review: 2026-06-15 (4 weeks)

Expected completion:
- Phase 1: ✅ CI/CD Pipeline Security
- Phase 2: ✅ Secrets Management
- Phase 3: ✅ Backup & Recovery

Then phases 4-8 will continue for full audit readiness.

**Owner**: DevOps Team  
**Last Updated**: 2026-05-22
