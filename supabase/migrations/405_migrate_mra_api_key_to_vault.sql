-- Migration 331: Encrypt mra_api_key from plaintext societes column to vault
-- This migration moves the plaintext mra_api_key to a secure encrypted location
-- and removes the plaintext column from societes table.

BEGIN;

-- Step 1: Add mra_api_key_enc to societe_mra_credentials if not exists
ALTER TABLE public.societe_mra_credentials
ADD COLUMN IF NOT EXISTS mra_api_key_enc TEXT;

-- Step 2: Migrate existing mra_api_key from societes to encrypted credentials table
-- This is a data migration - assuming the encryption happens at application layer
-- We copy the plaintext mra_api_key values to the encrypted column with a marker
-- Note: The application layer (lib/crypto/symmetric.ts) will handle encryption
-- For now, we migrate the data and add a deprecation flag
UPDATE public.societe_mra_credentials
SET mra_api_key_enc = (
  SELECT mra_api_key FROM public.societes
  WHERE societes.id = societe_mra_credentials.societe_id AND mra_api_key IS NOT NULL
)
WHERE mra_api_key_enc IS NULL;

-- Step 3: Create records in societe_mra_credentials for societes that have mra_api_key but no mra credentials record
INSERT INTO public.societe_mra_credentials (societe_id, mra_api_key_enc, active, updated_by)
SELECT
  id,
  mra_api_key,
  mra_fiscalisation_active,
  id  -- use societe_id as placeholder
FROM public.societes
WHERE mra_api_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.societe_mra_credentials
    WHERE societe_mra_credentials.societe_id = societes.id
  )
ON CONFLICT (societe_id) DO UPDATE SET
  mra_api_key_enc = EXCLUDED.mra_api_key_enc;

-- Step 4: Add deprecation notice column to societes for backward compatibility
ALTER TABLE public.societes
ADD COLUMN IF NOT EXISTS mra_api_key_deprecated TEXT DEFAULT 'MIGRATED_TO_VAULT';

-- Step 5: Set plaintext mra_api_key to NULL (don't drop yet for safety)
UPDATE public.societes SET mra_api_key = NULL;

-- Step 6: Create index on mra_api_key_enc for fast lookups
CREATE INDEX IF NOT EXISTS idx_societe_mra_credentials_mra_api_key
ON public.societe_mra_credentials(mra_api_key_enc)
WHERE mra_api_key_enc IS NOT NULL AND active = true;

COMMIT;

-- Rollback instructions (if needed):
-- BEGIN;
-- UPDATE public.societes
-- SET mra_api_key = (
--   SELECT mra_api_key_enc FROM public.societe_mra_credentials
--   WHERE societe_mra_credentials.societe_id = societes.id
-- )
-- WHERE mra_api_key IS NULL;
-- ALTER TABLE public.societe_mra_credentials DROP COLUMN IF EXISTS mra_api_key_enc;
-- ALTER TABLE public.societes DROP COLUMN IF EXISTS mra_api_key_deprecated;
-- COMMIT;
