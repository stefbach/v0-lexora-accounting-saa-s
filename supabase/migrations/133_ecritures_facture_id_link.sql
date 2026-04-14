-- ============================================================================
-- Migration 133 — ecritures_comptables.facture_id link + backfill
-- ============================================================================
--
-- Context: the rapprochement flow needs to auto-letter the ACH ecriture
-- (401 Fournisseurs) with the BNQ ecriture (512 Banque) as soon as a bank
-- transaction is matched to a facture. Doing that reliably requires a
-- direct, indexed FK from the ecriture back to its source facture.
--
-- IMPORTANT — schema shape (v1-compat layer introduced by migrations 120
-- and 126):
--   * ecritures_comptables_v2  = physical TABLE (source of truth)
--   * ecritures_comptables     = VIEW over v2 + INSTEAD OF triggers that
--                                translate old column names to new ones
--                                (compte → numero_compte, debit → debit_mur,
--                                 credit → credit_mur, piece_justificative →
--                                 ref_folio, …).
--
-- We therefore:
--   1. ADD COLUMN IF NOT EXISTS facture_id on the physical table
--      ecritures_comptables_v2 (NOT on the view).
--   2. Add the FK on (v2.facture_id) → factures(id) ON DELETE SET NULL.
--   3. Add a partial index on (v2.facture_id WHERE facture_id IS NOT NULL).
--   4. DROP + recreate the VIEW public.ecritures_comptables with the new
--      column exposed.
--   5. Recreate the INSTEAD OF INSERT trigger function so it pipes
--      NEW.facture_id into v2.
--   6. Recreate the INSTEAD OF UPDATE trigger function so it updates
--      v2.facture_id.
--   7. Back-fill v2.facture_id directly (two passes — by piece_justificative
--      as UUID, and by numero_piece = numero_facture scoped to the same
--      dossier, unique matches only).
--
-- Everything is idempotent (IF NOT EXISTS / DO blocks / CREATE OR REPLACE)
-- and safe to re-run on partially-applied environments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column on the PHYSICAL table
-- ----------------------------------------------------------------------------
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS facture_id UUID;

