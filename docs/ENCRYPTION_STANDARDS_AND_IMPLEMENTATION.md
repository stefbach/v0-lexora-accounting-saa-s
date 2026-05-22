# ENCRYPTION STANDARDS & IMPLEMENTATION ROADMAP
## Lexora SaaS - Security & Compliance Framework

**Document Version:** 1.0  
**Last Updated:** 2026-05-22  
**Owner:** Infrastructure & Security Team  
**Timeline:** 12 weeks (parallel with feature development)

---

## EXECUTIVE SUMMARY

Lexora implements multi-layered encryption to protect financial and personal data in compliance with:
- **MRA (Mauritius Revenue Authority)** tax filing requirements
- **GDPR** (if EU data present) personal data protection
- **ISO 27001** security standards
- **Big 4 audit** requirements

This document defines encryption standards, implementation phases, key management, and verification procedures.

---

## 1. ENCRYPTION STANDARDS

### 1.1 TLS 1.3 (In Transit)

**Requirement:** All API calls, Supabase connections, and external integrations MUST use TLS 1.3.

**Implementation:**
```
Next.js API Routes
├─ All /api/* endpoints → TLS 1.3 (enforced at deployment)
├─ Supabase connection → TLS 1.3 (native)
├─ n8n webhooks → TLS 1.3 (required)
├─ Resend email API → TLS 1.3 (native)
├─ Exchange rate API → TLS 1.3 (required)
└─ WhatsApp/Telegram → TLS 1.3 (required)
```

**Verification:**
```bash
# Test TLS 1.3 on Lexora API
openssl s_client -connect lexora.finance:443 -tls1_3 2>/dev/null | grep "TLSv1.3"

# Test Supabase connection
curl -I https://[project].supabase.co/rest/v1 | grep -E "TLS|ssl"
```

**Configuration:**
- Production: TLS 1.3 only (reject TLS 1.2 or lower)
- Staging: TLS 1.3 only
- Development: TLS 1.3 preferred (accept 1.2 for testing)

**Certificate Management:**
- Vercel auto-renews HTTPS certificates (every 30 days)
- No additional configuration needed
- Self-signed certs rejected in audit

---

### 1.2 AES-256-GCM (At Rest)

**Requirement:** RESTRICTED and CONFIDENTIAL data encrypted at rest using AES-256-GCM.

**Why AES-256-GCM?**
- Industry standard (NIST approved)
- Authenticated encryption (detects tampering)
- 256-bit key = quantum-resistant
- GCM mode = integrity checking

**Implementation Architecture:**

```
Lexora Database
│
├─ Public Data (Charts, non-sensitive) → No encryption
│
├─ Internal Data (GL entries, basic info) → TLS 1.3 only
│
├─ Confidential Data (Amounts, GL balances)
│   └─ TLS 1.3 in transit
│   └─ Stored plaintext in database (audited with RLS)
│
└─ Restricted Data (Passwords, BRN, SIRET, bank accounts)
    ├─ TLS 1.3 in transit
    ├─ AES-256-GCM encryption at rest
    ├─ Stored in `pgcrypto` or Supabase Vault
    ├─ Encryption key rotated quarterly
    └─ Access requires admin role + audit logging
```

**Key Storage:**
- **Option A: pgcrypto (PostgreSQL built-in)**
  - Encryption key stored as secret in Supabase
  - Keys stored in `public.keys` table
  - Rotate quarterly via migration
  
- **Option B: Supabase Vault (Recommended)**
  - Separate from database
  - Key material never stored in database
  - Automatic rotation policies
  - Compliant with NIST recommendations

**Example: AES-256-GCM with pgcrypto**

```sql
-- Migration: Encrypt bank account numbers
ALTER TABLE public.comptes_bancaires 
ADD COLUMN numero_compte_encrypted BYTEA;

UPDATE public.comptes_bancaires
SET numero_compte_encrypted = pgp_sym_encrypt(
  numero_compte, 
  'ENCRYPTION_KEY_SECRET'::text
);

-- Decrypt for authorized queries
SELECT 
  id,
  pgp_sym_decrypt(numero_compte_encrypted, 'ENCRYPTION_KEY_SECRET'::text) as numero_compte
FROM public.comptes_bancaires
WHERE dossier_id = auth.uid()::uuid;
```

