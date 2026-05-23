# RAPPORT COMPLET D'AUDIT BIG 4
## LEXORA - Plateforme Comptable SaaS pour Île Maurice

**Document Confidentiel**  
**Préparé pour:** DDS (Des Dunes Sarl) + OCC (Obesity Care Clinic)  
**Date:** 22 mai 2026  
**Audit Plannifié:** Semaine 11-12 (12 semaines de préparation)

---

## RÉSUMÉ EXÉCUTIF

### État Actuel
Lexora est une **plateforme comptable SaaS sophistiquée** pour Île Maurice avec 2+ ans de données transactionnelles couvrant comptabilité, paie, RH et conformité MRA. L'architecture technique est **solide** (Next.js + Supabase), mais les **contrôles de gouvernance et d'audit sont incomplets**.

### Big 4 Audit Readiness Score: **28/100** 🔴 NOT READY

| Domaine | Score | Statut |
|---------|-------|--------|
| **Sécurité des Données** | 35% | ⚠️ Vulnérabilités CRITICAL à fixer |
| **Authentification & Contrôles d'Accès** | 45% | ⚠️ RLS incomplète, pas de 2FA |
| **Conformité (GDPR/SOC2/ISO27001)** | 20% | 🔴 Non-conforme |
| **Infrastructure & Secrets** | 25% | ⚠️ Gestion basique |
| **Opérations & Audit Trail** | 15% | 🔴 Pas de change management |
| **Intégrité des Données Comptables** | 40% | ⚠️ Contrôles existants mais non appliqués |
| **SCORE GLOBAL** | **28%** | **🔴 AUDIT BLOCKING** |

### Actions Critiques Requises (P1)
1. 🔴 **4 routes API vulnérables** — Fuite de données multi-tenant
2. 🔴 **39 tables avec RLS "theater"** — Toute personne authentifiée = accès complet
3. 🔴 **Audit logging incomplet** — Impossible de tracer les modifications
4. 🔴 **Pas de ségrégation des tâches** — Un comptable peut créer ET approuver
5. 🔴 **Credentials stockées en clair** — Clés MRA API non chiffrées

### Timeline de Remédiation
- **Semaines 1-2**: Fixer vulnerabilités CRITICAL (P1)
- **Semaines 3-4**: Préparer données historiques
- **Semaines 5-6**: Documenter contrôles + audit logs
- **Semaines 7-8**: Tester & valider
- **Semaines 9-10**: Mock audit
- **Semaines 11-12**: Support audit Big 4

**Effort Estimé**: 16-20 semaines pour "Big 4 Ready"

---

## 1. FINDINGS CRITIQUES (P1 - AUDIT BLOCKING)

### 1.1 🔴 CRITICAL: 4 Routes API avec Fuite Multi-Tenant

**Problème**:
```typescript
// Actuellement: User de Société A peut accéder à Société B data

POST /api/client/actions          → Approuver factures de n'importe quelle societe
POST /api/client/echeances        → Appliquer délais aux comptes de n'importe qui
GET/POST/DELETE /api/client/investissements  → CRUD sur n'importe quelle societe
PATCH /api/client/factures        → Modifier factures d'autres sociétés
```

**Impact**: 🔴 CRITICAL — Données financières/légales exposées à d'autres utilisateurs

**Preuve Requise par Auditor**:
- Code review montrant `assertSocieteAccess()` implémenté
- Test unitaire: Cross-tenant attempt → HTTP 403
- Validation: Toutes routes `/api/client/*` testées

**Effort**: 8 heures  
**Deadline**: AVANT kickoff audit

---

### 1.2 🔴 CRITICAL: 39 Tables avec Politiques RLS "Theater"

**Problème**:
```sql
-- Actuellement: N'importe quel utilisateur authentifié a accès complet
CREATE POLICY bad_rls ON factures
USING (auth.uid() IS NOT NULL)  -- ❌ N'importe qui peut lire TOUTES les factures
```

**Tables Affectées**: factures, employes, bulletins_paie, documents, factures_contacts, factures_catalogue, + 33 autres

