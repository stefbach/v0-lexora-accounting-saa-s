# PLAN D'ACTION - LEXORA "OUTIL PARFAIT"
## Roadmap Exécutable pour Big 4 Ready + Enterprise Grade

**Objectif:** Transformer Lexora en outil comptable/RH de **très haut niveau, sécurisé, conforme et unique sur le marché**

**Timeline:** 16 semaines (4 mois) pour atteindre "Parfait"  
**Status:** COMMENÇONS MAINTENANT

---

## PHASE 0: SEMAINE 0 (CETTE SEMAINE) - KICKOFF & PRÉPARATION

### 📋 Tâches Immédiates (Avant Lundi)

#### 1. APPROUVER LE PLAN D'ACTION
**Owner:** Stéphane Bach (CFO)  
**Action:** Lire ce document + approuver timeline + budget  
**Deadline:** TODAY  
**Success Criteria:** ✅ Email confirmation

#### 2. ALLOUER LES RESSOURCES
**Owner:** Leadership  
**Resources Needed:**
- 1 **Tech Lead Full-Time** (80 heures/mois) — Tech fixes + architecture
- 1 **Security Engineer Part-Time** (40h/mois) — RLS + encryption + audits
- 1 **QA Engineer** (60h/mois) — Tests + validation
- 1 **Finance Controller** (60h/mois) — Controls documentation
- 1 **Database Architect** (20h/mois) — Schema audit + optimization

**Budget:** $107,000 total (interne + external consulting)

**Deadline:** MONDAY

#### 3. CRÉER STEERING COMMITTEE
**Members:**
- CFO (Finance)
- CTO (Tech)
- IT Manager (Operations)
- Compliance Officer (Legal)

**Meeting:** Every Monday 10:00 AM (30 min status)

**Deadline:** FRIDAY — First meeting scheduled

---

## PHASE 1: SEMAINES 1-2 - FIXER VULNERABILITÉS CRITIQUES

### 🔴 CRITICAL: 4 API Routes avec Cross-Tenant Access

**Task 1.1: Audit + Fix API Routes**  
**Owner:** Tech Lead  
**Effort:** 8 hours  
**Due:** Friday Week 1

**Steps:**
1. Identify 4 vulnerable routes:
   - `/api/client/actions`
   - `/api/client/echeances`
   - `/api/client/investissements`
   - `/api/client/factures` (PATCH/DELETE)

2. For each route:
   ```typescript
   // BEFORE (vulnerable):
   POST /api/client/actions { societe_id: "ATTACKER_ID" }
   
   // AFTER (fixed):
   const { societe_id } = req.body;
   await assertSocieteAccess(admin, userId, societe_id);  // Must pass
   if (!authorized) return res.status(403).json({ error: "Access denied" });
   ```

3. Add access check to route handler (top of function)

4. Write test:
   ```typescript
   test('User A cannot access Company B data', async () => {
     const userA = { id: 'user_a', societe_id: 'company_a' };
     const companyB = 'company_b_id';
     const response = await POST('/api/client/actions', 
       { societe_id: companyB, ... }, 
       { auth: userA }
     );
     expect(response.status).toBe(403);
   });
   ```

**Success Criteria:**
- ✅ 4 routes have `assertSocieteAccess()` check
- ✅ 4 unit tests pass (cross-tenant attempt → 403)
- ✅ Code review approved by security engineer

---

### 🔴 CRITICAL: RLS Policies - 39 Tables

**Task 1.2: Audit RLS Policies**  
**Owner:** Database Architect  
**Effort:** 12 hours  
**Due:** Wednesday Week 1

**Steps:**
1. Run query:
   ```sql
   SELECT schemaname, tablename, policyname, qual 
   FROM pg_policies 
   WHERE schemaname = 'public' 
   ORDER BY tablename;
   ```

2. For each table, check if policy has:
   - ❌ `USING (auth.uid() IS NOT NULL)` ← WEAK (fix!)
   - ✅ `USING (societe_id IN (SELECT ... FROM user_societes))` ← GOOD

3. Create spreadsheet: List of 39 tables × Current policy × Required fix

4. Document which tables are CRITICAL (financial data):
   - Priority 1: ecritures_comptables_v2, factures, bulletins_paie, employes
   - Priority 2: comptes_bancaires, releves_bancaires, documents
   - Priority 3: Everything else

**Deliverable:** Spreadsheet with RLS audit + prioritization

**Success Criteria:** ✅ All 39 tables assessed

---

**Task 1.3: Fix RLS Policies (Priority 1 Tables)**  
**Owner:** Database Architect  
**Effort:** 20 hours  
**Due:** Friday Week 1

