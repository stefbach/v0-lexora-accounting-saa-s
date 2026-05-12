-- ═══════════════════════════════════════════════════════════════════════
-- Migration 244: Enrichissement tiers_annuaire avec coordonnées
--
-- Avant : tiers_annuaire (mig 128) ne stockait que nom + BRN + VAT.
-- Quand l'OCR extrayait une facture fournisseur, on perdait email,
-- téléphone et adresse pourtant lisibles sur le document.
--
-- Conséquence : l'import "base clients existante" vers factures_contacts
-- (PR #64) ne pouvait remplir QUE le nom — l'utilisateur devait ensuite
-- ressaisir email/tel/adresse manuellement.
--
-- Cette migration ajoute ces 3 colonnes. La fonction createTiersFromOcr
-- (lib/tiers-annuaire.ts) sera mise à jour pour les persister, et le
-- prompt OCR (app/api/documents/upload/route.ts) demandera à Claude de
-- les extraire systématiquement.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.tiers_annuaire
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS adresse   TEXT;

COMMENT ON COLUMN public.tiers_annuaire.email     IS 'Email du tiers extrait par OCR ou saisi manuellement. Source unique de vérité pour le pré-remplissage factures_contacts.';
COMMENT ON COLUMN public.tiers_annuaire.telephone IS 'Téléphone du tiers (format libre). Extrait par OCR si présent sur la facture scannée.';
COMMENT ON COLUMN public.tiers_annuaire.adresse   IS 'Adresse postale du tiers (multi-lignes possibles). Extraite par OCR à partir de l''en-tête facture.';

-- Index pour la recherche email (utile pour autocomplete dans factures)
CREATE INDEX IF NOT EXISTS idx_tiers_annuaire_email
  ON public.tiers_annuaire(lower(email))
  WHERE email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
