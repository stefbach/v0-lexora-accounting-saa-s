-- ============================================================================
-- Migration 134 — factures.facture_origine_id : lien avoir → facture d'origine
-- ============================================================================
--
-- Contexte (FIX 7) : un avoir (type_document='avoir') doit impérativement
-- rester dans le même groupe de lettrage que la facture qu'il annule,
-- sinon le tiers 401/411 ne se solde pas même si comptablement la créance
-- nette est à zéro.
--
-- On ajoute :
--   1. Colonne facture_origine_id UUID (nullable — un avoir peut être
--      autonome pour d'autres raisons : avoir commercial non rattaché,
--      régularisation…).
--   2. FK vers factures(id) ON DELETE SET NULL — si la facture d'origine
--      est supprimée, on ne perd pas l'avoir.
--   3. Index partiel sur les lignes où facture_origine_id IS NOT NULL
--      (majorité des factures n'auront PAS cette valeur).
--   4. CHECK : facture_origine_id ne peut être rempli que si
--      type_document = 'avoir'. Empêche les confusions futures.
--
-- Idempotent : IF NOT EXISTS + DO block pour la FK et la contrainte.
-- ============================================================================

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS facture_origine_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_facture_origine_id_fkey'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_facture_origine_id_fkey
      FOREIGN KEY (facture_origine_id)
      REFERENCES public.factures(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_factures_facture_origine_id
  ON public.factures(facture_origine_id)
  WHERE facture_origine_id IS NOT NULL;

-- CHECK : seul un avoir peut pointer vers une facture d'origine.
-- On ne peut pas ajouter une contrainte IF NOT EXISTS avant PG 18 — on
-- utilise un DO block pour tester pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_avoir_origine_coherence'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_avoir_origine_coherence
      CHECK (
        facture_origine_id IS NULL
        OR type_document = 'avoir'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.factures.facture_origine_id IS
  'Pour un avoir (type_document=''avoir''), référence UUID de la facture
   d''origine annulée/créditée. Nullable : certains avoirs sont autonomes
   (avoir commercial sans facture initiale connue). Utilisé par sync_lettrage
   pour garantir que la facture et son avoir partagent la même lettre
   (FIX 7 — évite les soldes 401/411 faussés).';
