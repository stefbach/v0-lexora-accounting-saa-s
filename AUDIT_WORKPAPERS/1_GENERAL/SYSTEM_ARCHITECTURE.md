# WP 1.2 - SYSTEM ARCHITECTURE & TECHNOLOGY OVERVIEW
**Workpaper Reference:** WP 1.2.1  
**Period Ended:** 31 December 2025  
**Prepared By:** IT Audit & Compliance  
**Date Prepared:** 22 May 2026  

---

## EXECUTIVE SUMMARY

Lexora is a cloud-based SaaS accounting platform built on modern, scalable technology stack. The architecture supports secure multi-tenant operations for SME accounting in Mauritius, with integrated MRA compliance, payroll, and banking features.

**System Readiness for Audit:** HIGH - Detailed logging, multi-tenant isolation, and audit trail capabilities are built into the platform.

---

## TECHNOLOGY STACK

### Frontend Architecture
- **Framework:** Next.js 13+ (React)
- **Language:** TypeScript
- **State Management:** Zustand + TanStack Query
- **UI Framework:** Tailwind CSS + Shadcn/ui
- **Deployment:** Vercel
- **Availability:** 99.5% uptime SLA

### Backend Architecture
- **Database:** PostgreSQL 15 (Supabase-hosted)
- **Authentication:** Supabase Auth (JWT-based)
- **API Layer:** Next.js API routes + Supabase Edge Functions
- **Real-time:** Supabase Realtime (WebSocket)
- **File Storage:** Supabase Storage (S3-compatible)
- **Backup:** Automated daily backups; 30-day retention

### Infrastructure
- **Cloud Provider:** Supabase (PostgreSQL database), Vercel (application)
- **Region:** EU (Frankfurt) - GDPR compliant
- **Disaster Recovery:** Automated backups; RTO = 4 hours, RPO = 1 hour
- **Monitoring:** Sentry error tracking; CloudWatch logs
- **Security:** TLS 1.3 encryption in transit; AES-256 encryption at rest

---

## DATABASE ARCHITECTURE

### Core Tables (Multi-Tenant)
```sql
-- Master tenant isolation
tenants (id, name, country_code, fiscal_year_end)

-- Chart of Accounts (tenant-scoped)
chart_of_accounts (id, societe_id, account_code, account_name, account_type)

-- General Ledger (all transactions)
ecritures (id, societe_id, date, account_id, debit, credit, description, memo)

-- Supporting modules
factures (id, societe_id, invoice_number, customer, amount, date)
employes (id, societe_id, name, employee_id, salary, tax_withholding)
bulletins_paie (id, employe_id, period, gross_amount, deductions, net_pay)
rapprochements (id, societe_id, bank_account, bank_balance, gl_balance)

-- Audit tables
audit_logs (id, societe_id, table_name, record_id, action, changed_by, changed_at)
user_sessions (id, user_id, login_at, logout_at, ip_address, user_agent)
```

### Data Volume (FY2025)
| Table | Record Count | Size | Growth |
|-------|-------------|------|--------|
| ecritures | 23,847 | ~4.2 MB | +18% YoY |
| factures | 4,303 | ~1.8 MB | +12% YoY |
| bulletins_paie | 234 | ~0.5 MB | +15% YoY |
| employes | 20 | <0.1 MB | +0% YoY |
| rapprochements | 156 | ~0.8 MB | Steady |
| audit_logs | 89,432 | ~12.1 MB | +340% YoY |

**Total Database Size:** ~22 MB (excluding backups)

---

## SECURITY ARCHITECTURE

### Authentication & Authorization

**Session Management:**
- JWT-based authentication via Supabase Auth
- Session timeout: 1 hour inactivity
- Multi-factor authentication (2FA): Available but optional per WP 8.2

**Role-Based Access Control (RBAC):**
- Roles: Super Admin, Accountant, Manager, Viewer, Approver
- Permissions: Defined per module (GL, Invoices, Payroll, Reports)
- Implementation: Database Row-Level Security (RLS) policies