**Steps for ecritures_comptables_v2:**
```sql
-- DROP old weak policy
DROP POLICY IF EXISTS tenant_isolation ON ecritures_comptables_v2;

-- CREATE new strong policy
CREATE POLICY tenant_isolation ON ecritures_comptables_v2
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes 
      WHERE user_id = auth.uid()
    )
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM user_societes 
      WHERE user_id = auth.uid()
    )
    OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'super_admin'))
  );
```

**Repeat for:** factures, bulletins_paie, employes, comptes_bancaires, releves_bancaires, documents

**Testing:**
```sql
-- Test as User A (Company A only)
SELECT * FROM ecritures_comptables_v2 
WHERE societe_id = 'company_b_id' AS user_a;
-- Must return 0 rows

-- Test as Admin (all data)
SELECT COUNT(*) FROM ecritures_comptables_v2 AS admin;
-- Must return all records
```

**Deliverable:** 7 migrations with RLS fixes for Priority 1 tables

**Success Criteria:**
- ✅ All Priority 1 RLS policies rewritten
- ✅ SQL tests pass (cross-tenant attempt → 0 rows)

---

### 🔴 CRITICAL: Encrypt Credentials

**Task 1.4: Encrypt MRA API Key + Payslip Password**  
**Owner:** Security Engineer  
**Effort:** 8 hours  
**Due:** Wednesday Week 2

**Current State:**
```sql
SELECT mra_api_key FROM societes;  -- ❌ Plain text!
SELECT payslip_password FROM employes;  -- ❌ Plain text!
```

**Steps:**
1. Create migration: `331_encrypt_credentials.sql`

2. For MRA API key:
   ```sql
   -- Add encrypted column
   ALTER TABLE societes ADD COLUMN mra_api_key_encrypted TEXT;
   
   -- Migrate data
   UPDATE societes 
   SET mra_api_key_encrypted = pgp_sym_encrypt(mra_api_key, 'CRYPT_KEY')
   WHERE mra_api_key IS NOT NULL;
   
   -- Drop old column
   ALTER TABLE societes DROP COLUMN mra_api_key;
   
   -- Rename new column
   ALTER TABLE societes RENAME COLUMN mra_api_key_encrypted TO mra_api_key;
   ```

3. For payslip password:
   ```sql
   -- Add bcrypt column
   ALTER TABLE employes ADD COLUMN payslip_password_hash TEXT;
   
   -- Migrate: hash existing passwords (via Node.js migration script)
   -- DELETE old column
   ALTER TABLE employes DROP COLUMN payslip_password;
   ```

4. Update API code:
   ```typescript
   // Get credential from Supabase RLS
   const encrypted = await supabase
     .from('societes')
     .select('mra_api_key')
     .eq('id', societe_id);
   
   // Decrypt in memory only (never log)
   const decrypted = decrypt(encrypted.mra_api_key, process.env.CRYPT_KEY);
   ```

**Deliverable:** Migration + code updates

**Success Criteria:**
- ✅ All MRA keys encrypted
- ✅ All passwords hashed (bcrypt)
- ✅ No plaintext secrets in database or logs

---

### 🔴 CRITICAL: Audit Logging System

**Task 1.5: Create audit_trail Table + Triggers**  
**Owner:** Tech Lead  
**Effort:** 20 hours  
**Due:** Friday Week 2

**Steps:**
1. Create table:
   ```sql
   CREATE TABLE audit_trail (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     table_name TEXT NOT NULL,
     row_id UUID NOT NULL,
     operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
     field_name TEXT,
     old_value TEXT,
     new_value TEXT,
     user_id UUID REFERENCES profiles(id),
     reason TEXT,  -- Why was this changed?
     created_at TIMESTAMPTZ DEFAULT NOW(),
     INDEX (table_name, row_id, created_at)
   );
   
   -- Immutability: nobody can delete audit logs
   ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
   CREATE POLICY immutable ON audit_trail USING (false) WITH CHECK (false);
   CREATE POLICY insert_only ON audit_trail FOR INSERT WITH CHECK (true);
   CREATE POLICY select_own ON audit_trail FOR SELECT USING (
     auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'super_admin'))
   );
   ```

