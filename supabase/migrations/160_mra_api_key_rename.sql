-- ============================================================================
-- Migration 160: honest naming for MRA API key storage
-- ============================================================================
-- Renommage de mra_api_key_encrypted → mra_api_key_secret
--
-- La colonne stockait en clair malgré son nom "encrypted" — risque de fuite
-- en logs/backups. Renommage pour refléter la réalité : secret en clair,
-- à chiffrer au niveau app (lib/crypto) quand implémenté.
--
-- Les callers doivent être mis à jour pour lire/écrire mra_api_key_secret.
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_settings'
      AND column_name = 'mra_api_key_encrypted'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_settings'
      AND column_name = 'mra_api_key_secret'
  ) THEN
    ALTER TABLE public.invoice_settings
      RENAME COLUMN mra_api_key_encrypted TO mra_api_key_secret;
  END IF;
END $$;

COMMENT ON COLUMN public.invoice_settings.mra_api_key_secret IS
  'Clé API MRA stockée en clair (secret applicatif). À chiffrer au niveau app via lib/crypto — TODO. Ne jamais logger.';
