# ACCESS CONTROL MATRIX
## Role-Based Access Control (RBAC) for Lexora SaaS

**Document Version:** 1.1  
**Last Updated:** 2026-05-24  
**Owner:** Security & Access Control Team  
**Applicable Standards:** ISO 27001, SOX-equivalent, MRA compliance

> **v1.1 (2026-05-24) — Roadmap V5 9/10 :** ajout de la section
> *Role hierarchy enforcement (SEC-001)* qui formalise la règle
> ROLE_LEVEL : **un rôle ne peut gérer qu'un rôle de niveau strictement
> inférieur**. Mises à jour dans la SOD matrix (User Access),
> et nouvelles fonctions RLS `user_has_societe_access` /
> `user_has_employe_access` (SEC-003, migrations 415 A→D).

---

## EXECUTIVE SUMMARY

This document defines Role-Based Access Control (RBAC) for Lexora, ensuring:
- **Principle of Least Privilege:** Users get minimum access needed
- **Segregation of Duties (SOD):** Critical functions separated
- **Audit Trail:** All access logged and reviewable
- **Regulatory Compliance:** MRA, GDPR, ISO 27001

---

## ROLE HIERARCHY ENFORCEMENT (SEC-001)

Lexora enforces a **strict numeric role hierarchy** to prevent privilege
escalation. The hierarchy is encoded in `lib/auth/roles.ts` as the
`ROLE_LEVEL` constant:

| Role | Level | Can manage (≤ self − 1) |
|------|------:|--------------------------|
| `super_admin` | 100 | all other roles |
| `admin` | 80 | comptable, rh, assistant, client_admin, client_user |
| `comptable` | 60 | assistant_comptable, client_user |
| `rh` / `rh_manager` | 60 | client_user only |
| `assistant_comptable` | 40 | client_user only |
| `client_admin` | 30 | client_user (own societe) |
| `client_user` | 10 | none |
| `service_account` | 0 | none |

**Hard rules (enforced server-side via `canManageRole(actor, target)`):**

- ❌ `rh` (or `rh_manager`) **cannot reset, promote, or delete** a
  `super_admin` or `admin` — historical incident: a `rh` user was able
  to trigger a password reset on a `super_admin` account before SEC-001.
- ❌ `comptable` cannot modify an `admin` or `super_admin`.
- ❌ `client_admin` cannot modify any internal Lexora role.
- ❌ No user (other than `super_admin`) may elevate another user above
  their own level.
- ✅ Only `super_admin` can create another `super_admin`.

All role-changing endpoints (`/api/admin/users/**`,
`/api/rh/employes/[id]/reset-password`, etc.) MUST call `canManageRole`
before any `auth.admin.*` mutation.

---

## ROLE DEFINITIONS

### 1. ADMIN (Platform Administrator)

**Description:** Full system access, security/compliance focus

**Responsibilities:**
- User management and role assignment
- System configuration and backups
- Encryption key management
- Security incident response
- Audit log review
- Regulatory compliance

**Key Permissions:**
- All tables: Full CRUD access
- Decrypt all RESTRICTED data (AES-256-GCM)
- Export sensitive data (with audit logging)
- Modify RLS policies
- Rotate encryption keys
- Access audit trail (unfiltered)

**Limitations:**
- Cannot override segregation of duties (SOD)
- Cannot delete financial records (retention policy enforced)
- Cannot modify passwords directly (users reset own)
- Cannot bypass encryption at rest

**Authentication:**
- Multi-factor authentication (MFA) required
- Session timeout: 30 minutes
- Login locations tracked and alerted

---

### 2. COMPTABLE (Accountant/Bookkeeper)

**Description:** Full accounting access, limited to assigned societes

**Responsibilities:**
- GL entry recording and reconciliation
- Invoice processing (vendor & customer)
- Bank reconciliation
- Tax return preparation
- Financial reporting
- Audit coordination

**Key Permissions:**
- GL (ecritures_comptables): Full CRUD
- Invoices (factures): Full CRUD
- Bank statements (releves_bancaires): Read/Write
- Bank transactions (transactions_bancaires): Read/Write
- VAT (tva_mensuelle): Full CRUD
- Payroll summary (not employee details): Read
- Audit trail: Read (own dossier only)