**Impact**: 🔴 CRITICAL — Isolation multi-tenant cassée

**Preuve Requise**:
- Audit RLS: 39 tables corrigées avec filters tenant-scoped
- Test SQL: `SELECT * FROM ecritures WHERE societe_id='AUTRE' AS user_other_societe` → 0 rows

**Effort**: 12 heures  
**Deadline**: -3 semaines avant audit

---

### 1.3 🔴 CRITICAL: Audit Logging Incomplet

**Problème**:
- ❌ Aucun log des opérations de LECTURE (view, export)
- ❌ Aucun log des événements d'authentification
- ❌ Impossibilité de tracer: "Qui a modifié cette écriture comptable?"
- ❌ Audit logs peuvent être supprimés par admin (pas d'immuabilité)

**Impact**: 🔴 CRITICAL — Auditors ne peuvent pas tester les contrôles

**Preuve Requise**:
- Table `audit_trail`: traceback complet pour 50 GL entries
- Audit log immutable (trigger protection)
- Query API: `/api/audit/trail?table=ecritures&row_id=xxx`

**Effort**: 20 heures  
**Deadline**: -3 semaines avant audit

---

### 1.4 🔴 CRITICAL: Pas de Ségrégation des Tâches

**Problème**:
```
Actuellement: Un comptable peut:
✓ Créer une facture
✓ Créer l'écriture comptable
✓ Approuver le paiement
✓ Marquer comme "payée"
```

**Audit Expectation**:
- ❌ Créateur ≠ Approbateur (pour transactions > 10,000 MUR)
- ❌ Aucun enforcement au niveau DB

**Impact**: 🔴 CRITICAL — Fraude possible (fictitious invoices)

**Preuve Requise**:
- SOD Matrix: Rôle × Transaction × Permissions
- Audit log: 100% des transactions ont `created_by ≠ approved_by`

**Effort**: 12 heures  
**Deadline**: -4 semaines avant audit

---

### 1.5 🔴 CRITICAL: Credentials Stockées en Clair

**Problème**:
```sql
-- Actuellement: Clés API stockées en clair
SELECT mra_api_key FROM societes  -- ❌ Texte brut!
SELECT payslip_password FROM employes  -- ❌ Texte brut!
```

**Impact**: 🔴 CRITICAL — Si DB compromis, accès MRA immédiat

**Preuve Requise**:
- `mra_api_key` migré vers Supabase Vault
- `payslip_password` hashé avec bcrypt
- Audit: Aucune clé en clair dans base

**Effort**: 8 heures  
**Deadline**: Immédiat

---

## 2. FINDINGS ÉLEVÉS (P2 - AUDIT DELAY)

### 2.1 🟠 HIGH: Dépendances avec Vulnerabilités CVE

**Trouvé**:
- 4 HIGH severity CVEs (Next.js, lodash, Nodemailer, xlsx)
- 2 sans fix disponible (xlsx: ReDoS + prototype pollution)
- 14 MODERATE vulnerabilities

**Impact**: 🟠 HIGH — Code injection possible

**Effort**: 16 heures (upgrade + testing)

---

### 2.2 🟠 HIGH: Pas de 2FA

**Impact**: 🟠 HIGH — Compromis de compte finance = accès complet

**Preuve Requise**:
- 2FA enforced pour roles: admin, client_admin, comptable

**Effort**: 8 heures

---

### 2.3 🟠 HIGH: Pas de Change Management

**Problème**:
- ❌ v0 auto-commit → auto-deploy (pas de code review)
- ❌ Migrations appliquées sans approval workflow
- ❌ Pas de rollback documented

**Impact**: 🟠 HIGH — Breaking changes peuvent déployer directement

**Effort**: 16 heures

---

### 2.4 🟠 HIGH: Logs non Centralisés

**Problème**:
- ❌ `console.log` non-structuré
- ❌ PII visible en clair (noms, comptes bancaires)
- ❌ Aucun SIEM

**Impact**: 🟠 HIGH — Breach detection retardée

**Effort**: 16 heures (structured logging + Datadog)

---

## 3. AUDIT COMPTABLE - VÉRIFICATIONS REQUISES

### 3.1 Double-Entry Integrity

**À Tester**: Tous les GL entries ont debit = credit

**État Actuel**: 
- ✅ Structure existe (colonnes debit_mur/credit_mur)
- ❌ Pas de CHECK constraint au niveau DB
- ⚠️ Entrées unbalanced possibles

**Preuve Requise**:
```sql
-- Must return 0 imbalanced accounts
SELECT account, SUM(debit) - SUM(credit) 
FROM ecritures_comptables_v2 
GROUP BY account 
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
```

---

### 3.2 Bank Reconciliation

**État Actuel**: ⚠️ Auto-matching + manual lettrage, pas de process formalisé

**Preuve Requise**:
- Monthly reconciliation reports (12 mois)
- 0 unmatched transactions > 30 days
- Bank balance = GL balance (per account)

---

### 3.3 Invoice-to-GL Traceability

**État Actuel**: ⚠️ Factures liées à GL mais pas formalisé

**Preuve Requise**:
- Sample 50 invoices
- Trace à GL entries (411/706/4457)
- Amounts match

---

### 3.4 Payroll Accuracy

**État Actuel**: ⚠️ Formules codées, pas de calculation audit trail

**Preuve Requise**:
- Sample 20 employees × 6 mois
- Hand-verify calculations
- CSG/NSF/PAYE per MRA barème

---

### 3.5 MRA Compliance

**État Actuel**: 🔴 Déclarations non trackées

**Preuve Requise**:
- IT Form 3 filed (if applicable)
- EDF (Employee Declarations) submitted
- PAYE withheld = amounts declared to MRA

---

## 4. ROADMAP DE REMÉDIATION (12 SEMAINES)

### Semaines 1-2: P1 CRITICAL FIXES

| Task | Owner | Effort | Deadline |
|------|-------|--------|----------|
| Fix 4 API cross-tenant routes | Tech | 8h | Week 1 |
| Create SOD matrix + enforcement | Finance + Tech | 12h | Week 1-2 |
| Implement audit_trail table + triggers | Tech | 20h | Week 2 |
| Fix RLS policies (39 tables) | Tech/DB | 12h | Week 2 |
| Encrypt mra_api_key + payslip_password | Tech | 8h | Week 1 |

**Deliverable**: ✅ Zero CRITICAL vulnerabilities

---

### Semaines 3-4: EVIDENCE GATHERING

| Task | Owner |
|------|-------|
| Extract 12 months GL + Trial Balance | Finance |
| Bank reconciliations (monthly) | Finance ops |
| Invoice register (all 12 months) | Finance |
| Payroll bulletins + MRA declarations | HR |
| Data quality baseline | Tech/Ops |

**Deliverable**: ✅ Toutes données historiques vérifiées

---

### Semaines 5-6: DOCUMENTATION

| Task | Owner |
|------|-------|
| Financial control procedures (30 pages) | Process consultant |
| Audit log viewer (`/api/audit/trail`) | Tech |
| Monthly reports setup (cron jobs) | Tech |
| Data classification + encryption plan | Tech/Security |

**Deliverable**: ✅ Toute documentation prête pour auditors

---

### Semaines 7-8: TESTING & VALIDATION

| Task | Owner |
|------|-------|
| GL close walkthrough | Finance |
| Bank reconciliation walkthrough | Finance ops |
| Invoice-to-GL traceability test | Finance |
| Payroll calculation verification | HR |

**Deliverable**: ✅ Controls function as designed

---

### Semaines 9-10: PRE-AUDIT

| Task | Owner |
|------|-------|
| Data integrity check (GL balance) | Tech |
| Intercompany reconciliation (4411/4412) | Finance |
| System access audit | IT |
| Workpapers packaging | Finance |

**Deliverable**: ✅ Mock audit clean

---

### Semaines 11-12: AUDIT SUPPORT

| Activity | Owner |
|----------|-------|
| Audit kickoff meeting | Leadership + Tech |
| System access provision | IT |
| Daily progress calls | Finance + Tech |
| Ad-hoc query support | Tech |

**Deliverable**: ✅ Audit completed

---

## 5. SECURITY - QUICK FIXES

### 🔴 IMMEDIATE (This Week)
1. Encrypt `mra_api_key` (move to Supabase Vault)
2. Move 4 vulnerable API routes to assertSocieteAccess check
3. Upgrade Next.js 16.2.6+, Nodemailer 8.0.7+

### 🟠 URGENT (Week 1-2)
4. Fix RLS on 39 tables
5. Implement audit_trail table + triggers
6. Add SOD enforcement in DB

### 🟡 IMPORTANT (Week 3-4)
7. Upgrade remaining dependencies
8. Implement 2FA for admin/comptable roles
9. Setup structured logging + Datadog

---

## 6. COMPLIANCE CHECKLIST

### ✅ À Préparer Pour Auditors

- [ ] **System Overview** — Architecture diagram + database schema
- [ ] **User Access Matrix** — Role × Table × Permission
- [ ] **General Ledger** — 12 months monthly exports (GL + TB)
- [ ] **Bank Reconciliation** — Monthly reconciliations (12 months)
- [ ] **Invoice Register** — All invoices, status, GL posting
- [ ] **Payroll Summary** — 24 months bulletins + MRA declarations
- [ ] **MRA Compliance** — IT Form 3, EDF, PAYE records
- [ ] **Audit Trail** — Sample of GL changes with who/when/why
- [ ] **Related Party Transactions** — Inter-company summary
- [ ] **Change Log** — Significant system changes during period
- [ ] **Control Documentation** — Procedures for each control
- [ ] **Data Quality Report** — Completeness %, accuracy %, exceptions

---

## 7. BUDGET & TIMELINE

### Ressources Requises
- **Tech Lead** — 240 heures (16 semaines)
- **Finance Controller** — 160 heures
- **Database Architect** — 40 heures
- **Process Consultant** — 40 heures (documentation)
- **Security Engineer** — 80 heures

### Coût Estimé
- **Interne** — 560 heures × $150/h = $84,000
- **Consulting** — Process (40h) + Security (80h) = $18,000
- **Tools** — Datadog, Sentry, etc. = $5,000
- **Total** — ~$107,000

---

## 8. CRITICAL SUCCESS FACTORS

### ✅ Green Light Criteria

| Domaine | Critère |
|---------|---------|
| **Sécurité** | 0 cross-tenant vulns; RLS enforced DB-level |
| **Audit Trail** | 100% GL changes logged; auditor-queryable |
| **Data** | GL balanced; invoices reconcile; completeness 100% |
| **Conformité** | MRA filings complete + on-time; no penalties |
| **Ségrégation** | Created ≠ Approved on 100% of samples |
| **Documentation** | Procedures, matrix, evidence compiled |
| **Readiness** | Big 4 score ≥ 85% |

---

## 9. CONTACTS & ESCALATION

| Rôle | Nom | Email | Phone |
|------|-----|-------|-------|
| **CFO / Finance Controller** | [Name] | [Email] | [Phone] |
| **CTO / Tech Lead** | [Name] | [Email] | [Phone] |
| **IT Manager** | [Name] | [Email] | [Phone] |
| **Compliance Officer** | [Name] | [Email] | [Phone] |

---

## 10. PROCHAINES ÉTAPES

### Immédiatement (Cette Semaine)
1. ✅ Approuver ce rapport
2. ✅ Assigner ownership P1 tasks
3. ✅ Calendrier kickoff réunion
4. ✅ Allocate resources (tech, finance)

### Semaine 1
1. Start P1 fixes (cross-tenant API routes)
2. Create SOD matrix
3. Encrypt credentials
4. Schedule weekly steering committee

### Semaine 2+
1. Implement audit logging
2. Fix RLS policies
3. Begin evidence gathering

---

**Document Approuvé Par**:

CFO: _________________________ Date: _________

CTO: _________________________ Date: _________

---

**CONFIDENTIAL — FOR INTERNAL USE ONLY**
