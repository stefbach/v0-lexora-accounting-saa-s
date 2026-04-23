-- ============================================================
-- Migration 178 — Sprint DOC1
--
-- Module documents RH bidirectionnel (employé ↔ RH).
--
-- CONTEXTE WRA 2019 : justificatifs obligatoires pour plusieurs
-- types de congés (SL≥3j certificat médical, FML, SPC_*, JUR, INT,
-- CRT, MAT, PAT). Aujourd'hui Lexora n'offre aucun mécanisme de
-- stockage structuré. On crée une table dédiée + RLS + policies
-- Storage sur le bucket 'documents' existant (private).
--
-- BUCKET : bucket 'documents' (Supabase Storage) existant et privé,
-- on utilise un préfixe 'rh/' pour isoler ces documents des autres
-- (comptables, contrats juridiques, etc.).
--
-- PATH CONVENTION :
--   rh/{societe_id}/{employe_id}/{categorie}/{timestamp}_{filename_slug}
--
-- IDEMPOTENTE : IF NOT EXISTS, DROP POLICY IF EXISTS.
-- ============================================================

-- ─── 1. Table documents_rh ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents_rh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Catégorisation
  categorie TEXT NOT NULL,
  sous_categorie TEXT,

  -- Fichier
  nom_fichier_original TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  storage_bucket TEXT DEFAULT 'documents',
  mime_type TEXT NOT NULL,
  taille_octets INTEGER NOT NULL,

  -- Métadonnées
  description TEXT,
  uploade_par UUID REFERENCES auth.users(id),
  uploade_par_role TEXT,
  direction TEXT NOT NULL,

  -- Liaisons optionnelles
  lien_demande_conge_id UUID REFERENCES public.demandes_conges(id) ON DELETE SET NULL,
  lien_bulletin_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  lien_grossesse_id UUID REFERENCES public.grossesses_employees(id) ON DELETE SET NULL,

  -- Visibilité
  confidentiel_rh_only BOOLEAN DEFAULT FALSE,

  -- Tracking
  vu_par_destinataire_le TIMESTAMPTZ,
  archive BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contraintes (idempotentes via DO block).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_rh_categorie_check') THEN
    ALTER TABLE public.documents_rh ADD CONSTRAINT documents_rh_categorie_check
      CHECK (categorie IN (
        'certificat_medical', 'justificatif_conge', 'contrat', 'avenant',
        'fiche_paie', 'attestation_employeur', 'piece_identite',
        'note_rh', 'autre'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_rh_direction_check') THEN
    ALTER TABLE public.documents_rh ADD CONSTRAINT documents_rh_direction_check
      CHECK (direction IN ('employe_vers_rh', 'rh_vers_employe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_rh_taille_check') THEN
    ALTER TABLE public.documents_rh ADD CONSTRAINT documents_rh_taille_check
      CHECK (taille_octets > 0 AND taille_octets <= 10485760);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_rh_employe    ON public.documents_rh(employe_id);
CREATE INDEX IF NOT EXISTS idx_documents_rh_societe    ON public.documents_rh(societe_id);
CREATE INDEX IF NOT EXISTS idx_documents_rh_categorie  ON public.documents_rh(categorie);
CREATE INDEX IF NOT EXISTS idx_documents_rh_direction  ON public.documents_rh(direction);
CREATE INDEX IF NOT EXISTS idx_documents_rh_demande
  ON public.documents_rh(lien_demande_conge_id)
  WHERE lien_demande_conge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_rh_non_vus
  ON public.documents_rh(societe_id)
  WHERE vu_par_destinataire_le IS NULL AND archive = FALSE;

COMMENT ON TABLE public.documents_rh IS
  'DOC1 - Documents RH bidirectionnels (employé ↔ RH). Justificatifs WRA
   (certificat médical SL/FML/MAT, acte mariage/décès SPC, convocation
   JUR/INT/CRT, acte naissance PAT), contrats, avenants, attestations.
   storage_path = rh/{societe}/{employe}/{categorie}/{ts}_{file}.';

-- ─── 2. Trigger updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_documents_rh_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_documents_rh_updated_at ON public.documents_rh;
CREATE TRIGGER trg_documents_rh_updated_at
BEFORE UPDATE ON public.documents_rh
FOR EACH ROW EXECUTE FUNCTION public.trg_documents_rh_updated();

-- ─── 3. RLS sur documents_rh ─────────────────────────────────────────
ALTER TABLE public.documents_rh ENABLE ROW LEVEL SECURITY;

-- SELECT : self (sauf confidential_rh_only).
DROP POLICY IF EXISTS "documents_rh_select_self" ON public.documents_rh;
CREATE POLICY "documents_rh_select_self" ON public.documents_rh FOR SELECT
USING (
  employe_id IN (
    SELECT id FROM public.employes
    WHERE auth_user_id = auth.uid() OR email = auth.jwt() ->> 'email'
  )
  AND confidentiel_rh_only = FALSE
);

-- SELECT : admin/rh voient tout (la restriction par société sera faite
-- côté API via user_societes ou profiles.societe_id — ici on garde large
-- pour laisser la logique applicative gérer les multi-sociétés).
DROP POLICY IF EXISTS "documents_rh_select_rh" ON public.documents_rh;
CREATE POLICY "documents_rh_select_rh" ON public.documents_rh FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')
  )
);

-- INSERT : employé peut créer UNIQUEMENT ses propres docs direction=employe_vers_rh.
DROP POLICY IF EXISTS "documents_rh_insert_self" ON public.documents_rh;
CREATE POLICY "documents_rh_insert_self" ON public.documents_rh FOR INSERT
WITH CHECK (
  employe_id IN (
    SELECT id FROM public.employes
    WHERE auth_user_id = auth.uid() OR email = auth.jwt() ->> 'email'
  )
  AND direction = 'employe_vers_rh'
  AND confidentiel_rh_only = FALSE
);

-- INSERT : RH/admin direction libre.
DROP POLICY IF EXISTS "documents_rh_insert_rh" ON public.documents_rh;
CREATE POLICY "documents_rh_insert_rh" ON public.documents_rh FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')
  )
);

