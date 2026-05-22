# Lexora Deployment Controls & CI/CD Security

**Status**: Phase 1 - In Progress  
**Last Updated**: 2026-05-22  
**Owner**: DevOps Team  
**Audit Ready**: Yes

## 1. CI/CD Pipeline Overview

The Lexora deployment pipeline enforces multi-layer security controls to ensure all code changes meet audit and compliance requirements before production deployment.

### Pipeline Stages

```
Code Push
   ↓
GitHub Actions: Code Quality & Security
   ├─ ESLint (TypeScript strict mode, audit rules)
   ├─ TypeScript compilation check
   ├─ Unit tests (80% coverage minimum)
   ├─ Security scanning (npm audit, Snyk)
   ├─ Secrets detection (TruffleHog)
   └─ Next.js build verification
   ↓
Manual Code Review (2 approvals required)
   ├─ Architecture review
   ├─ Security review
   ├─ Business logic review
   └─ Test completeness review
   ↓
Automated Branch Protection Check
   ├─ All status checks passed
   ├─ 2 approvals obtained
   ├─ Ticket reference present
   └─ No conflicts with base branch
   ↓
Merge to Main (squash or rebase)
   ↓
Deploy to Vercel (production)
```

## 2. Code Quality Requirements

### 2.1 Linting & Code Style (ESLint)

**Configuration**: `/eslint.config.js`

**Audit Rules Enabled**:
- ✅ Security rules: `no-eval`, `no-implied-eval`, `no-new-func` (errors)
- ✅ Type safety: `@typescript-eslint/no-explicit-any` (warn)
- ✅ Equality checks: `eqeqeq` (warn) - prevents `==` usage
- ✅ Const preference: `prefer-const` (warn)
- ✅ No `var` declarations: `no-var` (warn)
- ✅ Console warnings: `no-console` (except warn/error) (warn)

**Running Locally**:
```bash
npm run lint              # Check all files
npm run lint -- --fix    # Auto-fix violations
```

**CI Integration**: All PRs must pass ESLint without errors (warnings are acceptable).

### 2.2 TypeScript Strict Mode

**Configuration**: `/tsconfig.json`

**Strict Options Enabled**:
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictPropertyInitialization": true
}
```

**Verification**: `npm run build` includes TypeScript compilation check.

### 2.3 Testing Requirements

**Minimum Coverage**: 80% for all library code  
**Framework**: Vitest  
**Configuration**: `/vitest.config.ts`

**Running Tests**:
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode for development
npm run test:coverage    # Generate coverage report
```

**CI Integration**: 
- All PRs must have passing tests
- Coverage must not decrease
- Minimum 80% threshold enforced

**Test Organization**:
- Unit tests: `lib/**/*.test.ts`
- Component tests: `components/**/*.test.tsx`
- Integration tests: `tests/**/*.test.ts`

## 3. Security Scanning

### 3.1 Dependency Vulnerability Scanning

**Tool**: npm audit  
**Threshold**: No high/critical vulnerabilities  
**Frequency**: On every PR

```bash
npm audit              # Show vulnerabilities
npm audit fix         # Auto-fix vulnerable packages
```

### 3.2 Advanced Security: Snyk

**Tool**: Snyk.io  
**Threshold**: High severity and above  
**Setup**: 
1. Connect Snyk to repository
2. Configure SNYK_TOKEN in GitHub Secrets
3. Automated scanning on every PR

### 3.3 Secrets Detection

**Tool**: TruffleHog  
**Purpose**: Detect accidentally committed secrets (API keys, tokens, passwords)  
**What It Blocks**:
- AWS access keys
- Database passwords
- API tokens
- Private keys
- Supabase service role keys

**Prevention**:
- Use `.env.local` (gitignored) for local development
- Never commit secrets to `.env.example` or `.env`
- Use GitHub Secrets for CI/CD variables

## 4. Code Review Requirements

### 4.1 Two-Approval Minimum

**Enforcement**: Repository branch protection rule

**Rule Configuration**:
```
Branch: main
- Require 2 approvals before merge
- Dismiss stale PR approvals when new commits pushed
- Require status checks to pass
- Require branches to be up to date
- Allow force pushes: No (admin cannot override)
```

### 4.2 Code Review Checklist

All reviewers must verify:

- [ ] **Architecture**: Does the change follow Lexora patterns?
- [ ] **Security**: Are there any security vulnerabilities?
  - [ ] No plaintext secrets in code
  - [ ] Proper input validation
  - [ ] SQL injection prevention (use parameterized queries)
  - [ ] CORS/auth headers correctly set
  - [ ] RLS policies applied to sensitive tables
- [ ] **Testing**: Is the change adequately tested?
  - [ ] New tests added for new functionality
  - [ ] Existing tests still pass
  - [ ] Coverage maintained or improved
- [ ] **Performance**: Any performance implications?
  - [ ] Database queries optimized
  - [ ] No N+1 queries
  - [ ] Caching leveraged where appropriate
- [ ] **Documentation**: Is the change documented?
  - [ ] Code comments added if complex
  - [ ] API changes documented
  - [ ] Database schema changes in migration files

### 4.3 Ticket Reference Requirement

All commits to `main` must reference a ticket:

**Valid formats**:
- `#123` (GitHub issue)
- `TICKET-123` (Jira/other systems)
- `[LEXORA-456]` (in commit message)

