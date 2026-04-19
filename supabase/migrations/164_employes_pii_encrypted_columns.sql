-- ============================================================================
-- Migration 164: PII encryption for employees (DPA 2017 Maurice compliance)
-- ============================================================================
-- Ajoute des colonnes _encrypted pour les données sensibles (NIC, NPF, IBAN,
-- bank_account). Les colonnes existantes (clear text) restent pour migration
-- progressive : l'application doit écrire dans _encrypted, puis éventuellement
-- effacer les colonnes clear après vérification.
--
-- Stratégie : dual-write app-side pendant une période, puis purge via migration
-- finale une fois tout lu depuis _encrypted.
-- ============================================================================

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS nic_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS npf_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS iban_encrypted TEXT;

COMMENT ON COLUMN public.employes.nic_number_encrypted IS
  'NIC chiffré AES-256-GCM via lib/crypto/pii.ts. Format: v1:iv_b64:tag_b64:cipher_b64. À lire via decryptPii().';
COMMENT ON COLUMN public.employes.npf_number_encrypted IS
  'NPF chiffré AES-256-GCM. Même format que nic_number_encrypted.';
COMMENT ON COLUMN public.employes.bank_account_encrypted IS
  'Bank account chiffré AES-256-GCM.';
COMMENT ON COLUMN public.employes.iban_encrypted IS
  'IBAN chiffré AES-256-GCM.';

-- Index sur les champs chiffrés n'est PAS possible (chaque ciphertext est unique).
-- Si recherche par NIC nécessaire, prévoir une colonne nic_hash (SHA-256) en sus.

-- Note : audit log d'accès à ces colonnes devrait être ajouté dans un trigger séparé.
