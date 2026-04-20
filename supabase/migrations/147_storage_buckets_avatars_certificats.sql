-- ============================================================
-- Migration 147 — Buckets de stockage pour espace salarié
--   - avatars : photos employés (public)
--   - conges-certificats : certificats médicaux SL > 3j (privé)
-- Idempotent : ON CONFLICT + DROP POLICY IF EXISTS.
-- ============================================================

-- Bucket public 'avatars' : photos de profil employés. Taille max 2MB
-- gérée côté API. Public pour affichage direct dans l'espace salarié.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Bucket privé 'conges-certificats' : certificats médicaux. URL signée
-- obligatoire pour consultation (voir GET /api/rh/conges/[id]/certificat).
INSERT INTO storage.buckets (id, name, public)
VALUES ('conges-certificats', 'conges-certificats', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Policies avatars : lecture publique, upload authentifié.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_upload" ON storage.objects;
CREATE POLICY "avatars_auth_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Policies conges-certificats : service role uniquement (les API routes
-- utilisent la service role key, les clients n'accèdent jamais au bucket
-- directement — toujours via GET /api/rh/conges/[id]/certificat).
DROP POLICY IF EXISTS "certificats_service_only" ON storage.objects;
CREATE POLICY "certificats_service_only"
  ON storage.objects FOR ALL
  USING (bucket_id = 'conges-certificats' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'conges-certificats' AND auth.role() = 'service_role');