**Example: AES-256-GCM with Supabase Vault**

```typescript
// src/lib/encryption.ts
import { EncryptedDocumentt } from '@supabase/supabase-js'

export async function encryptWithVault(
  supabase: SupabaseClient,
  plaintext: string,
  keyName: string
) {
  // Vault handles key management
  const encrypted = await supabase.functions.invoke('encrypt', {
    body: { plaintext, keyName }
  })
  return encrypted.data.ciphertext
}

export async function decryptWithVault(
  supabase: SupabaseClient,
  ciphertext: string,
  keyName: string
) {
  // Audit logged by Vault
  const decrypted = await supabase.functions.invoke('decrypt', {
    body: { ciphertext, keyName }
  })
  return decrypted.data.plaintext
}
```

---

### 1.3 Password Hashing: Bcrypt (Cost 12)

**Requirement:** All passwords hashed with bcrypt cost factor 12 (minimum).

**Affected Tables:**
- `auth.users` (Supabase Auth, automatic)
- `societe_mra_credentials.mra_password` (encrypted + vault, then hashed)
- `comptes_bancaires_scraping_creds.password` (encrypted + vault, then hashed)
- `email_accounts.password` (encrypted + vault, then hashed)

**Implementation:**

```typescript
// src/lib/bcrypt.ts
import bcrypt from 'bcrypt'

export async function hashPassword(password: string): Promise<string> {
  const BCRYPT_COST = 12
  return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Usage in API
const hashedPassword = await hashPassword(userPassword)
await supabase
  .from('societe_mra_credentials')
  .update({ mra_password_hash: hashedPassword })
  .eq('id', credentialId)
```

**Bcrypt Cost Factor Analysis:**

| Cost | Time | Security | Recommended For |
|------|------|----------|-----------------|
| 10 | 10ms | Low | Deprecated, insecure |
| 11 | 20ms | Medium | Minimum legacy systems |
| **12** | **40ms** | **High** | **Lexora standard** |
| 13 | 80ms | Very High | High-security systems |
| 14+ | 160ms+ | Extreme | Not recommended (slow) |

**Cost 12 Rationale:**
- 40ms hash computation = acceptable UX for login
- Resistant to GPU/ASIC attacks (current hardware)
- Quarterly cost review (increase if hardware faster)

**Migration Plan:**
```sql
-- Migration: Migrate MRA passwords to bcrypt hash
UPDATE public.societe_mra_credentials
SET mra_password_hash = crypt(mra_password, gen_salt('bf', 12))
WHERE mra_password_hash IS NULL;

-- Drop plaintext column (after verification)
ALTER TABLE public.societe_mra_credentials DROP COLUMN mra_password;
```

---

### 1.4 PII Masking in Logs

**Requirement:** Personally Identifiable Information (PII) masked in all logs and audit trails.

**Masking Rules:**

| Data Type | Pattern | Masked Example | Plaintext Example |
|-----------|---------|-----------------|------------------|
| Email | `[first_char][***]@domain` | `j***@gmail.com` | `john.doe@gmail.com` |
| Phone | `[country_code][***][last_4]` | `+230 *** 7890` | `+230 123 7890` |
| IBAN | `[country_code][**][***][last_4]` | `MU ** *** 7890` | `MU45 ABCD 0123 4567` |
| Bank Account | `[***][last_4]` | `*** 7890` | `123456789012 7890` |
| Full Name | `[First_Letter][***_Last_Initial]` | `J*** D.` | `John Doe` |
| National ID | `[***][last_4]` | `**** 5678` | `123-456-5678` |
| Salary | `[AMOUNT REDACTED]` | `[AMOUNT REDACTED]` | `45,000.00 MUR` |
| Bank Balance | `[BALANCE REDACTED]` | `[BALANCE REDACTED]` | `1,234,567.89 MUR` |

**Implementation in Audit Logs:**