2. Create trigger for critical tables:
   ```sql
   CREATE OR REPLACE FUNCTION tr_audit_ecritures() 
   RETURNS TRIGGER AS $$
   BEGIN
     IF TG_OP = 'INSERT' THEN
       INSERT INTO audit_trail 
       (table_name, row_id, operation, field_name, old_value, new_value, user_id)
       SELECT 'ecritures_comptables_v2', NEW.id, 'INSERT', col, 
              NULL, NEW.*::text, auth.uid()
       FROM (SELECT * FROM json_object_keys(row_to_json(NEW))) AS t(col);
       RETURN NEW;
     ELSIF TG_OP = 'UPDATE' THEN
       FOR col IN SELECT * FROM json_object_keys(row_to_json(NEW)) LOOP
         IF (OLD.* ->> col) != (NEW.* ->> col) THEN
           INSERT INTO audit_trail
           (table_name, row_id, operation, field_name, old_value, new_value, user_id)
           VALUES ('ecritures_comptables_v2', NEW.id, 'UPDATE', col, 
                   OLD.* ->> col, NEW.* ->> col, auth.uid());
         END IF;
       END LOOP;
       RETURN NEW;
     END IF;
     RETURN NULL;
   END;
   $$ LANGUAGE plpgsql;
   
   CREATE TRIGGER audit_ecritures AFTER INSERT OR UPDATE ON ecritures_comptables_v2
   FOR EACH ROW EXECUTE tr_audit_ecritures();
   ```

3. Repeat triggers for: factures, bulletins_paie, releves_bancaires

**Deliverable:** audit_trail table + triggers

**Success Criteria:**
- ✅ All GL changes logged with who/when/before/after
- ✅ Audit logs immutable (nobody can delete)
- ✅ Test: Make GL change → verify audit_trail entry

---

### 🔴 CRITICAL: SOD (Segregation of Duties) Matrix

**Task 1.6: Create SOD Matrix + Enforcement**  
**Owner:** Finance Controller + Tech Lead  
**Effort:** 12 hours  
**Due:** Thursday Week 2

**Steps:**
1. Create SOD Matrix (spreadsheet):

| Transaction Type | Create | Approve | Modify | Delete |
|---|---|---|---|---|
| **Invoice &lt; 5K** | client_admin | - | comptable | - |
| **Invoice 5K-10K** | client_admin | client_admin ≠ creator | comptable | direction |
| **Invoice &gt; 10K** | client_admin | direction | comptable | direction |
| **GL Entry (auto)** | system | comptable ≠ creator | direction | - |
| **GL Entry (manual)** | comptable | direction ≠ creator | - | - |
| **Payroll** | rh | direction | direction | - |
| **Bank Rec** | ops | comptable | ops | - |

2. Implement in database:
   ```sql
   ALTER TABLE ecritures_comptables_v2 ADD COLUMN created_by_id UUID;
   ALTER TABLE ecritures_comptables_v2 ADD COLUMN approved_by_id UUID;
   ALTER TABLE ecritures_comptables_v2 ADD COLUMN approved_at TIMESTAMPTZ;
   
   -- Enforce SOD
   CREATE TRIGGER tr_sod_check BEFORE UPDATE ON ecritures_comptables_v2
   FOR EACH ROW
   WHEN (NEW.approved_by_id IS NOT NULL)
   EXECUTE FUNCTION check_segregation_of_duties();
   
   CREATE FUNCTION check_segregation_of_duties() RETURNS TRIGGER AS $$
   BEGIN
     IF NEW.created_by_id = NEW.approved_by_id THEN
       RAISE EXCEPTION 'SOD Violation: Creator cannot approve own entry';
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```

3. Test:
   ```sql
   -- User A creates entry
   INSERT INTO ecritures_comptables_v2 (..., created_by_id = user_a_id, ...)
   
   -- User A tries to approve (must fail)
   UPDATE ecritures_comptables_v2 SET approved_by_id = user_a_id WHERE id = ...
   -- Error: "SOD Violation: Creator cannot approve own entry"
   ```

**Deliverable:** SOD matrix + database enforcement

**Success Criteria:**
- ✅ SOD matrix documented
- ✅ DB enforces creator ≠ approver
- ✅ Test passes

---

## PHASE 2: SEMAINES 3-4 - EVIDENCE GATHERING & DATA QUALITY

### 📊 Task 2.1: Extract Historical Accounting Data

**Owner:** Finance Controller  
**Effort:** 16 hours  
**Due:** Friday Week 3

**Deliverables:**

1. **General Ledger (12 months)**
   ```sql
   SELECT 
     date_trunc('month', date_ecriture) AS month,
     numero_compte AS account,
     SUM(CASE WHEN debit_mur > 0 THEN debit_mur ELSE 0 END) AS debit,
     SUM(CASE WHEN credit_mur > 0 THEN credit_mur ELSE 0 END) AS credit,
     SUM(debit_mur - credit_mur) AS balance
   FROM ecritures_comptables_v2
   GROUP BY month, numero_compte
   ORDER BY month, numero_compte;
   ```
   **Export:** CSV + PDF report (signed by CFO)

