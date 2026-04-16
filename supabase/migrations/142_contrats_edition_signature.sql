-- ============================================================================
-- Migration 142 — contrats_employes : édition + signature dirigeant
-- ============================================================================
--
-- Sprint 5 AMÉLIO F — ajoute les colonnes nécessaires pour :
--   1. Édition du contrat généré (éditeur riche TipTap côté RH)
--   2. Nom du dirigeant affiché sur le contrat
--   3. Image de la signature du dirigeant (upload)
--
-- Le flux de signature côté employé (token-based, statut signe_employe
-- → signe) existe déjà via /api/rh/contrats/[id]/signer — cette migration
-- ne le modifie pas.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS sur chaque colonne.
-- ============================================================================

ALTER TABLE public.contrats_employes
  ADD COLUMN IF NOT EXISTS html_content_modified TEXT,
  ADD COLUMN IF NOT EXISTS signature_nom_complet TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_dirigeant_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.contrats_employes.html_content_modified IS
  'HTML édité par les RH (remplace html_content pour l''affichage/signature).
   NULL si le contrat généré n''a jamais été modifié.';

COMMENT ON COLUMN public.contrats_employes.signature_nom_complet IS
  'Nom complet du dirigeant/signataire affiché sur le contrat
   (ex. "Stephane BACH, CEO"). Utilisé comme label sous la signature.';

COMMENT ON COLUMN public.contrats_employes.signature_image_dirigeant_url IS
  'URL (Supabase Storage ou data URI) de l''image de la signature
   manuscrite du dirigeant. Rendue dans le bloc signature du contrat.';

-- Trigger pour auto-update updated_at à chaque UPDATE.
CREATE OR REPLACE FUNCTION public.update_contrats_employes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contrats_employes_updated_at ON public.contrats_employes;
CREATE TRIGGER contrats_employes_updated_at
  BEFORE UPDATE ON public.contrats_employes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contrats_employes_timestamp();