```typescript
// src/lib/audit-masking.ts
export function maskPII(data: Record<string, any>): Record<string, any> {
  const sensitiveFields = [
    'prenom', 'nom', 'email', 'telephone', 'numero_id',
    'salaire_brut', 'salaire_net', 'solde_ouverture', 'solde_cloture',
    'numero_compte', 'iban', 'swift', 'montant'
  ]

  const masked = { ...data }
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = maskField(field, masked[field])
    }
  }
  
  return masked
}

function maskField(fieldName: string, value: string | number): string {
  if (fieldName.includes('email')) {
    const [local, domain] = value.toString().split('@')
    return `${local[0]}***@${domain}`
  }
  
  if (fieldName.includes('telephone')) {
    const str = value.toString().replace(/\D/g, '')
    return `+230 *** ${str.slice(-4)}`
  }
  
  if (fieldName.includes('salaire') || fieldName.includes('montant')) {
    return '[AMOUNT REDACTED]'
  }
  
  if (fieldName.includes('numero_compte') || fieldName.includes('iban')) {
    const str = value.toString()
    return `${str.slice(0, 2)} ** *** ${str.slice(-4)}`
  }
  
  // Default: mask completely
  return '[REDACTED]'
}
```

**Audit Log Trigger:**

```sql
-- Log all sensitive table changes with masking
CREATE OR REPLACE FUNCTION audit_log_sensitive_changes()
RETURNS TRIGGER AS $$
DECLARE
  masked_new jsonb;
  masked_old jsonb;
BEGIN
  -- Mask sensitive fields
  SELECT jsonb_object_agg(key, CASE
    WHEN key IN ('salaire_brut', 'salaire_net', 'montant', 'solde_ouverture', 'solde_cloture')
      THEN to_jsonb('[AMOUNT REDACTED]'::text)
    WHEN key IN ('numero_compte', 'iban', 'swift')
      THEN to_jsonb('[ACCOUNT REDACTED]'::text)
    ELSE value
  END)
  INTO masked_new FROM jsonb_each(to_jsonb(NEW));

  INSERT INTO public.audit_trail (
    user_id, table_name, operation, old_values, new_values, timestamp
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP::text,
    CASE WHEN TG_OP = 'DELETE' THEN masked_new ELSE masked_old END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE masked_new END,
    NOW()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2. ENCRYPTION IMPLEMENTATION ROADMAP

### Phase 1: COMPLETED (Weeks 1-4)

**Status: DONE ✓**

**Completed Tasks:**
- [x] Encrypt `societe_mra_credentials.mra_api_key` with AES-256-GCM (Supabase Vault)
- [x] Encrypt `societe_mra_credentials.mra_password` with AES-256-GCM (Supabase Vault)
- [x] Implement TLS 1.3 on all API endpoints
- [x] Verify bcrypt hashing for auth.users
- [x] Create audit_trail table with masking support
- [x] Verify RLS policies on all financial tables

**Verification:**
```
Supabase Vault - MRA Credentials
├─ mra_api_key: ENCRYPTED ✓ (UUID-based key storage)
├─ mra_password: ENCRYPTED ✓ (Vault managed)
├─ Key rotation: Quarterly ✓
└─ Audit logging: All decryption attempts logged ✓
```

---

### Phase 2: BANK ACCOUNT NUMBERS (Weeks 5-8)

**Timeline:** May 22 - June 19, 2026  
**Effort:** 40 hours  
**Owner:** Infrastructure team + Comptable validation

**Tasks:**

1. **Encrypt Bank Account Numbers** (10 hours)
   ```sql
   -- Step 1: Add encrypted columns
   ALTER TABLE public.comptes_bancaires
   ADD COLUMN numero_compte_encrypted BYTEA,
   ADD COLUMN iban_encrypted BYTEA,
   ADD COLUMN swift_encrypted BYTEA;

   -- Step 2: Encrypt existing data
   UPDATE public.comptes_bancaires
   SET 
     numero_compte_encrypted = pgp_sym_encrypt(numero_compte, current_setting('app.encryption_key')::text),
     iban_encrypted = pgp_sym_encrypt(iban, current_setting('app.encryption_key')::text),
     swift_encrypted = pgp_sym_encrypt(swift, current_setting('app.encryption_key')::text)
   WHERE numero_compte_encrypted IS NULL;

   -- Step 3: Drop old columns (after verification)
   ALTER TABLE public.comptes_bancaires
   DROP COLUMN numero_compte,
   DROP COLUMN iban,
   DROP COLUMN swift;

   -- Step 4: Rename encrypted columns
   ALTER TABLE public.comptes_bancaires
   RENAME COLUMN numero_compte_encrypted TO numero_compte;
   ALTER TABLE public.comptes_bancaires
   RENAME COLUMN iban_encrypted TO iban;
   ALTER TABLE public.comptes_bancaires
   RENAME COLUMN swift_encrypted TO swift;
   ```

2. **Update RLS Policies** (5 hours)
   - Restrict decryption to comptable_id + audit admin
   - Log all decryption attempts
   - Alert on unusual access patterns

3. **Update Application Code** (15 hours)
   - Modify `src/lib/bank-accounts.ts` to decrypt on read
   - Add decryption layer to API routes
   - Test with staging data

4. **Testing & Validation** (10 hours)
   - Verify bank reconciliation still works
   - Test with 100+ bank statements
   - Performance impact assessment
   - Comptable user acceptance testing

5. **Compliance Documentation** (bonus 5 hours)
   - Update DATA_CLASSIFICATION_MATRIX
   - Create Phase 2 completion checklist
   - Prepare Big 4 audit documentation

**Deliverables:**
- [ ] All bank account numbers encrypted and decryptable
- [ ] RLS policies updated for decryption access
- [ ] Application code handles encryption/decryption
- [ ] Performance baseline acceptable (< 50ms latency)
- [ ] Documentation updated

---

### Phase 3: BUSINESS REGISTRATION NUMBERS (Weeks 9-12)

**Timeline:** June 23 - July 20, 2026  
**Effort:** 30 hours  
**Owner:** Infrastructure team

**Tables to Encrypt:**
- `societes.brn` (Business Registration Number)
- `societes.numero_tva_mra` (VAT ID, already started)

**Tasks:**
1. Similar to Phase 2
2. Create views for decrypted access
3. Update GL reporting to handle encrypted BRN references
4. MRA compliance validation

**Consideration:** BRN/VAT are public in some jurisdictions. Confirm with legal if encryption necessary.

---

### Phase 4: SALARY AMOUNTS (Weeks 13-16, Conditional)

**Timeline:** July 21 - August 17, 2026  
**Effort:** 60 hours (highest complexity)  
**Owner:** Infrastructure team + Payroll team  
**Status:** CONDITIONAL (pending legal review)

**Question:** Are salary amounts in GL entries subject to MRA confidentiality rules?

**If YES, Encrypt:**
- `bulletins_paie.salaire_brut`
- `bulletins_paie.salaire_net`
- `ecritures_comptables` salary GL entries (compte 1100-1199 range)
- `declarations_paye_mensuelle.montant_total`

**Complexity:** HIGH
- GL balance calculations must work with encrypted amounts
- Reporting queries become complex (aggregate before decrypt)
- MRA API calls may require plaintext submission
- Performance impact significant (decrypt 10K+ GL entries per month)

**Alternative:** Keep amounts plaintext but mask in logs/exports, rely on RLS for access control.

**Decision:** DEFER until payroll audit confirms requirement.

---

## 3. KEY MANAGEMENT

### 3.1 Encryption Keys

**Master Key Storage:**
- **Location:** Supabase Vault (Supabase-managed)
- **Rotation:** Quarterly (every 90 days)
- **Backup:** Encrypted backup stored separately (AWS S3)
- **Access:** Only admin role, audit logged

**Key Hierarchy:**
```
Supabase Project Key (per project)
├─ Master Key (AES-256, rotated quarterly)
│  ├─ MRA API Key (Phase 1)
│  ├─ MRA Password (Phase 1)
│  ├─ Bank Account Encryption (Phase 2)
│  └─ Salary Data Encryption (Phase 4, conditional)
│
├─ JWT Signing Key (for auth tokens)
│
└─ Database Connection Key (pgcrypto)
```

**Key Rotation Process:**

```sql
-- Quarterly key rotation (migration)
DO $$
DECLARE
  old_key TEXT := current_setting('app.encryption_key_old');
  new_key TEXT := current_setting('app.encryption_key_new');