**Limitations:**
- **societe_id filter:** Only assigned societes (RLS enforced)
- Cannot access employee personal data (phone, address, ID)
- Cannot modify MRA credentials (admin only)
- Cannot modify encryption keys
- Cannot override retention policy
- Cannot approve own GL entries (SOD)

**Data Access:**
```
societes: Read (assigned only)
├─ dossiers: Full access (assigned clients)
├─ ecritures_comptables: Full CRUD (assigned societe)
├─ factures: Full CRUD (assigned societe)
├─ releves_bancaires: Read/Write (assigned societe)
├─ transactions_bancaires: Read/Write (assigned societe)
├─ tva_mensuelle: Full CRUD (assigned societe)
└─ audit_trail: Read (own dossier changes)
```

**Role Requirements:**
- CPA/Accounting certification (preferred)
- Comptable or assistant comptable designation
- Training on GL procedures completed
- Signed confidentiality agreement

---

### 3. CLIENT_ADMIN (Client/Business Owner)

**Description:** Limited financial visibility, own company only

**Responsibilities:**
- Monitor financial status (read-only)
- Approve invoices (optional, configurable)
- View reports and dashboards
- Manage document uploads
- Coordinate with comptable

**Key Permissions:**
- ecritures_comptables: Read only (assigned societe)
- factures: Read/Write (own invoices, assigned societe)
- releves_bancaires: Read (assigned societe)
- transactions_bancaires: Read (assigned societe)
- rapports_mensuels: Read (P&L, balance sheet)
- tableaux_de_bord: Read (dashboards, KPIs)
- documents: Read/Write (dossier-level access)

**Limitations:**
- **societe_id filter:** Own company only (RLS enforced)
- Cannot access GL details (amounts masked)
- Cannot access employee data
- Cannot export financial data without audit approval
- Cannot modify GLentries
- Cannot access audit trail
- Cannot delete documents

**Data Access:**
```
societes: Read (own only)
├─ dossiers: Read (assigned only)
├─ factures: Read/Write (own/assigned)
├─ releves_bancaires: Read (assigned)
├─ transactions_bancaires: Read (assigned)
├─ rapports_mensuels: Read (own societe)
├─ tableaux_de_bord: Read (own societe)
└─ documents: Read/Write (dossier-level)
```

**Default Configuration:**
- Cannot post GL entries
- Can download invoices (PDF)
- Can upload documents
- Can view up to 12-month history

---

### 4. ASSISTANT_COMPTABLE (Junior Accountant)

**Description:** Limited accounting access, read-heavy, supervised

**Responsibilities:**
- Data entry (invoices, expenses)
- Document verification
- Preliminary reconciliation
- Report generation
- Quality assurance

**Key Permissions:**
- ecritures_comptables: Create/Read (assigned only, no delete)
- factures: Read (all assigned societes)
- releves_bancaires: Read/Create (preliminary reconciliation)
- transactions_bancaires: Read
- documents: Read/Write (upload, organize)
- audit_trail: Read (learning purposes, supervised)

**Limitations:**
- Cannot post GL entries to live GL (requires comptable review)
- Cannot delete any financial records
- Cannot reconcile bank statements (comptable only)
- Cannot approve invoices
- Cannot access employee data
- Cannot export GL
- Cannot modify master data (accounts, suppliers)

**Workflow:**
```
Assistant Comptable
  ├─ Creates GL entries (draft state)
  └─ Comptable reviews & publishes

Assistant Comptable
  ├─ Uploads invoice images (OCR prep)
  └─ Comptable validates & records GL
```

**Data Access:**
```
societes: Read (assigned)
├─ dossiers: Read (assigned)
├─ ecritures_comptables: Create/Read draft (assigned)
├─ factures: Read (assigned)
├─ releves_bancaires: Read (assigned)
└─ documents: Read/Write (dossier-level)
```

---

### 5. RH_MANAGER (HR/Payroll Manager)

**Description:** Payroll and HR data access, confidential level

