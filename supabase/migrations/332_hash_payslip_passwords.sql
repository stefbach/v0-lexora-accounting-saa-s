-- Migration 332: Hash payslip_password with bcrypt
-- Converts plaintext payslip_password to secure bcrypt hashes in employes table

BEGIN;

-- Step 1: Add new column for hashed password
ALTER TABLE public.employes
ADD COLUMN IF NOT EXISTS payslip_password_hash TEXT;

-- Step 2: Mark legacy plaintext passwords for migration
-- (Application layer will handle the actual bcrypt hashing)
-- For now, create a trigger-based migration approach
ALTER TABLE public.employes
ADD COLUMN IF NOT EXISTS password_migration_status VARCHAR(20) DEFAULT 'pending';

-- Step 3: Create index on password_migration_status for batch processing
CREATE INDEX IF NOT EXISTS idx_employes_password_migration_status
ON public.employes(password_migration_status)
WHERE password_migration_status = 'pending' AND payslip_password IS NOT NULL;

-- Step 4: Create audit log table for password hashing operations
CREATE TABLE IF NOT EXISTS public.employe_password_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_plaintext_marked BOOLEAN DEFAULT FALSE,
  hashed_at TIMESTAMPTZ DEFAULT NOW(),
  hashed_by TEXT DEFAULT 'migration_332'
);

-- Step 5: Create index on audit table
CREATE INDEX IF NOT EXISTS idx_employe_password_audit_employe_id
ON public.employe_password_audit(employe_id);

-- Step 6: Add comment explaining the migration
COMMENT ON COLUMN public.employes.payslip_password IS
'DEPRECATED: Use payslip_password_hash instead. This column will be removed after migration.';

COMMENT ON COLUMN public.employes.payslip_password_hash IS
'Bcrypt-hashed payslip password. Use password_verify() for comparison during API calls.';

COMMIT;

-- Application layer migration instructions:
-- 1. For each employe with payslip_password IS NOT NULL:
--    a. Hash the plaintext with bcrypt (cost 12)
--    b. Store hash in payslip_password_hash
--    c. Set password_migration_status = 'hashed'
--    d. Record audit entry
-- 2. After all passwords hashed:
--    a. Drop payslip_password column
--    b. Rename payslip_password_hash to payslip_password
-- 3. Drop temporary columns and audit table

-- Rollback instructions (if needed):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_employe_password_audit_employe_id;
-- DROP INDEX IF EXISTS idx_employes_password_migration_status;
-- DROP TABLE IF EXISTS public.employe_password_audit;
-- ALTER TABLE public.employes DROP COLUMN IF EXISTS payslip_password_hash;
-- ALTER TABLE public.employes DROP COLUMN IF EXISTS password_migration_status;
-- COMMIT;