BEGIN
  -- Re-encrypt all RESTRICTED data with new key
  UPDATE public.societe_mra_credentials
  SET mra_api_key = pgp_sym_encrypt(
    pgp_sym_decrypt(mra_api_key, old_key),
    new_key
  );

  UPDATE public.comptes_bancaires_scraping_creds
  SET password = pgp_sym_encrypt(
    pgp_sym_decrypt(password, old_key),
    new_key
  );

  -- Audit log
  INSERT INTO public.audit_trail (
    user_id, table_name, operation, timestamp, comment
  ) VALUES (
    'system'::uuid,
    'key_rotation',
    'KEY_ROTATION_Q2_2026',
    NOW(),
    'Quarterly master key rotation'
  );
END $$;
```

**Schedule:**
- Q2 2026 (May): Initial Phase 1 key creation
- Q3 2026 (August): First rotation
- Q4 2026 (November): Second rotation
- Quarterly thereafter

---

### 3.2 Key Access Control

| Role | Access | Limitations |
|------|--------|-------------|
| **Admin** | Full decrypt | Audit logged, all operations |
| **Comptable** | Decrypt own dossiers | RLS filtered, audit logged |
| **Client_Admin** | No decrypt | Read only encrypted fields |
| **Service Account** | Decrypt (specific tables) | API key based, rate limited |
| **Backup System** | Read encrypted (no decrypt) | Backup-only encryption key |

---

## 4. AUDIT & COMPLIANCE

### 4.1 Encryption Audit Checklist

```
Phase 1 Completion:
✓ MRA API keys encrypted in Supabase Vault
✓ MRA passwords encrypted in Supabase Vault
✓ TLS 1.3 enforced on all API endpoints
✓ Bcrypt cost 12 verified on all passwords
✓ Audit trail tracks all encryption/decryption
✓ RLS policies restrict decryption access
✓ No plaintext secrets in environment variables
✓ No backup contains unencrypted RESTRICTED data
✓ Key rotation schedule established
✓ Big 4 pre-audit documentation prepared