**Responsibilities:**
- Payroll processing and validation
- Employee contract management
- Leave and attendance tracking
- Compensation planning
- PAYE/CSG/NSF filing
- Compliance verification

**Key Permissions:**
- employes: Full CRUD (assigned organization)
- bulletins_paie: Full CRUD (assigned organization)
- declarations_paye_mensuelle: Full CRUD
- declarations_csg_mensuelle: Full CRUD
- demandes_conges: Read/Approve
- soldes_conges: Read
- contrats_emploi: Full CRUD
- pointages: Read/Write
- heures_travaillees: Read/Write

**Limitations:**
- Cannot access GL entries (accounting only)
- Cannot access invoices (accounting only)
- Cannot access bank accounts
- Cannot approve budgets
- Cannot modify MRA credentials
- Cannot export full payroll (masked salary reports only)

**Sensitive Data Access:**
- Employee names: Read/Write
- Salary amounts: Read (can mask in exports)
- Bank account for salary: Read only (encrypted)
- Tax IDs/SSN: Read (encrypted, masked in logs)

**Data Access:**
```
employes: Full CRUD (assigned societe)
├─ bulletins_paie: Full CRUD (assigned)
├─ declarations_paye_mensuelle: Full CRUD
├─ declarations_csg_mensuelle: Full CRUD
├─ demandes_conges: Read/Approve (assigned)
├─ soldes_conges: Read (assigned)
├─ contrats_emploi: Full CRUD (assigned)
├─ pointages: Read/Write (assigned)
└─ heures_travaillees: Read/Write (assigned)
```

**Audit Trail:**
- All salary-related changes logged
- Salary exports marked with timestamp/user
- PAYE/CSG submissions verified and logged

---

### 6. CLIENT_USER (Employee/Team Member)

**Description:** Minimal access, own data only (if configured)

**Responsibilities:**
- View own payslip
- Request leave
- Report time/attendance
- Submit expenses (optional)

**Key Permissions:**
- Own employee record: Read only
- Own payslips (bulletins_paie): Read only
- Own leave requests (demandes_conges): Create/Read
- Own attendance: Read only
- Submit time entries: Create (optional)

**Limitations:**
- Cannot access other employees' data
- Cannot access financial data
- Cannot access invoices
- Cannot access GL
- Cannot download payslips (no export, view only)
- Cannot modify leave requests once submitted

**Data Access:**
```
employes: Read (own only, via auth.user_id)
├─ bulletins_paie: Read (own only)
├─ demandes_conges: Create/Read (own only)
├─ soldes_conges: Read (own only)
└─ pointages: Read (own only)
```

**Privacy:**
- Other employees invisible
- Other societes invisible
- Salary visible (own payslip only)
- Benefits visible (own contracts only)

---

### 7. SERVICE_ACCOUNT (API/Automation)

**Description:** Machine-to-machine access for integrations

**Use Cases:**
- n8n workflow automation
- Bank statement scraping
- Automated reconciliation
- Tax filing (MRA API calls)
- Report generation
- Backup/export jobs

**Key Permissions:**
- Database: Read/Write (specific tables only)
- Encryption: Decrypt (specific tables, audit logged)
- API calls: Outbound (n8n, MRA, bank APIs)
- Scheduled jobs: Execute
- Email/WhatsApp: Send notifications

**Limitations:**
- Cannot create user accounts
- Cannot modify roles
- Cannot access encryption keys directly
- Cannot bypass RLS policies
- Requests logged with source IP/timestamp
- API key rotation: Every 90 days
- Rate limited: Prevent abuse

**Service Account Examples:**

```
Service Account: n8n-lexora
├─ Tables: Read/Write (documents, ecritures_comptables)
├─ Encryption: Decrypt (bank account numbers, MRA creds)
├─ External APIs: n8n, MRA, bank platforms
└─ Schedule: Every 6 hours

Service Account: backup-lexora
├─ Tables: Read (all)
├─ Encryption: No decrypt needed (backup encrypted)
├─ External APIs: AWS S3, backup storage
└─ Schedule: Daily 02:00 UTC

Service Account: mra-filing-lexora
├─ Tables: Read (payroll, tax data)
├─ Encryption: Decrypt (MRA credentials only)
├─ External APIs: MRA online filing system
└─ Schedule: Monthly (15th, 20th, etc.)
```