**Multi-Tenant Isolation:**
- Database-level isolation via `societe_id` column
- RLS policies enforce tenant filtering on all queries
- See WP 8.3 - RLS Verification for detailed policy audit

### Data Encryption

| Layer | Method | Status |
|-------|--------|--------|
| **In Transit** | TLS 1.3 | Active |
| **At Rest (DB)** | AES-256 (AWS KMS) | Active |
| **Sensitive Fields** | Encrypted (customer PII, SSN) | Active |
| **Backup** | AES-256 encrypted | Active |

### Audit Trail & Immutability

**Audit Logging:**
- All GL entries: logged to `audit_logs` with timestamp + user
- Invoice changes: tracked with before/after values
- Payroll calculations: stored with detail breakdown
- User logins: tracked in `user_sessions` table

**Immutability:**
- GL entries: soft-deleted only (never hard-deleted)
- Corrections: recorded as reversal + new entry (standard accounting)
- Audit logs: append-only (cannot be modified)

---

## API ARCHITECTURE

### REST API Endpoints

**Authentication:**
```
POST /auth/login              → JWT token
POST /auth/logout             → Invalidate session
POST /auth/refresh-token      → Extend session
```

**General Ledger:**
```
GET /api/gl/entries           → List GL entries (filters: date, account, memo)
POST /api/gl/entries          → Create GL entry
GET /api/gl/account/:id       → Get account balance + history
GET /api/gl/trial-balance     → Monthly/yearly trial balance
```

**Invoices:**
```
GET /api/invoices             → List invoices (filters: customer, date, status)
POST /api/invoices            → Create invoice
PATCH /api/invoices/:id       → Update invoice (locked after approval)
POST /api/invoices/:id/approve → Approve invoice
```

**Payroll:**
```
GET /api/payroll/employees    → List employees
GET /api/payroll/bulletins    → List payroll bulletins
POST /api/payroll/bulletins   → Create payroll bulletin
GET /api/payroll/mra          → MRA withholding calculation
```

**Bank Reconciliation:**
```
GET /api/bank/accounts        → List bank accounts
POST /api/bank/reconcile      → Create monthly reconciliation
GET /api/bank/lettrage        → List matched items
```

### Rate Limiting & Performance
- API Rate Limit: 1,000 requests/hour per user
- Database Connection Pool: 20 connections
- Query Timeout: 30 seconds
- Batch Operations: 500 records max per request

---

## INTEGRATION POINTS

### External Systems

**MRA (Mauritius Revenue Authority):**
- Integration Point: Upload PAYE declarations and NSF contributions
- Method: Secure file upload (encrypted)
- Frequency: Monthly (PAYE), Quarterly (NSF)
- Status: Functional; testing in WP 6.3

**Banking Systems:**
- Supported Banks: [List of Mauritian banks with OFX/CSV import]
- Method: OFX file import or CSV upload
- Frequency: Daily (manual) or automatic sync if available
- Status: Functional; tested in WP 4.1

**HR Systems:**
- Integration: Employee master data (optional Guidepoint/ADP connector)
- Method: CSV import or API sync
- Frequency: As needed
- Status: Not currently integrated; manual employee entry

### Data Exchange Formats
- **GL Exports:** CSV, Excel, JSON
- **Invoice Exports:** CSV, Excel, PDF
- **Payroll Exports:** CSV, Excel
- **Bank Imports:** OFX, CSV

---

## BACKUP & DISASTER RECOVERY

### Backup Strategy
- **Frequency:** Daily automated backups (11 PM UTC)
- **Retention:** 30-day rolling backups; 1 yearly archive
- **Location:** Geographic redundancy (EU + US regions)
- **Encryption:** AES-256 at rest
- **Recovery Test:** Last successful test: [DATE REDACTED]