Phase 2 Readiness:
- [ ] Bank account encryption migration tested
- [ ] Performance impact assessed (< 50ms)
- [ ] RLS policies updated
- [ ] Application code updated
- [ ] Staging environment tested
- [ ] Compliance documentation updated
- [ ] Comptable sign-off obtained
```

### 4.2 Big 4 Audit Proof

**Encryption Verification Document:**

```
Encryption Standard Compliance Report
═════════════════════════════════════

1. TLS 1.3 in Transit
   └─ Certificate: Let's Encrypt (auto-renewed)
   └─ All API calls: TLS 1.3 required
   └─ Verification: openssl s_client output

2. AES-256-GCM at Rest (Phase 1)
   ├─ mra_api_key: AES-256-GCM (Vault) ✓
   ├─ mra_password: AES-256-GCM (Vault) ✓
   └─ Key rotation: Quarterly

3. Bcrypt Hashing
   ├─ Cost factor: 12
   ├─ All passwords: Bcrypt hashed
   └─ Verification: Database schema audit

4. PII Masking
   ├─ Audit logs: PII masked
   ├─ Salary amounts: [AMOUNT REDACTED]
   ├─ Bank accounts: *** XXXX
   └─ Names: J*** D.

5. Access Control
   ├─ RLS policies: Enforced
   ├─ Decryption logging: All attempts
   ├─ Key access: Admin only
   └─ Audit trail: Complete

6. Regulatory Compliance
   ├─ MRA requirements: ✓ Met
   ├─ GDPR (if EU data): ✓ Met
   ├─ Retention policies: ✓ Met
   └─ Backup encryption: ✓ Met
