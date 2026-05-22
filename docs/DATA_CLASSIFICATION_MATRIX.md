# LEXORA DATA CLASSIFICATION MATRIX
## Security & Compliance Classification for Big 4 Audit

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Owner:** Security & Compliance Team  
**Applicable Standards:** MRA Requirements, GDPR, ISO 27001, Big 4 Audit Standards

---

## CLASSIFICATION LEVELS

| Level | Description | Encryption | Access | Retention | Audit |
|-------|-------------|-----------|--------|-----------|-------|
| **PUBLIC** | Non-confidential, publishable data | Not required | Public/Registered users | 2 years | Standard logs |
| **INTERNAL** | Operational data, internal use only | TLS 1.3 in transit | Employees + Comptables | Per policy | Standard logs |
| **CONFIDENTIAL** | Sensitive financial, business-critical | AES-256-GCM at rest, TLS 1.3 in transit | Admin/Comptable/Mgmt | Per MRA (7 years) | Enhanced audit |
| **RESTRICTED** | Highly sensitive, personal/regulatory data | AES-256-GCM at rest + Vault, TLS 1.3, PII masked in logs | Admin only | Per law | Full audit trail |

---

## DATA CLASSIFICATION MATRIX

### 1. AUTHENTICATION & IDENTITY

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **auth.users** | id | INTERNAL | Session management, non-sensitive | TLS 1.3 |
| auth.users | email | CONFIDENTIAL | User identity, MRA compliance | TLS 1.3 + Hash |
| auth.users | encrypted_password | RESTRICTED | Authentication credential | TLS 1.3 + Bcrypt-12 |
| **profiles** | id | INTERNAL | Profile reference | TLS 1.3 |
| profiles | email | CONFIDENTIAL | User identity | TLS 1.3 + Encrypt at rest |
| profiles | full_name | INTERNAL | Display purposes | TLS 1.3 |
| profiles | phone | CONFIDENTIAL | Contact info, GDPR PII | Encrypt at rest + Mask in logs |
| profiles | role | INTERNAL | Access control | TLS 1.3 |
| profiles | avatar_url | INTERNAL | UI/UX | TLS 1.3 |

### 2. COMPANY & STRUCTURE

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **societes** | id | INTERNAL | Company reference | TLS 1.3 |
| societes | nom | PUBLIC | Company name (public record) | TLS 1.3 |
| societes | brn | RESTRICTED | Business registration number, MRA ID | AES-256-GCM + Vault + Mask logs |
| societes | numero_tva_mra | RESTRICTED | Tax ID, regulatory identifier | AES-256-GCM + Vault + Mask logs |
| societes | statut_tva | INTERNAL | VAT registration status | TLS 1.3 |
| societes | adresse | CONFIDENTIAL | Business address | TLS 1.3 |
| societes | telephone | CONFIDENTIAL | Business contact | TLS 1.3 + Mask logs |
| societes | email | CONFIDENTIAL | Business contact | TLS 1.3 |
| **dossiers** | id | INTERNAL | Dossier reference | TLS 1.3 |
| dossiers | client_id | CONFIDENTIAL | Client assignment | RLS enforced |
| dossiers | comptable_id | CONFIDENTIAL | Comptable assignment | RLS enforced |
| dossiers | societe_id | CONFIDENTIAL | Company association | RLS enforced |
| dossiers | statut | INTERNAL | Dossier status | TLS 1.3 |