-- UPDATE : RH/admin uniquement (employé ne peut pas modifier après upload).
DROP POLICY IF EXISTS "documents_rh_update_rh" ON public.documents_rh;
CREATE POLICY "documents_rh_update_rh" ON public.documents_rh FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')
  )
);

-- DELETE : RH/admin uniquement.
DROP POLICY IF EXISTS "documents_rh_delete_rh" ON public.documents_rh;
CREATE POLICY "documents_rh_delete_rh" ON public.documents_rh FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')
  )
);

-- ─── 4. Storage policies sur bucket 'documents' préfixe 'rh/' ───────
-- Note : les routes API utilisent service_role pour upload/delete (bypass
-- RLS Storage), mais on met aussi des policies pour un éventuel accès
-- direct côté client. La validation de qui accède à quoi est faite via
-- les RLS de la table documents_rh (jointure storage_path = name).

DROP POLICY IF EXISTS "rh_storage_select" ON storage.objects;
CREATE POLICY "rh_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND name LIKE 'rh/%'
  AND EXISTS (
    SELECT 1 FROM public.documents_rh dr
    WHERE dr.storage_path = storage.objects.name
  )
);

DROP POLICY IF EXISTS "rh_storage_insert" ON storage.objects;
CREATE POLICY "rh_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND name LIKE 'rh/%'
);

DROP POLICY IF EXISTS "rh_storage_delete" ON storage.objects;
CREATE POLICY "rh_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND name LIKE 'rh/%'
  AND EXISTS (
    SELECT 1 FROM public.documents_rh dr
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE dr.storage_path = storage.objects.name
      AND p.role IN ('admin', 'rh')
  )
);