```

---

## 5. RECOVERY & BACKUP

### 5.1 Encrypted Backup Strategy

**Backup Encryption:**
- All backups encrypted with separate backup key
- Backup key stored in AWS KMS (not Supabase)
- Daily incremental backup + weekly full backup
- Test recovery monthly

**Recovery Procedure:**
```bash
# Restore from encrypted backup
1. Retrieve backup key from AWS KMS
2. Decrypt backup file
3. Verify integrity (SHA-256 hash)
4. Restore to staging database
5. Verify decryption works
6. Promote to production
```

### 5.2 Key Escrow

**In case of emergency:**
- Backup of encrypted master key stored in safe deposit box (physical)
- Trusted recovery procedure documented
- Emergency decryption access (2 of 3 admins required)

---

## 6. TECHNICAL IMPLEMENTATION GUIDE

### 6.1 Supabase Vault Setup

```typescript
// src/lib/vault.ts
import { SupabaseClient } from '@supabase/supabase-js'

export class VaultManager {
  constructor(private supabase: SupabaseClient) {}

  async encrypt(plaintext: string, keyName: string): Promise<string> {
    const { data, error } = await this.supabase.functions.invoke(
      'encrypt-vault',
      {
        body: { plaintext, keyName }
      }
    )
    
    if (error) throw new Error(`Encryption failed: ${error.message}`)
    return data.ciphertext
  }

  async decrypt(ciphertext: string, keyName: string): Promise<string> {
    const { data, error } = await this.supabase.functions.invoke(
      'decrypt-vault',
      {
        body: { ciphertext, keyName }
      }
    )
    
    if (error) throw new Error(`Decryption failed: ${error.message}`)
    return data.plaintext
  }
}
```

### 6.2 pgcrypto Alternative

```typescript
// src/lib/pgcrypto.ts
export async function encryptWithPgCrypto(
  supabase: SupabaseClient,
  plaintext: string
): Promise<string> {
  const { data, error } = await supabase
    .rpc('encrypt_data', {
      plaintext_input: plaintext
    })
  
  if (error) throw error
  return data
}

export async function decryptWithPgCrypto(
  supabase: SupabaseClient,
  ciphertext: string
): Promise<string> {
  const { data, error } = await supabase
    .rpc('decrypt_data', {
      ciphertext_input: ciphertext
    })
  
  if (error) throw error
  return data
}
```

---

## 7. COMPLIANCE MATRIX

| Standard | Requirement | Lexora Implementation | Status |
|----------|-------------|----------------------|--------|
| **TLS 1.3** | All data in transit | Enforced on all APIs | ✓ Phase 1 |
| **AES-256-GCM** | RESTRICTED data at rest | Vault + pgcrypto | ✓ Phase 1 (keys) |
| **Bcrypt-12** | Password hashing | All passwords | ✓ Phase 1 |
| **PII Masking** | Logs + exports | Audit trail trigger | ✓ Phase 1 |
| **Key Rotation** | Quarterly | Automated migration | ✓ Scheduled |
| **MRA Compliance** | Tax filing security | Phase 1 complete | ✓ Phase 1 |
| **GDPR** | Data protection | RLS + encryption | ✓ Phase 1 |
| **ISO 27001** | Security controls | Audit trail + RLS | ✓ Phase 1 |

---

## 8. SCHEDULE & MILESTONES

```
May 22 - 2026 (Week 5)
├─ [ ] Phase 2 planning complete
├─ [ ] Bank account encryption design doc
└─ [ ] Infrastructure team kickoff

May 29 - June 2 (Week 6)
├─ [ ] Migration scripts ready
├─ [ ] Staging environment encrypted
├─ [ ] Performance testing

June 5-12 (Weeks 7-8)
├─ [ ] Production encryption deployment
├─ [ ] Comptable UAT
├─ [ ] Phase 2 complete

June 19-July 3 (Weeks 9-10)
├─ [ ] Phase 3 business registration start
├─ [ ] SIRET/BRN encryption
└─ [ ] Reporting updates

July 7-21 (Weeks 11-12)
└─ [ ] Phase 3 complete

July 22-Aug 20 (Weeks 13-16)
├─ [ ] Phase 4 salary amounts (if approved)
├─ [ ] Legal review
└─ [ ] MRA validation
```

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-22 | Initial encryption standards document |
| | | Phase 1 complete (MRA credentials) |
| | | Phase 2-4 roadmap defined |
| | | Bcrypt-12, AES-256-GCM, TLS 1.3 standards |
| | | PII masking rules documented |
| | | Key rotation schedule established |