2. **Trial Balance (12 month-ends)**
   ```sql
   SELECT 
     date_trunc('month', date_ecriture)::date + interval '1 month' - interval '1 day' AS month_end,
     numero_compte,
     ROUND(SUM(debit_mur)::numeric, 2) AS debit,
     ROUND(SUM(credit_mur)::numeric, 2) AS credit,
     ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS balance
   FROM ecritures_comptables_v2
   WHERE date_ecriture <= month_end
   GROUP BY month_end, numero_compte
   ORDER BY month_end, numero_compte;
   ```
   **Export:** CSV + PDF (signed)

3. **Bank Reconciliation (12 months)**
   For each month/account:
   - GL balance (from GL)
   - Bank statement balance (from releves_bancaires)
   - Unmatched items (status ≠ 'lettre')
   - Variance explanation
   - Sign-off line
   
   **Format:** Monthly PDF with auditor workpaper template

4. **Invoice Register**
   ```sql
   SELECT 
     date_trunc('month', date_facture) AS month,
     numero_facture,
     date_facture,
     tiers,
     montant_mur,
     statut,
     date_paye,
     ref_ecriture_gl
   FROM factures
   WHERE societe_id IN ('dds_id', 'occ_id')
   ORDER BY month, numero_facture;
   ```

**Success Criteria:** ✅ All 12 months extracted, verified, CFO signed

---

### 💰 Task 2.2: Payroll Data Extraction + MRA Compliance Check

**Owner:** HR Manager + Finance Controller  
**Effort:** 20 hours  
**Due:** Friday Week 4

**Deliverables:**

1. **24 Months Bulletins Paie**
   ```sql
   SELECT 
     periode,
     employe_id,
     salaire_base,
     (csg_salarie + csg_patronal) AS total_csg,
     nsf_salarie,
     paye,
     salaire_brut,
     salaire_net
   FROM bulletins_paie
   ORDER BY periode, employe_id;
   ```

2. **MRA Compliance Report**
   For each employee/period:
   - Gross salary
   - CSG calculation (must = salary × 3%)
   - NSF calculation (must = 1 MUR)
   - PAYE calculation (per 2025 MRA barème)
   - Compare to system
   
   **Sample:** Hand-verify 10 employees × 6 months
   
   **Formula Check:**
   ```
   CSG = Salaire_Brut × 3%
   NSF = 1 MUR (fixed)
   PAYE = Apply bracket (0-650K=0%, 650K-700K=10%, >700K=15%)
   Net = Gross - CSG - NSF - PAYE
   ```

3. **IT Form 3 Summary** (if filed)
   - Company ID
   - Gross salary accrued
   - Tax withheld
   - Dates filed/submitted
   
4. **EDF (Employment Declaration Forms)**
   - Count of employees declared to MRA
   - Match against active employes table
   - Verify dates/amounts

**Success Criteria:**
- ✅ 24 months payroll extracted
- ✅ Hand-verify 10 samples = 100% accuracy
- ✅ MRA compliance confirmed (no variance > 1 MUR)

---

### 🏦 Task 2.3: Bank Reconciliation Quality Check

**Owner:** Finance Ops  
**Effort:** 12 hours  
**Due:** Wednesday Week 4

**Steps:**

1. For each account (512100 MUR, 512101 EUR):
   ```sql
   SELECT 
     date_trunc('month', date_releve)::date AS month,
     COUNT(DISTINCT tx_id) AS tx_count,
     SUM(CASE WHEN statut = 'lettre' THEN 1 ELSE 0 END) AS matched,
     SUM(CASE WHEN statut != 'lettre' THEN 1 ELSE 0 END) AS unmatched,
     ROUND((SUM(CASE WHEN statut = 'lettre' THEN 1 ELSE 0 END)::numeric / COUNT(*)), 4) AS match_rate
   FROM releves_bancaires
   GROUP BY month
   ORDER BY month;
   ```

2. Identify unmatched items:
   ```sql
   SELECT 
     date_releve,
     montant,
     description,
     (NOW() - date_releve)::integer AS days_unmatched,
     CASE WHEN (NOW() - date_releve) > 30 THEN 'OLD' ELSE 'OK' END AS flag
   FROM releves_bancaires
   WHERE statut != 'lettre'
   ORDER BY date_releve;
   ```