---

## SEGREGATION OF DUTIES (SOD) MATRIX

**Key Principle:** No single person can complete a financial transaction alone.

| Process | Create | Review/Approve | Post | Reconcile |
|---------|--------|-----------------|------|-----------|
| **GL Entry** | Assistant Comptable | Comptable | Comptable | Comptable (different) |
| **Invoice** | Assistant Comptable | Comptable | Comptable | Comptable (different) |
| **Bank Rec** | Comptable (preliminary) | Comptable (different) | Comptable (different) | Comptable (different) |
| **Payroll** | RH Manager | RH Manager (review) | RH Manager | Comptable (GL post) |
| **MRA Filing** | RH/Comptable | Comptable (review) | Admin (encrypted) | Admin (verify) |
| **User Access** | Admin | Admin (different) | Admin (different) | Admin (audit log) |
| **Password Reset** | RH (own level) | Admin/Super_Admin | n/a | Audit (413) |

> **SEC-001:** Password reset of a higher-or-equal role is **blocked
> server-side** (see `canManageRole`). `rh` cannot reset `super_admin`,
> `comptable` cannot reset `admin`. All password resets are logged to
> `password_reset_audit` (migration 413_password_reset_audit.sql).

**Example: Invoice-to-Payment**

```
1. Assistant Comptable uploads invoice (scan/PDF)
2. Comptable validates & creates GL entry
3. Comptable reconciles to PO (if required)
4. Comptable posts to GL
5. Comptable marks invoice as paid
6. Different Comptable (monthly): Reconciles AP subledger to GL
   └─ Alert if variance > 5% or unreconciled > 30 days
```

---

## ROW-LEVEL SECURITY (RLS) POLICIES

### RLS Architecture

All financial tables enforce RLS at database level:

```sql
-- Example: RLS on ecritures_comptables
CREATE POLICY comptable_access ON public.ecritures_comptables
  FOR SELECT
  USING (
    dossier_id IN (
      SELECT id FROM public.dossiers
      WHERE comptable_id = auth.uid()
    )
  );

CREATE POLICY client_readonly ON public.ecritures_comptables
  FOR SELECT
  USING (
    dossier_id IN (
      SELECT id FROM public.dossiers
      WHERE client_id = auth.uid()
    )
    AND auth.jwt() ->> 'role' = 'client_admin'
  );

-- Service account: Limited to authorized tables
CREATE POLICY service_account ON public.ecritures_comptables
  FOR SELECT USING (
    auth.jwt() ->> 'service_account' = 'n8n-lexora'
    AND dossier_id IN (SELECT authorized_dossiers FROM service_account_permissions)
  );
```

### RLS by Role

| Role | RLS Filter | Effect |
|------|-----------|--------|
| **Admin** | None (full access) | Sees all data |
| **Comptable** | `comptable_id = auth.uid()` | Sees only own dossiers |
| **Client_Admin** | `societe_id IN (own companies)` | Sees only own companies |
| **Assistant_Comptable** | `comptable_id = auth.uid()` | Sees only assigned dossiers |
| **RH_Manager** | `societe_id IN (assigned)` | Sees only assigned organizations |
| **Client_User** | `employee_id = auth.uid()` | Sees only own records |
| **Service_Account** | Per service_account_permissions table | Limited to specific tables |

---

## DETAILED ACCESS CONTROL TABLE

### Table: AUTHENTICATION & IDENTITY

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **auth.users** | id | R | R | R | R | R | R | R |
| | email | R/W | - | - | - | - | R | R |
| | password_hash | R | - | - | - | - | - | - |
| **profiles** | id | R/W | R | R | R | R | R | R |
| | email | R/W | R | - | - | - | R | - |
| | full_name | R/W | R | - | - | - | R | - |
| | phone | R/W | R (own) | - | - | - | R (own) | - |
| | role | R/W | - | - | - | - | - | - |