-- ----------------------------------------------------------------------------
-- 2. FK — use DO block (ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS
--    before PG 18)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ecritures_comptables_v2_facture_id_fkey'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD CONSTRAINT ecritures_comptables_v2_facture_id_fkey
      FOREIGN KEY (facture_id)
      REFERENCES public.factures(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Index (partial — only non-null rows)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_facture_id
  ON public.ecritures_comptables_v2(facture_id)
  WHERE facture_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Recreate the VIEW to expose facture_id
-- ----------------------------------------------------------------------------
-- Triggers are bound to the view, so dropping the view cascades them — we
-- recreate both view and triggers below.
DROP VIEW IF EXISTS public.ecritures_comptables CASCADE;

CREATE VIEW public.ecritures_comptables AS
SELECT
  v2.id,
  v2.dossier_id,
  v2.date_ecriture,
  v2.journal,
  v2.numero_piece,
  v2.numero_compte                     AS compte,
  v2.libelle,
  COALESCE(v2.debit_mur, 0)            AS debit,
  COALESCE(v2.credit_mur, 0)           AS credit,
  v2.ref_folio                         AS piece_justificative,
  v2.created_at,
  v2.societe_id,
  v2.nom_compte,
  v2.description,
  v2.document_id,
  v2.exercice,
  -- Lettrage
  v2.lettre,
  v2.date_lettrage,
  COALESCE(v2.lettrage_auto, FALSE)     AS lettrage_auto,
  -- Rapprochement link columns (migration 126)
  v2.rapproche_releve_id,
  v2.rapproche_transaction_idx,
  v2.rapproche_at,
  -- Direct link back to the facture (migration 133)
  v2.facture_id
FROM public.ecritures_comptables_v2 v2;

-- ----------------------------------------------------------------------------
-- 5. INSTEAD OF INSERT trigger — accept NEW.facture_id and pipe to v2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ecritures_comptables_insert_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_societe_id UUID;
BEGIN
  IF NEW.societe_id IS NULL AND NEW.dossier_id IS NOT NULL THEN
    SELECT societe_id INTO v_societe_id
    FROM public.dossiers WHERE id = NEW.dossier_id;
  ELSE
    v_societe_id := NEW.societe_id;
  END IF;

  INSERT INTO public.ecritures_comptables_v2 (
    id, societe_id, dossier_id, date_ecriture, journal,
    ref_folio, numero_piece, numero_compte, nom_compte, libelle, description,
    debit_mur, credit_mur, document_id, exercice, created_at,
    lettre, date_lettrage, lettrage_auto,
    rapproche_releve_id, rapproche_transaction_idx, rapproche_at,
    facture_id
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    v_societe_id,
    NEW.dossier_id,
    NEW.date_ecriture,
    NEW.journal,
    COALESCE(NEW.ref_folio, NEW.piece_justificative, NEW.numero_piece),
    NEW.numero_piece,
    NEW.compte,
    COALESCE(NEW.nom_compte,
      CASE WHEN NEW.compte LIKE '6%' THEN 'Charge'
           WHEN NEW.compte LIKE '7%' THEN 'Produit'
           WHEN NEW.compte LIKE '4%' THEN 'Tiers'
           WHEN NEW.compte LIKE '5%' THEN 'Tresorerie'
           ELSE NULL END
    ),
    NEW.libelle,
    COALESCE(NEW.description, NEW.libelle),
    COALESCE(NEW.debit, 0),
    COALESCE(NEW.credit, 0),
    NEW.document_id,
    COALESCE(NEW.exercice, TO_CHAR(NEW.date_ecriture, 'YYYY')),
    COALESCE(NEW.created_at, NOW()),
    NEW.lettre,
    NEW.date_lettrage,
    COALESCE(NEW.lettrage_auto, FALSE),
    NEW.rapproche_releve_id,
    NEW.rapproche_transaction_idx,
    NEW.rapproche_at,
    NEW.facture_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_insert_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_insert_trigger
  INSTEAD OF INSERT ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_insert_v1_compat();

-- ----------------------------------------------------------------------------
-- 6. INSTEAD OF UPDATE trigger — propagate facture_id changes to v2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ecritures_comptables_update_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ecritures_comptables_v2 SET
    dossier_id     = NEW.dossier_id,
    date_ecriture  = NEW.date_ecriture,
    journal        = NEW.journal,
    numero_piece   = NEW.numero_piece,
    numero_compte  = NEW.compte,
    libelle        = NEW.libelle,
    debit_mur      = COALESCE(NEW.debit, 0),
    credit_mur     = COALESCE(NEW.credit, 0),
    ref_folio      = NEW.piece_justificative,
    societe_id     = COALESCE(NEW.societe_id, (SELECT societe_id FROM public.ecritures_comptables_v2 WHERE id = OLD.id)),
    nom_compte     = NEW.nom_compte,
    description    = NEW.description,
    document_id    = NEW.document_id,
    exercice       = NEW.exercice,
    lettre         = NEW.lettre,
    date_lettrage  = NEW.date_lettrage,
    lettrage_auto  = COALESCE(NEW.lettrage_auto, FALSE),
    rapproche_releve_id       = NEW.rapproche_releve_id,
    rapproche_transaction_idx = NEW.rapproche_transaction_idx,
    rapproche_at              = NEW.rapproche_at,
    facture_id                = NEW.facture_id
  WHERE id = OLD.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_update_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_update_trigger
  INSTEAD OF UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_update_v1_compat();

-- ----------------------------------------------------------------------------
-- 7. INSTEAD OF DELETE trigger — unchanged, but must be re-created after
--    the CASCADE dropped it along with the view.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ecritures_comptables_delete_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.ecritures_comptables_v2 WHERE id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_delete_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_delete_trigger
  INSTEAD OF DELETE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_delete_v1_compat();

-- ----------------------------------------------------------------------------
-- 8a. Back-fill via piece_justificative parsed as UUID (ref_folio on v2,
--     aliased as piece_justificative on the view).
-- ----------------------------------------------------------------------------
UPDATE public.ecritures_comptables_v2 v2
SET facture_id = f.id
FROM public.factures f
WHERE v2.facture_id IS NULL
  AND v2.ref_folio IS NOT NULL
  AND v2.ref_folio ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND v2.ref_folio::uuid = f.id;

-- ----------------------------------------------------------------------------
-- 8b. Back-fill via numero_piece = numero_facture, scoped to the same
--     dossier/societe, only when exactly one facture matches.
-- ----------------------------------------------------------------------------
WITH unique_matches AS (
  SELECT v2.id AS ecriture_id, f.id AS facture_id_match
  FROM public.ecritures_comptables_v2 v2
  JOIN public.dossiers d ON d.id = v2.dossier_id
  JOIN public.factures f ON
       f.societe_id = d.societe_id
    AND NULLIF(trim(f.numero_facture), '') IS NOT NULL
    AND NULLIF(trim(v2.numero_piece), '') IS NOT NULL
    AND trim(f.numero_facture) = trim(v2.numero_piece)
  WHERE v2.facture_id IS NULL
  GROUP BY v2.id, f.id
  HAVING COUNT(*) = 1
)
UPDATE public.ecritures_comptables_v2 v2
SET facture_id = um.facture_id_match
FROM unique_matches um
WHERE v2.id = um.ecriture_id;

-- ----------------------------------------------------------------------------
-- Documentation
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.ecritures_comptables_v2.facture_id IS
  'Lien direct vers factures.id. Utilisé par le rapprochement (action=sync_lettrage)
   pour auto-lettrer une facture approuvée avec sa contrepartie BNQ sans
   dépendre de la similarité texte sur libelle/numero_piece. Nullable :
   les écritures de paie, charges sociales, frais bancaires, etc. n''ont pas
   de facture attachée.';