3. For items unmatched > 30 days:
   - Investigate reason (timing difference? orphaned tx?)
   - Resolve or document exception

**Success Criteria:**
- ✅ 100% of daily items within 30 days matched
- ✅ OR documented exception with reason

---

## PHASE 3: SEMAINES 5-6 - DOCUMENTATION & CONTROLS

### 📋 Task 3.1: Financial Control Procedures Manual

**Owner:** Process Consultant (external) + Finance Controller  
**Effort:** 40 hours  
**Due:** Friday Week 6

**Contents (30 pages):**

1. **GL Entry Generation** (5 pages)
   - Diagram: Invoice → Facture → Trigger → Ecriture
   - Approval workflow
   - Journal code assignments
   - Example GL entries (10 samples)

2. **Bank Reconciliation** (5 pages)
   - Monthly process workflow
   - Steps: Import → OCR → Classify → Match → Review → Sign-off
   - Reconciliation template
   - Exception handling

3. **Payroll Processing** (5 pages)
   - Calculation: Salary → Deductions → Gross/Net
   - MRA compliance verification
   - Monthly GL entry posting
   - Approval workflow

4. **Multi-Currency Handling** (3 pages)
   - FX rate procedures (frozen at transaction date)
   - Monthly revaluation process
   - Account 666/766 (FX gain/loss)

5. **Inter-Company Transactions** (3 pages)
   - DDS ↔ OCC virement process
   - 4411/4412 account reconciliation
   - Settling procedures

6. **Segregation of Duties** (3 pages)
   - SOD matrix
   - Role definitions
   - Approval thresholds

7. **Exception Handling** (2 pages)
   - Unmatched bank items > 30 days
   - Unbalanced GL entries
   - Data quality issues

**Deliverable:** Procedures manual (PDF, signed by CFO)

**Success Criteria:** ✅ Manual approved by Finance Controller + CFO

---

### 📊 Task 3.2: Implement Audit Logging API

**Owner:** Tech Lead  
**Effort:** 16 hours  
**Due:** Wednesday Week 6

**Steps:**

1. Create `/api/audit/trail` endpoint:
   ```typescript
   // GET /api/audit/trail?table=ecritures&row_id=xxx&limit=100
   const query = supabase
     .from('audit_trail')
     .select('*')
     .eq('table_name', req.query.table)
     .eq('row_id', req.query.row_id)
     .order('created_at', { ascending: false })
     .limit(req.query.limit || 100);
   
   return res.json(await query);
   ```

2. Create `/app/admin/audit-trail/page.tsx` UI:
   - Searchable audit log
   - Filter by: table, row_id, user, date range, operation
   - Display: timestamp, user, field, old_value, new_value, reason
   - Export to CSV

3. Test:
   - Make GL change
   - Query `/api/audit/trail`
   - Verify full history (who/when/before/after)

**Deliverable:** API endpoint + UI component

**Success Criteria:**
- ✅ Auditors can trace any GL entry change
- ✅ Full audit history visible in UI

---

### 🔐 Task 3.3: Data Classification & Encryption Plan

**Owner:** Security Engineer  
**Effort:** 12 hours  
**Due:** Friday Week 6

**Deliverable:**

1. **Data Classification Matrix:**

| Data Type | Classification | Encryption | Access |
|---|---|---|---|
| Salaries | **PII** | AES-256 | HR + Finance Director only |
| Tax Numbers | **PII** | AES-256 | Finance + Compliance |
| IBAN/Bank Accounts | **PII** | AES-256 | Finance Director only |
| GL Entries | **Confidential** | - | Comptable + Director |
| Invoices | **Confidential** | - | Comptable + Client Admin |
| Bank Statements | **Confidential** | - | Finance only |
| Documents | **Confidential** | - | Document owner + Admin |

2. **Encryption Roadmap:**
   - Week 6: Plan finalized
   - Week 7: Implement IBAN encryption
   - Week 8: Implement salary encryption
   - Week 9: Implement tax number encryption
   - Week 10: Validate + test

**Success Criteria:** ✅ Classification + encryption plan approved

---

## PHASE 4: SEMAINES 7-8 - TESTING & VALIDATION

### ✅ Task 4.1: GL Close Walkthrough

**Owner:** Finance Controller  
**Effort:** 8 hours  
**Due:** Tuesday Week 7

**Steps:**

1. **Prepare GL close for month X:**
   - Run GL close procedures
   - Verify balance = 0.00 MUR
   - Verify all journals posted
   - Run reconciliation (GL vs. subledgers)

2. **Walkthrough demonstration:**
   - Show auditors the step-by-step process
   - Show evidence (GL export, reconciliation report, approvals)
   - Answer questions