### Table: COMPANY STRUCTURE

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **societes** | id | R | R | R | R | R | - | R |
| | nom | R/W | R | R | R | R | - | R |
| | brn | R/W | R (ENCRYPTED) | - | - | R | - | - |
| | numero_tva_mra | R/W | R (ENCRYPTED) | - | - | - | - | - |
| | adresse | R/W | R | R | - | - | - | - |
| **dossiers** | client_id | R/W | R (RLS) | - | - | - | - | - |
| | comptable_id | R/W | R | - | - | - | - | - |
| | societe_id | R/W | R (RLS) | R (RLS) | R (RLS) | R (RLS) | - | R |
| | statut | R/W | R/W | - | R | - | - | - |

### Table: ACCOUNTING & FINANCIAL

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **ecritures_comptables** | All | R/W | R/W (RLS) | R | R (draft) | - | - | R/W (RLS) |
| **factures** | All | R/W | R/W (RLS) | R | R | - | - | R/W (RLS) |
| **releves_bancaires** | All | R/W | R/W (RLS) | R | R | - | - | R/W (RLS) |
| **transactions_bancaires** | All | R/W | R/W (RLS) | R | R | - | - | R/W (RLS) |
| **comptes_bancaires** | numero_compte | R (ENCRYPTED) | R (ENCRYPTED) | - | - | - | - | R (ENCRYPTED) |
| | iban | R (ENCRYPTED) | R (ENCRYPTED) | - | - | - | - | R (ENCRYPTED) |
| | swift | R (ENCRYPTED) | R (ENCRYPTED) | - | - | - | - | R (ENCRYPTED) |
| | nom_banque | R/W | R/W (RLS) | - | - | - | - | R |
| **tva_mensuelle** | All | R/W | R/W (RLS) | - | R | - | - | R/W (RLS) |

### Table: PAYROLL & HR

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **employes** | prenom/nom | R/W | - | - | - | R/W (RLS) | R (own) | - |
| | email | R/W | - | - | - | R/W (RLS) | R (own) | - |
| | telephone | R/W | - | - | - | R (ENCRYPTED) | R (own) | - |
| | numero_id | R/W | - | - | - | R (ENCRYPTED) | - | - |
| | salaire_brut | R (ENCRYPTED) | R (summary) | - | - | R (ENCRYPTED) | - | - |
| **bulletins_paie** | salaire_brut | R (ENCRYPTED) | R (summary) | - | - | R (ENCRYPTED) | R (own) | R |
| | salaire_net | R (ENCRYPTED) | - | - | - | R (ENCRYPTED) | R (own) | R |
| **declarations_paye_mensuelle** | All | R/W | R (review) | - | - | R/W | - | R/W |
| **declarations_csg_mensuelle** | All | R/W | R (review) | - | - | R/W | - | R/W |
| **demandes_conges** | All | R/W | - | - | - | R/W (approve) | R/W (own) | - |
| **soldes_conges** | All | R | - | - | - | R | R (own) | - |

### Table: COMPLIANCE & REGULATORY

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **societe_mra_credentials** | mra_api_key | R (VAULT) | - | - | - | - | - | R (VAULT) |
| | mra_password | R (VAULT) | - | - | - | - | - | R (VAULT) |
| **audit_trail** | All | R (unfiltered) | R (own dossier) | - | - | R (own org) | - | - |
| | old_values | R (masked) | R (own, masked) | - | - | - | - | - |
| | new_values | R (masked) | R (own, masked) | - | - | - | - | - |

### Table: DOCUMENTS & STORAGE

| Table | Field | Admin | Comptable | Client_Admin | Assistant | RH_Mgr | Client_User | Service_Acct |
|-------|-------|-------|-----------|--------------|-----------|--------|------------|--------------|
| **documents** | All | R/W | R/W (RLS) | R/W | R/W | R/W | R/W (own) | R/W (RLS) |
| **factures_contacts** | nom/email/phone | R/W | R/W (RLS) | - | - | - | - | R |

### Legend

- **R** = Read access
- **W** = Write access (Create, Update)
- **D** = Delete access
- **RLS** = Row-Level Security filtered
- **ENCRYPTED** = Field encrypted; decryption logged
- **VAULT** = Supabase Vault access (audit logged)
- **summary** = Aggregated/masked view (no details)
- **-** = No access
- **own** = Only own records
- **RLS** = Row-level security enforced

