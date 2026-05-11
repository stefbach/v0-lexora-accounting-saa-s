-- ═══════════════════════════════════════════════════════════════════════
-- Migration 242: Bucket Supabase Storage `societes-logos`
--
-- Stocke les logos d'entreprise affichés en tête des factures (PDF) et
-- dans les UIs Lexora. Bucket public car les logos sont déjà visibles
-- sur les factures imprimées et n'ont pas de caractère confidentiel.
--
-- La colonne `societes.logo_url` est censée exister depuis la mig 046,
-- mais on la (re)crée défensivement en IF NOT EXISTS au cas où la
-- mig 046 n'aurait pas été appliquée sur certains environnements.
-- À la fin on force PostgREST à recharger son schema cache, sinon les
-- routes API tombent sur "Could not find the 'logo_url' column".
--
-- Limites côté API :
--   • taille max 2 MB (vérification côté route)
--   • MIME image/png | image/jpeg | image/webp | image/svg+xml
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Colonne logo_url (défensif — devrait déjà exister via mig 046) ──
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ── 2. Bucket public ───────────────────────────────────────────────────
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

-- ── 3. Force PostgREST à recharger le schema cache ─────────────────────
-- Sans ça, l'erreur "Could not find the 'logo_url' column of 'societes'
-- in the schema cache" apparaît jusqu'au prochain redémarrage de Supabase.
NOTIFY pgrst, 'reload schema';