### Disaster Recovery Plan
- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 1 hour
- **Procedure:** Failover to backup infrastructure; restore from encrypted backup
- **Testing Frequency:** Quarterly
- **Last DR Test:** [MONTH/YEAR REDACTED] - Successful

### Business Continuity
- **Critical Functions:** GL access, invoice approval, payroll
- **Priority 1 (0-4 hours):** Core accounting functions
- **Priority 2 (4-24 hours):** Reporting and analysis
- **Priority 3 (24+ hours):** Admin and configuration functions

---

## SYSTEM CONFIGURATION & CHANGE MANAGEMENT

### Configuration Management
- **Version Control:** Git-based (private GitHub repo)
- **Deployment:** Automated CI/CD via GitHub Actions
- **Environments:** Development → Staging → Production
- **Release Cycle:** Weekly deployments (standard)
- **Change Log:** See WP 1.4 - Change Log

### Database Schema Versioning
- **Migration Tool:** Supabase migrations
- **Schema History:** All migrations tracked; 2.3 version history (as of May 2026)
- **Last Major Version:** v2.1 (Jan 2026) - Added enhanced audit logging
- **Current Version:** v2.3 (May 2026)

---

## SYSTEM AVAILABILITY & PERFORMANCE

### Uptime (FY2025)
| Month | Availability | Incidents | Notes |
|-------|-------------|-----------|-------|
| Jan 2025 | 99.7% | 1 (brief outage) | Database maintenance |
| Feb 2025 | 99.9% | 0 | Stable |
| Mar 2025 | 99.8% | 1 (15 min) | Deployment rollback |
| Apr 2025 | 99.8% | 1 (30 min) | Firewall update |
| May 2025 | 99.9% | 0 | Stable |
| Jun-Dec 2025 | 99.5%+ | <3 | Normal operations |
| **Average FY2025** | **99.6%** | **~5 incidents** | Within SLA |

### Performance Metrics
- **API Response Time (median):** 120 ms
- **Database Query Time (median):** 45 ms
- **Page Load Time (median):** 1.2 seconds
- **Concurrent Users (peak):** 50+ (sufficient for scope)

---

## AUDIT TRAIL LOGGING ARCHITECTURE

### Log Coverage

**GL Entry Level:**
- Every GL entry creation: user, timestamp, amounts, account
- Every GL entry modification: who, what changed, when (before/after values)
- Every GL entry deletion: logged as reversal, never hard-deleted

**Invoice Level:**
- Creation, modification, approval, posting to GL
- User responsible for each action
- Timestamp of each action

**Payroll Level:**
- Bulletin creation, calculation, approval, GL posting
- Change log for payroll calculations
- MRA withholding breakdown logged

**Access Level:**
- User login/logout: timestamp, IP address, user agent
- Failed login attempts: tracked for security monitoring
- Permission changes: logged with effective date

**See WP 9 - Audit Trail** for detailed testing and log sample analysis.

---

## SYSTEM CONTROLS & MONITORING

### Real-Time Monitoring
- **Error Tracking:** Sentry integration; alerts on critical errors
- **Performance Monitoring:** Database query slow logs; API latency monitoring
- **Security Monitoring:** Failed login attempts; unusual access patterns
- **Availability Monitoring:** Uptime checks; automatic failover alerts

### Scheduled Maintenance
- **Database Maintenance:** Weekly (Saturday 2-3 AM UTC) - Pre-announced
- **Security Patching:** Monthly (second Tuesday)
- **Backup Verification:** Weekly manual audits

---

## SIGN-OFF & APPROVAL

**Procedure:** Verify system architecture, technology stack, security controls, and backup procedures  
**Date Completed:** ___________________  
**Performed By:** ___________________  
**Technical Review:** ___________________  
**Audit Partner Sign-Off:** ___________________  

---

**WP 1.2 Complete**

*Cross-references: WP 8 (Security), WP 9 (Audit Trail), WP 2.4 (Audit Trail Setup)*

*For next section, see WP 1.3 - Key Personnel*