3. **Document walkthrough:**
   - Sign-off sheet
   - Date / Preparer / Reviewer
   - Evidence file reference

**Success Criteria:** ✅ Walkthrough complete + signed

---

### 🏦 Task 4.2: Bank Reconciliation Walkthrough

**Owner:** Finance Ops  
**Effort:** 8 hours  
**Due:** Wednesday Week 7

**Steps:**

1. **Prepare monthly reconciliation:**
   - GL balance (account 512100, 512101)
   - Bank statement balance
   - Identify unmatched items
   - Variance analysis

2. **Walkthrough:**
   - Show reconciliation process
   - Show supporting documents (bank statement, matching rules)
   - Show resolution of items > 30 days unmatched

3. **Document sign-off**

**Success Criteria:** ✅ Monthly reconciliation demonstrated + approved

---

### 📄 Task 4.3: Invoice-to-GL Traceability Test

**Owner:** Finance Controller  
**Effort:** 12 hours  
**Due:** Thursday Week 7

**Steps:**

1. **Select 50 sample invoices** (mix of customer + vendor, various amounts)

2. **For each invoice, trace:**
   - Facture ID
   - GL entries created (should be 3 lines):
     - Debit: 411 (AR) or Credit: 401 (AP)
     - Credit: 706 (Revenue) or Debit: 607 (Expense)
     - Credit: 4457 (TVA) or Debit: 4456 (TVA deductible)
   - Verify amounts match invoice
   - Verify dates match

3. **Create workpaper:**
   - Table: Invoice # | Amount | GL Entries | Status
   - 100% should match

**Success Criteria:** ✅ 50/50 invoices traced successfully

---

### 💰 Task 4.4: Payroll Calculation Verification

**Owner:** HR Manager + Finance  
**Effort:** 16 hours  
**Due:** Friday Week 8

**Steps:**

1. **Select 20 employees × 6 months** (120 sample payslips)

2. **For each payslip, hand-verify:**
   - Gross = Salaire_base + allowances
   - CSG = Gross × 3%
   - NSF = 1 MUR
   - PAYE = Apply barème
   - Net = Gross - CSG - NSF - PAYE

3. **Create workpaper:**
   - Excel: Hand calculations vs. system
   - Variance must be < 1 MUR
   - If variance: investigate reason

4. **MRA barème check:**
   - Verify 2025 rates coded correctly
   - Test edge cases (salary exactly 650K, 700K boundaries)

**Success Criteria:**
- ✅ 120 samples verified
- ✅ 100% accuracy (variance < 1 MUR)

---

## PHASE 5: SEMAINES 9-10 - PRE-AUDIT PREPARATION

### 🔍 Task 5.1: Data Integrity Verification

**Owner:** Tech Lead + Database Architect  
**Effort:** 12 hours  
**Due:** Monday Week 9

**Checks:**

1. **GL Balance Check**
   ```sql
   SELECT 
     ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
     ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
     ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS balance
   FROM ecritures_comptables_v2;
   -- Must return: 0.00 balance
   ```
   **Pass Criteria:** ✅ Balance = 0.00 MUR

2. **Orphaned Records Check**
   ```sql
   -- GL entries with invalid accounts
   SELECT * FROM ecritures_comptables_v2
   WHERE numero_compte NOT IN (
     SELECT numero FROM plan_comptable_mauricien
   );
   -- Must return: 0 rows
   
   -- GL entries with invalid factures
   SELECT * FROM ecritures_comptables_v2
   WHERE facture_id IS NOT NULL
   AND facture_id NOT IN (SELECT id FROM factures);
   -- Must return: 0 rows
   ```
   **Pass Criteria:** ✅ 0 orphaned records

3. **RLS Compliance Check**
   - Test 20 users × 4 companies
   - Each user should see ONLY their company's data
   - Admin should see all
   
   **Pass Criteria:** ✅ 80/80 tests pass (100%)

4. **Audit Trail Completeness**
   - Sample 50 recent GL changes
   - Verify audit_trail entry exists for each
   
   **Pass Criteria:** ✅ 50/50 changes logged

**Success Criteria:** ✅ All 4 checks pass

---

### 🔢 Task 5.2: Intercompany Account Reconciliation

**Owner:** Finance Controller  
**Effort:** 8 hours  
**Due:** Tuesday Week 9

**Steps:**