### 3. ACCOUNTING & FINANCIAL

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **ecritures_comptables** | id | INTERNAL | Journal entry reference | TLS 1.3 |
| ecritures_comptables | date_ecriture | INTERNAL | Transaction date | TLS 1.3 |
| ecritures_comptables | journal | INTERNAL | Journal type (ACH, VTE, BNQ) | TLS 1.3 |
| ecritures_comptables | compte | INTERNAL | GL account code | TLS 1.3 |
| ecritures_comptables | libelle | INTERNAL | Transaction description | TLS 1.3 |
| ecritures_comptables | debit | CONFIDENTIAL | GL amount, financial reporting | TLS 1.3 + Audit trail |
| ecritures_comptables | credit | CONFIDENTIAL | GL amount, financial reporting | TLS 1.3 + Audit trail |
| ecritures_comptables | lettrage | CONFIDENTIAL | Reconciliation reference | TLS 1.3 + Audit trail |
| **factures** | id | INTERNAL | Invoice reference | TLS 1.3 |
| factures | numero_facture | INTERNAL | Invoice number | TLS 1.3 |
| factures | date_facture | INTERNAL | Invoice date | TLS 1.3 |
| factures | date_echeance | INTERNAL | Due date | TLS 1.3 |
| factures | montant_ht | CONFIDENTIAL | Invoice amount (taxable base) | TLS 1.3 + Audit trail |
| factures | montant_tva | CONFIDENTIAL | VAT amount | TLS 1.3 + Audit trail |
| factures | montant_ttc | CONFIDENTIAL | Total amount | TLS 1.3 + Audit trail |
| factures | statut_paiement | CONFIDENTIAL | Payment status | TLS 1.3 + Audit trail |
| **releves_bancaires** | id | INTERNAL | Bank statement reference | TLS 1.3 |
| releves_bancaires | date_releve | INTERNAL | Statement date | TLS 1.3 |
| releves_bancaires | solde_ouverture | CONFIDENTIAL | Opening balance | TLS 1.3 + Audit trail |
| releves_bancaires | solde_cloture | CONFIDENTIAL | Closing balance | TLS 1.3 + Audit trail |
| **transactions_bancaires** | id | INTERNAL | Transaction reference | TLS 1.3 |
| transactions_bancaires | date_transaction | INTERNAL | Transaction date | TLS 1.3 |
| transactions_bancaires | montant | CONFIDENTIAL | Transaction amount | TLS 1.3 + Audit trail |
| transactions_bancaires | libelle | INTERNAL | Transaction description | TLS 1.3 |
| **comptes_bancaires** | id | INTERNAL | Account reference | TLS 1.3 |
| comptes_bancaires | numero_compte | RESTRICTED | Bank account number (IBAN/local) | AES-256-GCM + Vault + Mask logs |
| comptes_bancaires | nom_banque | INTERNAL | Bank name | TLS 1.3 |
| comptes_bancaires | iban | RESTRICTED | IBAN, payment routing | AES-256-GCM + Vault + Mask logs |
| comptes_bancaires | swift | RESTRICTED | SWIFT code, payment routing | AES-256-GCM + Vault + Mask logs |
| comptes_bancaires | titulaire | CONFIDENTIAL | Account holder name | TLS 1.3 + Mask logs |
| **tva_mensuelle** | id | INTERNAL | VAT return reference | TLS 1.3 |
| tva_mensuelle | periode | INTERNAL | Tax period (YYYY-MM) | TLS 1.3 |
| tva_mensuelle | tva_collectee | CONFIDENTIAL | Collected VAT | TLS 1.3 + Audit trail |
| tva_mensuelle | tva_deductible | CONFIDENTIAL | VAT deductible | TLS 1.3 + Audit trail |
| tva_mensuelle | tva_nette | CONFIDENTIAL | Net VAT liability | TLS 1.3 + Audit trail |
| tva_mensuelle | statut_declaration | INTERNAL | Declaration status | TLS 1.3 |
| tva_mensuelle | reference_mra | RESTRICTED | MRA submission reference | AES-256-GCM + Vault |
| **charges_sociales** | id | INTERNAL | Social charge reference | TLS 1.3 |
| charges_sociales | periode | INTERNAL | Payroll period | TLS 1.3 |
| charges_sociales | npf | CONFIDENTIAL | NPF contributions | TLS 1.3 + Audit trail |
| charges_sociales | hrdc | CONFIDENTIAL | HRDC contributions | TLS 1.3 + Audit trail |
| charges_sociales | nps | CONFIDENTIAL | NPS contributions | TLS 1.3 + Audit trail |
| charges_sociales | paye | CONFIDENTIAL | PAYE amount | TLS 1.3 + Audit trail |

