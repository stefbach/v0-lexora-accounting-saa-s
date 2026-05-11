-- ═══════════════════════════════════════════════════════════════════════
-- Migration 242: Bucket Supabase Storage `societes-logos`
--
-- Stocke les logos d'entreprise affichés en tête des factures (PDF) et
-- dans les UIs Lexora. Bucket public car les logos sont déjà visibles
-- sur les factures imprimées et n'ont pas de caractère confidentiel.
--
-- La colonne factures.logo_url existait déjà (mig 042) mais n'était
-- alimentée que par une data URL localStorage. Cette migration prépare
-- la persistance en Storage : les routes API uploadent dans
-- `societes-logos/<societe_id>/<filename>` et écrivent l'URL publique
-- dans societes.logo_url (colonne déjà présente).
--
-- Limites côté API :
--   • taille max 2 MB (vérification côté route)
--   • MIME image/png | image/jpeg | image/webp | image/svg+xml
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('societes-logos', 'societes-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Lecture publique (PDF, navigateurs, mails de relance)
DROP POLICY IF EXISTS "societes_logos_public_read" ON storage.objects;
CREATE POLICY "societes_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'societes-logos');

-- Upload / update / delete : service role uniquement.
-- Les routes API (/api/client/societes/[id]/logo) valident l'accès au
-- societe_id avant d'écrire/supprimer. On ne s'appuie pas sur le path
-- pour la sécurité car les UUIDs Supabase ne peuvent pas être validés
-- via storage.objects sans jointure complexe.
DROP POLICY IF EXISTS "societes_logos_service_write" ON storage.objects;
CREATE POLICY "societes_logos_service_write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'societes-logos' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'societes-logos' AND auth.role() = 'service_role');