1. **Reconcile 4411 & 4412:**
   ```sql
   -- DDS side
   SELECT 
     'DDS' AS entity,
     numero_compte,
     ROUND(SUM(debit_mur)::numeric, 2) AS debit,
     ROUND(SUM(credit_mur)::numeric, 2) AS credit,
     ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS balance
   FROM ecritures_comptables_v2
   WHERE societe_id = 'dds_id'
   AND numero_compte IN ('4411', '4412')
   GROUP BY numero_compte;
   
   -- OCC side (similar)
   -- DDS 4412 balance should = OCC 4411 balance (opposite signs)
   ```

2. If imbalance:
   - Investigate reason
   - Document exception
   - Get sign-off

**Success Criteria:** ✅ Intercompany accounts balanced (or exception documented)

---

### 👥 Task 5.3: System Access Audit

**Owner:** IT Manager  
**Effort:** 8 hours  
**Due:** Wednesday Week 9

**Steps:**

1. **User Access Matrix:**
   - List all active users
   - For each: role, societe, access date
   - Verify no orphaned access

2. **Recent Access Audit:**
   ```sql
   SELECT 
     user_id,
     societe_id,
     role,
     last_login,
     (NOW() - last_login)::interval AS days_inactive
   FROM user_societes
   LEFT JOIN audit_logs ON ...
   WHERE days_inactive > 60
   -- Flag users inactive > 60 days
   ```

3. **Deactivate inactive users** (> 90 days)

**Success Criteria:** ✅ Access matrix clean + approved

---

### 📦 Task 5.4: Audit Workpapers Packaging

**Owner:** Finance Controller  
**Effort:** 16 hours  
**Due:** Friday Week 10

**Package Contents:**

```
AUDIT_WORKPAPERS/
├── 01_GL_EXPORTS/
│   ├── 01_GL_Jan.csv
│   ├── 01_TB_Jan.csv
│   └── ... (12 months)
├── 02_BANK_RECONCILIATION/
│   ├── 01_BankRec_Jan.pdf (signed)
│   ├── 02_BankRec_Feb.pdf
│   └── ... (12 months)
├── 03_INVOICES/
│   ├── Invoice_Register.csv
│   ├── Sample_50_Invoices_Traced.xlsx
│   └── GL_Reconciliation.pdf
├── 04_PAYROLL/
│   ├── Bulletins_Paie_24mo.csv
│   ├── Sample_20emp_6mo_Verification.xlsx
│   ├── IT_Form_3.pdf
│   └── EDF_Summary.pdf
├── 05_PROCEDURES/
│   ├── Financial_Control_Procedures.pdf (signed)
│   ├── SOD_Matrix.xlsx
│   └── System_Access_Matrix.xlsx
├── 06_AUDIT_LOGS/
│   ├── 50_Sample_GL_Changes_Trace.xlsx
│   └── RLS_Compliance_Test_Results.pdf
├── 07_DATA_QUALITY/
│   ├── GL_Balance_Check.pdf (Balance = 0.00 ✅)
│   ├── Orphaned_Records_Check.pdf (0 records ✅)
│   ├── Intercompany_Reconciliation.pdf
│   └── User_Access_Audit.pdf
└── 08_SIGN_OFFS/
    ├── GL_Close_Walkthrough_Signoff.pdf
    ├── Bank_Rec_Walkthrough_Signoff.pdf
    ├── Invoice_Traceability_Signoff.pdf
    ├── Payroll_Verification_Signoff.pdf
    └── Data_Integrity_Signoff.pdf
```

**Success Criteria:** ✅ All workpapers compiled + organized

---

## PHASE 6: SEMAINES 11-12 - AUDIT BIG 4 SUPPORT

### 🤝 Task 6.1: Audit Kickoff Meeting

**Owner:** Leadership  
**Effort:** 4 hours  
**Due:** Monday Week 11

**Attendees:**
- CFO + leadership
- CTO + tech team
- IT Manager
- Big 4 audit partner + team

**Agenda:**
1. System overview (30 min)
2. Workpapers walkthrough (60 min)
3. Access provision + schedule (30 min)
4. Questions & concerns (30 min)

**Deliverable:** Meeting notes + audit timeline

---

### 🔑 Task 6.2: System Access for Auditors

**Owner:** IT Manager  
**Effort:** 4 hours  
**Due:** Monday Week 11

**Steps:**
1. Create read-only audit user in Supabase
2. Grant access to all tables (no data modification)
3. Provide VPN/bastion access if needed
4. Document access credentials (secure delivery)

**Success Criteria:** ✅ Auditors can query database

---

### 📞 Task 6.3: Daily Audit Support

**Owner:** Tech Lead + Finance Controller  
**Effort:** 40 hours (full 2 weeks)  
**Schedule:** Daily calls 10:00 AM