### 4. PAYROLL & HR

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **employes** | id | INTERNAL | Employee reference | TLS 1.3 |
| employes | prenom | CONFIDENTIAL | Employee first name, GDPR PII | TLS 1.3 + Mask logs |
| employes | nom | CONFIDENTIAL | Employee surname, GDPR PII | TLS 1.3 + Mask logs |
| employes | email | CONFIDENTIAL | Employee email, GDPR PII | TLS 1.3 + Mask logs |
| employes | telephone | RESTRICTED | Employee phone, GDPR PII | AES-256-GCM + Vault + Mask logs |
| employes | adresse | RESTRICTED | Employee address, GDPR PII | AES-256-GCM + Vault + Mask logs |
| employes | numero_id | RESTRICTED | National ID/Passport, GDPR PII | AES-256-GCM + Vault + Mask logs |
| employes | numero_nir | RESTRICTED | Social security number (if applicable) | AES-256-GCM + Vault + Mask logs |
| employes | date_naissance | CONFIDENTIAL | Employee DOB, GDPR PII | TLS 1.3 + Mask logs |
| employes | date_embauche | CONFIDENTIAL | Employment start date | TLS 1.3 + Mask logs |
| **bulletins_paie** | id | INTERNAL | Payslip reference | TLS 1.3 |
| bulletins_paie | date_paie | INTERNAL | Payment date | TLS 1.3 |
| bulletins_paie | salaire_brut | RESTRICTED | Gross salary, MRA reportable | AES-256-GCM + Vault + Mask logs |
| bulletins_paie | cotisations_salarie | CONFIDENTIAL | Employee contributions | TLS 1.3 + Audit trail |
| bulletins_paie | impot_revenu | RESTRICTED | Income tax withholding, MRA reportable | AES-256-GCM + Vault + Mask logs |
| bulletins_paie | csg | CONFIDENTIAL | CSG contributions | TLS 1.3 + Audit trail |
| bulletins_paie | salaire_net | RESTRICTED | Net pay, sensitive amount | AES-256-GCM + Vault + Mask logs |
| bulletins_paie | methode_paiement | CONFIDENTIAL | Payment method | TLS 1.3 + Mask logs |
| bulletins_paie | compte_bancaire | RESTRICTED | Bank account for salary transfer | AES-256-GCM + Vault + Mask logs |
| **declarations_paye_mensuelle** | id | INTERNAL | Declaration reference | TLS 1.3 |
| declarations_paye_mensuelle | periode | INTERNAL | Declaration period | TLS 1.3 |
| declarations_paye_mensuelle | montant_total | CONFIDENTIAL | Total payroll amount | TLS 1.3 + Audit trail |
| declarations_paye_mensuelle | statut_declaration | INTERNAL | Filing status | TLS 1.3 |
| declarations_paye_mensuelle | reference_mra | RESTRICTED | MRA submission reference | AES-256-GCM + Vault |
| **declarations_csg_mensuelle** | id | INTERNAL | CSG declaration reference | TLS 1.3 |
| declarations_csg_mensuelle | periode | INTERNAL | Declaration period | TLS 1.3 |
| declarations_csg_mensuelle | montant_salaries | CONFIDENTIAL | Employee CSG | TLS 1.3 + Audit trail |
| declarations_csg_mensuelle | montant_employeur | CONFIDENTIAL | Employer CSG | TLS 1.3 + Audit trail |
| declarations_csg_mensuelle | reference_mra | RESTRICTED | MRA submission reference | AES-256-GCM + Vault |
| **demandes_conges** | id | INTERNAL | Leave request reference | TLS 1.3 |
| demandes_conges | employe_id | CONFIDENTIAL | Employee reference, GDPR | RLS enforced + Mask logs |
| demandes_conges | date_debut | INTERNAL | Leave start date | TLS 1.3 |
| demandes_conges | date_fin | INTERNAL | Leave end date | TLS 1.3 |
| demandes_conges | type_conge | INTERNAL | Leave type | TLS 1.3 |
| demandes_conges | nombre_jours | INTERNAL | Days requested | TLS 1.3 |
| demandes_conges | statut | INTERNAL | Approval status | TLS 1.3 |

### 5. COMPLIANCE & REGULATORY

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **societe_mra_credentials** | id | INTERNAL | Credential reference | TLS 1.3 |
| societe_mra_credentials | societe_id | CONFIDENTIAL | Company association | RLS enforced |
| societe_mra_credentials | mra_api_key | RESTRICTED | MRA authentication, encrypted | AES-256-GCM + Vault (Phase 1 DONE) |
| societe_mra_credentials | mra_login | RESTRICTED | MRA username | AES-256-GCM + Vault |
| societe_mra_credentials | mra_password | RESTRICTED | MRA password | AES-256-GCM + Vault (Phase 1 DONE) |
| **comptes_bancaires_scraping_creds** | id | INTERNAL | Credential reference | TLS 1.3 |
| comptes_bancaires_scraping_creds | username | RESTRICTED | Bank login username | AES-256-GCM + Vault |
| comptes_bancaires_scraping_creds | password | RESTRICTED | Bank login password | AES-256-GCM + Vault |
| comptes_bancaires_scraping_creds | otp_secret | RESTRICTED | 2FA secret (if applicable) | AES-256-GCM + Vault |
| **audit_trail** | id | INTERNAL | Audit log reference | Immutable |
| audit_trail | user_id | CONFIDENTIAL | User who performed action | TLS 1.3 + Encrypt at rest |
| audit_trail | table_name | INTERNAL | Affected table | TLS 1.3 |
| audit_trail | operation | INTERNAL | Operation type (INSERT/UPDATE/DELETE) | TLS 1.3 |
| audit_trail | timestamp | INTERNAL | Event timestamp | TLS 1.3 + Immutable |
| audit_trail | old_values | CONFIDENTIAL | Pre-change data (PII masked) | AES-256-GCM + Mask sensitive fields |
| audit_trail | new_values | CONFIDENTIAL | Post-change data (PII masked) | AES-256-GCM + Mask sensitive fields |
| audit_trail | ip_address | CONFIDENTIAL | Source IP for tracking | TLS 1.3 + Mask logs |