**Example**:
```
git commit -m "fix: Apply RLS policies to invoices table (#123)"
```

## 5. Status Checks (Branch Protection)

The following checks **MUST** pass before merge:

| Check | Tool | Requirement | Retry? |
|-------|------|-------------|--------|
| Lint | ESLint | No errors | Yes |
| TypeScript | tsc | No compilation errors | Yes |
| Unit Tests | Vitest | All pass, 80% coverage | Yes |
| Build | Next.js | Build succeeds | Yes |
| Secrets | TruffleHog | No secrets detected | No |
| Dependency Scan | npm audit | No high/critical | Yes |
| Security Scan | Snyk | No high/critical | Yes |

**Failed Check Handling**:
- All failures block merge
- Author must fix issues and push new commits
- Re-run checks automatically on new commits
- No "approve with failures" allowed

## 6. Deployment Process

### 6.1 Main Branch Deployments

**Trigger**: Push to `main` branch  
**Target**: Production (Vercel)  
**Process**:

1. All CI checks must pass (automated)
2. 2 manual approvals required (reviewed already)
3. Author merges PR (squash commits)
4. GitHub Actions triggers Vercel deploy hook
5. Vercel builds and deploys
6. Monitoring alerts configured (see MONITORING_ALERTING_SETUP.md)

### 6.2 Develop Branch (Staging)

**Trigger**: Push to `develop` branch  
**Target**: Staging (Vercel Preview)  
**Process**:

1. Same CI checks as main
2. 1 approval required (lighter gate)
3. Auto-deploys on merge

### 6.3 Rollback Procedure

**Quick Rollback** (if production issue):
1. Revert the problematic commit
2. Create a PR with the revert
3. Get 2 approvals
4. Merge to main
5. Vercel auto-deploys rollback

**Emergency Access**: Admins only, requires notification to team

## 7. Commit Message Requirements

All commits to `main` must follow this format:

```
<type>(<scope>): <subject> (#TICKET)

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Test additions/changes
- `docs`: Documentation
- `chore`: Build, deps, config
- `security`: Security fix

**Examples**:
```
feat(accounting): Add ECL calculation for IFRS 9 (#456)

Add Expected Credit Loss calculation logic for stage classification
and forward-looking macro adjustments.

Ticket: #456
```

```
fix(auth): Apply RLS policies to client_contacts (#123)

Ensure users can only view contacts for their tenant.

Ticket: #123
```

## 8. Audit Trail & Change Log

All deployments are automatically logged with:

- **Who**: Committer username & email
- **What**: Commit message & files changed
- **When**: Timestamp (UTC)
- **Where**: Repository & branch
- **Why**: Ticket reference (required)
- **Review**: Approvers and approval timestamps

**Access**: GitHub commit history and release notes

## 9. Environment Variables & Secrets

**Never commit secrets to repository**. Use GitHub Secrets:

1. Go to `Settings → Secrets and variables → Actions`
2. Create/update secret (e.g., `VERCEL_DEPLOY_HOOK_URL`)
3. Reference in GitHub Actions: `${{ secrets.VARIABLE_NAME }}`

**Secrets Required for Production**:
- `VERCEL_DEPLOY_HOOK_URL`: Vercel deployment webhook
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase admin key (use Vault)
- `SNYK_TOKEN`: Snyk scanning token

**See**: `/docs/SECRETS_MANAGEMENT_POLICY.md`

## 10. Local Development Setup

To enforce the same rules locally:

```bash
# Install dependencies
npm ci --legacy-peer-deps

# Run pre-commit checks
npm run lint && npm run test && npm run build

# Or use Git hooks (optional)
npm install husky lint-staged --save-dev
```

## 11. Troubleshooting

### Lint Errors

```bash
# See what eslint finds
npm run lint

# Auto-fix common issues
npm run lint -- --fix

# Fix specific file
npm run lint -- app/api/example/route.ts --fix
```

### Test Failures

```bash
# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test lib/accounting/ecritures-factures.test.ts

# Check coverage
npm run test:coverage
```

### Build Issues

```bash
# Clear Next.js cache and rebuild
rm -rf .next
npm run build

# Check TypeScript errors
npx tsc --noEmit
```

### Stuck PR (Stale Checks)

If checks are not re-running after a fix:
1. Push an empty commit: `git commit --allow-empty -m "Retry checks"`
2. Or close/reopen the PR
3. Or ask admin to re-run workflow

## 12. Success Criteria (Audit Ready)

- ✅ All code changes require code review + 2 approvals
- ✅ All commits must reference a ticket
- ✅ ESLint rules enforced for security & type safety
- ✅ 80% test coverage minimum
- ✅ Security scanning (npm audit, Snyk) passing
- ✅ Secrets detection preventing accidental commits
- ✅ No failed deployments due to missing reviews/tests
- ✅ Full audit trail of all changes (Git history)
- ✅ RTO < 4 hours (rollback via Git revert)

## 13. References

- [ESLint Config](../eslint.config.js)
- [GitHub Actions Workflows](../.github/workflows/)
- [Secrets Management Policy](SECRETS_MANAGEMENT_POLICY.md)
- [Monitoring & Alerting](MONITORING_ALERTING_SETUP.md)
- [Change Management](CHANGE_MANAGEMENT_PROCEDURES.md)