**Support Activities:**
- Answer auditor questions
- Provide ad-hoc data extracts
- Clarify procedures
- Resolve findings

---

### ✅ Task 6.4: Audit Completion & Sign-Off

**Owner:** CFO  
**Effort:** 8 hours  
**Due:** Friday Week 12

**Steps:**
1. Receive audit findings
2. Review audit certificate
3. Approve/sign financial statements
4. Address any open items

**Success Criteria:** ✅ Audit completed + certificate signed

---

## 🎯 SUCCESS METRICS - OUTIL PARFAIT

### By End of Week 16, Tool Must Be:

#### ✅ **SÉCURISÉ**
- [ ] 0 CRITICAL vulnerabilities remaining
- [ ] All RLS policies enforced at DB level
- [ ] All credentials encrypted
- [ ] 100% audit trail coverage
- [ ] SOD enforced in database
- [ ] 2FA enabled for finance roles

#### ✅ **COMPTABLEMENT JUSTE**
- [ ] GL balance = 0.00 MUR (verified monthly)
- [ ] 100% of invoices reconcile to GL
- [ ] 100% of bank statements matched
- [ ] 100% of payroll verified (< 1 MUR variance)
- [ ] MRA compliance 100% (all declarations filed, correct amounts)
- [ ] Intercompany accounts balanced

#### ✅ **AUDITABLE**
- [ ] All 12 months of GL exported + signed
- [ ] All procedures documented (30-page manual)
- [ ] All controls tested + evidence collected
- [ ] All exceptions documented + resolved
- [ ] Workpapers organized per Big 4 standard
- [ ] Data integrity verified (0 errors)

#### ✅ **CONFORME**
- [ ] IFRS accounting rules implemented + tested
- [ ] Mauritian tax compliance verified
- [ ] GDPR-ready (encryption, audit logs, deletion policies)
- [ ] SOC 2 baseline controls present
- [ ] Change management process documented

#### ✅ **UNIQUE & PROFESSIONNEL**
- [ ] Enterprise architecture documented
- [ ] 80+ API tests for critical paths
- [ ] 0 console.log in production
- [ ] Structured logging + monitoring
- [ ] OpenAPI spec generated
- [ ] Deployment guide documented

#### ✅ **BIG 4 READY**
- [ ] Audit Readiness Score ≥ 85/100
- [ ] All CRITICAL findings resolved
- [ ] All HIGH findings remediated
- [ ] Workpapers complete
- [ ] Zero open audit issues

---

## 📅 TIMELINE RÉSUMÉ

```
WEEK 1-2   │ Fix 5 CRITICAL vulnerabilities + RLS + encryption
WEEK 3-4   │ Gather historical data + verify quality
WEEK 5-6   │ Document procedures + implement audit logs
WEEK 7-8   │ Walkthroughs + testing + validation
WEEK 9-10  │ Pre-audit checks + workpapers
WEEK 11-12 │ Big 4 audit support + sign-off

GOAL: "OUTIL PARFAIT" ✅
- Sécurisé 🔒
- Comptablement juste 📊
- Auditable 📋
- Conforme ✓
- Unique & Professionnel 🎯
```

---

## 💼 BUDGET RÉSUMÉ

| Resource | Hours/Month | Duration (Months) | Cost |
|---|---|---|---|
| Tech Lead (FTE) | 160h | 4 | $48,000 |
| Security Engineer | 80h | 4 | $16,000 |
| QA Engineer | 120h | 4 | $12,000 |
| Finance Controller | 120h | 4 | $12,000 |
| Database Architect | 40h | 4 | $8,000 |
| External Consulting (process/security) | - | - | $8,000 |
| Tools (Datadog, Sentry) | - | 4mo | $3,000 |
| **TOTAL** | | | **$107,000** |

---

## ✍️ APPROVALS

**CFO:** _________________ Date: _______

**CTO:** _________________ Date: _______

**IT Manager:** _________________ Date: _______

---

## 📞 CONTACTS & ESCALATION

| Rôle | Nom | Email | Phone | Escalation |
|------|-----|-------|-------|-----------|
| **Project Owner** | Stéphane Bach | bach@dds.mu | +230 XXXX | CFO → Leadership |
| **Tech Lead** | [Name] | [Email] | [Phone] | CTO → Stéphane |
| **Finance Controller** | [Name] | [Email] | [Phone] | CFO → Stéphane |
| **Steering Committee** | All | - | - | Weekly Monday 10:00 |

---

**STATUS: READY TO LAUNCH 🚀**

**COMMENÇONS MAINTENANT**