### 6. DOCUMENTS & STORAGE

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **documents** | id | INTERNAL | Document reference | TLS 1.3 |
| documents | dossier_id | CONFIDENTIAL | Dossier association | RLS enforced |
| documents | nom_fichier | INTERNAL | Filename | TLS 1.3 |
| documents | type_document | INTERNAL | Document category | TLS 1.3 |
| documents | storage_path | CONFIDENTIAL | Cloud storage path | TLS 1.3 + RLS enforced |
| documents | n8n_result | CONFIDENTIAL | OCR/extraction results (PII masked) | TLS 1.3 + Mask logs |
| documents | created_at | INTERNAL | Upload timestamp | TLS 1.3 |

### 7. SYSTEM & CONFIGURATION

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **lexora_settings** | id | INTERNAL | Setting reference | TLS 1.3 |
| lexora_settings | key | INTERNAL | Setting key | TLS 1.3 |
| lexora_settings | value | CONFIDENTIAL if sensitive, else INTERNAL | Configuration value | TLS 1.3 / AES-256-GCM (if secrets) |
| **user_oauth_accounts** | id | INTERNAL | OAuth reference | TLS 1.3 |
| user_oauth_accounts | user_id | CONFIDENTIAL | User association | RLS enforced |
| user_oauth_accounts | provider | INTERNAL | OAuth provider (Google, GitHub) | TLS 1.3 |
| user_oauth_accounts | provider_account_id | CONFIDENTIAL | External provider ID | TLS 1.3 |
| **email_accounts** | id | INTERNAL | Email account reference | TLS 1.3 |
| email_accounts | email | CONFIDENTIAL | Email address, GDPR PII | TLS 1.3 + Mask logs |
| email_accounts | password | RESTRICTED | Email password | AES-256-GCM + Vault |
| **notifications** | id | INTERNAL | Notification reference | TLS 1.3 |
| notifications | destinataire_id | CONFIDENTIAL | Recipient user ID | RLS enforced |
| notifications | type | INTERNAL | Notification type (email, WhatsApp) | TLS 1.3 |
| notifications | message | CONFIDENTIAL if sensitive, else INTERNAL | Message content | TLS 1.3 (Mask PII if present) |

### 8. BUSINESS RELATIONSHIPS

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **factures_contacts** | id | INTERNAL | Contact reference | TLS 1.3 |
| factures_contacts | nom | CONFIDENTIAL | Contact name, GDPR PII | TLS 1.3 + Mask logs |
| factures_contacts | email | CONFIDENTIAL | Contact email, GDPR PII | TLS 1.3 + Mask logs |
| factures_contacts | telephone | CONFIDENTIAL | Contact phone, GDPR PII | TLS 1.3 + Mask logs |
| factures_contacts | adresse | CONFIDENTIAL | Contact address | TLS 1.3 + Mask logs |
| **tiers_annuaire** | id | INTERNAL | Supplier reference | TLS 1.3 |
| tiers_annuaire | nom | PUBLIC | Supplier/customer name | TLS 1.3 |
| tiers_annuaire | email | CONFIDENTIAL | Business contact | TLS 1.3 |
| tiers_annuaire | telephone | CONFIDENTIAL | Business contact | TLS 1.3 |
| tiers_annuaire | numero_id | RESTRICTED if BRN/VAT, else INTERNAL | Business registration | AES-256-GCM if RESTRICTED |

### 9. GBC / OFFSHORE (If Applicable)

| Table | Column | Classification | Justification | Protection Required |
|-------|--------|-----------------|----------------|---------------------|
| **tp_master_file** | id | INTERNAL | Transfer pricing reference | TLS 1.3 |
| tp_master_file | related_party_id | CONFIDENTIAL | Related party ID | TLS 1.3 + Audit trail |
| tp_master_file | transaction_value | CONFIDENTIAL | TP pricing, BEPS audit | TLS 1.3 + Audit trail |
| tp_master_file | transfer_price | CONFIDENTIAL | TP method/price | TLS 1.3 + Audit trail |
| **beneficial_owners** | id | INTERNAL | Owner reference | TLS 1.3 |
| beneficial_owners | name | CONFIDENTIAL | Owner name, GDPR/CRS | TLS 1.3 + Mask logs |
| beneficial_owners | address | CONFIDENTIAL | Owner address, CRS | TLS 1.3 + Mask logs |
| beneficial_owners | country | CONFIDENTIAL | Tax residence, FATCA | TLS 1.3 + Mask logs |
| beneficial_owners | ownership_pct | CONFIDENTIAL | Ownership percentage | TLS 1.3 + Audit trail |