---

## ACCESS REQUEST & APPROVAL PROCESS

### New Access Request Workflow

```
Employee joins
  ├─ Manager submits access request (email or form)
  ├─ Security team reviews (24 hours)
  │  ├─ Verify role and justification
  │  ├─ Check for SOD conflicts
  │  └─ Obtain manager approval
  ├─ Admin implements access (RLS policies)
  ├─ Employee completes security training
  └─ Access granted + email confirmation

Request Approval:
1. Security team: Validates business need
2. Manager: Approves request
3. Admin: Implements + documents
4. Employee: Confirms receipt
5. Audit log: All steps recorded
```

### Role Change Process

```
Employee role change (e.g., promoted from Assistant to Comptable)
  ├─ Manager submits role change request
  ├─ Security team reviews (48 hours)
  │  ├─ Verify promotion
  │  ├─ Check for SOD conflicts
  │  └─ Obtain HR approval
  ├─ Admin removes old role permissions
  ├─ Admin grants new role permissions
  ├─ Employee retrains on new responsibilities
  ├─ Audit log: Old & new roles recorded
  └─ Access updated

Revocation Process:
1. Termination notice received
2. Security team: Disable all access
3. Admin: Revoke credentials + sessions
4. Manager: Retrieve equipment + docs
5. Audit log: Comprehensive termination record
```

---

## AUDIT & MONITORING

### Access Audit Schedule

| Activity | Frequency | Owner | Action |
|----------|-----------|-------|--------|
| User access review | Quarterly | Security | Verify RLS policies |
| Role assignment review | Semi-annually | HR & Security | Confirm role appropriateness |
| SOD conflict check | Monthly | Compliance | Detect segregation violations |
| Anomalous access report | Weekly | Security | Investigate unusual patterns |
| Service account activity | Weekly | Ops | Verify API key usage |
| Encryption access logs | Monthly | Security | Review decryption requests |
| Termination checklist | Per termination | HR & Security | Verify access revoked |

### Red Flag Alerts

```
Automatic alerts for:
├─ Admin access outside business hours
├─ Bulk data exports (> 10K records)
├─ Multiple failed login attempts (> 5 in 10 min)
├─ Service account API key rotation overdue
├─ Decryption of RESTRICTED data without recent activity
├─ GL entry deletion (should never happen)
├─ Same person creating + approving invoice
└─ Access from unusual IP address
```

---

## SERVICE ACCOUNT APPROVAL MATRIX

| Service Account | Purpose | Approved By | Rotation | Tables |
|-----------------|---------|------------|----------|--------|
| **n8n-lexora** | Workflow automation | CTO + Comptable | 90 days | ecritures, documents, declarations |
| **backup-lexora** | Daily backup | CTO | 90 days | All (read-only) |
| **mra-filing-lexora** | Tax filing (PAYE/CSG) | CTO + Tax | 90 days | payroll, declarations |
| **report-generator** | Report exports | CTO | 90 days | GL, invoices, reports |
| **bank-scraper** | Bank statement import | CTO | 90 days | bank statements, transactions |

---

## COMPLIANCE CHECKLIST

- [ ] All users assigned appropriate role
- [ ] SOD conflicts reviewed and resolved
- [ ] RLS policies enabled on all financial tables
- [ ] Service account rotation schedule active
- [ ] Audit logs comprehensive and immutable
- [ ] Encryption key access logged
- [ ] Monthly access reviews scheduled
- [ ] Termination process documented and tested
- [ ] MFA enabled for admin accounts
- [ ] Session timeouts configured

---

## DOCUMENT CONTROL

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-22 | Initial RBAC matrix |
| | | 7 roles defined |
| | | 180+ table × field access levels |
| | | SOD requirements documented |
| | | Service account framework |

---

## REFERENCES

- **ISO 27001:2022:** Section 6.2 (Access Control)
- **MRA Code:** Financial audit requirements
- **GDPR Article 32:** Data security and access controls
- **Sarbanes-Oxley Section 302:** Internal control requirements
- **NIST SP 800-53:** Access control standards