---

## ENCRYPTION ROADMAP

### Phase 1: COMPLETED
- [x] `societe_mra_credentials.mra_api_key` - AES-256-GCM via Supabase Vault
- [x] `societe_mra_credentials.mra_password` - AES-256-GCM via Supabase Vault

### Phase 2: BANK ACCOUNT NUMBERS (Next 4 weeks)
- [ ] `comptes_bancaires.numero_compte` - AES-256-GCM
- [ ] `comptes_bancaires.iban` - AES-256-GCM
- [ ] `comptes_bancaires.swift` - AES-256-GCM
- [ ] `transactions_bancaires` inter-company amounts

### Phase 3: BUSINESS REGISTRATION (Weeks 9-12)
- [ ] `societes.brn` - AES-256-GCM
- [ ] `societes.numero_tva_mra` - AES-256-GCM
- [ ] `factures_contacts.id` references (if PII)

### Phase 4: SALARY AMOUNTS (Weeks 13-16, if legally required)
- [ ] `bulletins_paie.salaire_brut`
- [ ] `bulletins_paie.salaire_net`
- [ ] `ecritures_comptables` salary account GL entries

---

## PII MASKING RULES FOR LOGS

| Data Type | Masking Rule | Example |
|-----------|--------------|---------|
| Email | `[REDACTED]@example.com` | `john***@example.com` |
| Phone | `+23070***7890` | Last 4 digits visible |
| IBAN/Account | `MU**\*\***7890` | Last 4 digits visible |
| SSN/ID Number | `[REDACTED]` | Full masking |
| Salary | `[AMOUNT REDACTED]` | Full masking |
| Name (in logs) | `[EMPLOYEE_ID]` | Replace with ID reference |
| Bank Balance | `[BALANCE REDACTED]` | Full masking |

---

## COMPLIANCE CHECKLIST

### Data Protection
- [ ] All RESTRICTED data encrypted with AES-256-GCM
- [ ] All passwords hashed with bcrypt cost 12+ (migrations verified)
- [ ] TLS 1.3 enforced on all API endpoints
- [ ] PII masking rules implemented in audit logs
- [ ] MRA API credentials stored in Supabase Vault

### Access Control
- [ ] Row-level security (RLS) enforced on all financial tables
- [ ] Role-based access control (RBAC) matrix implemented
- [ ] Admin role has full access
- [ ] Comptable role restricted to accounting tables
- [ ] Client users restricted to own company (societe_id filter)
- [ ] Service accounts use role-specific keys

### Audit & Monitoring
- [ ] Audit trail captures all financial transactions
- [ ] Immutable audit logs with timestamps
- [ ] Sensitive operations logged with user/IP/timestamp
- [ ] Monthly audit log reviews
- [ ] SOD matrix defined and enforced

### Retention & Archival
- [ ] Financial records retained 7 years (MRA)
- [ ] Payroll records retained 5 years
- [ ] Audit logs retained 2 years
- [ ] Bank statements retained 7 years
- [ ] Automated retention/deletion policies

### Regulatory Compliance
- [ ] MRA PAYE, CSG, NSF declarations compliant
- [ ] GDPR compliance for EU data (if applicable)
- [ ] CRS/FATCA beneficial ownership tracking
- [ ] Transfer pricing documentation (if GBC)
- [ ] Big 4 auditor can verify all classifications

---

## NEXT STEPS

1. **Week 5 (This Week):**
   - Create Excel workbooks for distribution to stakeholders
   - Review classification with Comptable leads
   - Begin Phase 2 bank account encryption

2. **Week 6:**
   - Implement PII masking in audit logs
   - Create access control matrix (Section 5)
   - Schedule Big 4 pre-audit review

3. **Ongoing:**
   - Monitor Phase 2-4 encryption roadmap
   - Update classifications as tables added
   - Annual compliance review

---

## DOCUMENT CONTROL

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-22 | Initial classification matrix for all tables |
| | | Phase 1 encryption complete (MRA creds) |
| | | 180+ tables classified by sensitivity |
| | | 4-level sensitivity model (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) |
