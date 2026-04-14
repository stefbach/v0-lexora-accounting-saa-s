-- ============================================================================
-- Migration 133 — ecritures_comptables.facture_id link + backfill
-- ============================================================================
--
-- Context: the rapprochement flow needs to auto-letter the ACH ecriture
-- (401 Fournisseurs) with the BNQ ecriture (512 Banque) as soon as a bank
-- transaction is matched to a facture. Doing that reliably requires a
-- direct, indexed FK from the ecriture back to its source facture. The
-- existing `piece_justificative` text column is polymorphic (sometimes
-- holds a documents.id, sometimes a factures.id, sometimes free text) and
-- `numero_piece` is not unique, so matching on either produces false
-- positives at scale.
--
-- This migration:
--   1. Adds a nullable facture_id UUID column with FK on factures(id)
--      ON DELETE SET NULL (we don't want ecritures to disappear when a
--      facture is deleted — accountants want an audit trail).
--   2. Adds a partial index (only non-null rows).
--   3. Back-fills existing rows by two strategies:
--      a) piece_justificative matches a factures.id 1:1
--      b) numero_piece matches factures.numero_facture for the same
--         dossier/societe 1:1
--
-- Fully idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column + FK + index
-- ----------------------------------------------------------------------------
ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS facture_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ecritures_comptables_facture_id_fkey'
  ) THEN
    ALTER TABLE public.ecritures_comptables
      ADD CONSTRAINT ecritures_comptables_facture_id_fkey
      FOREIGN KEY (facture_id)
      REFERENCES public.factures(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_facture_id
  ON public.ecritures_comptables(facture_id)
  WHERE facture_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2a. Back-fill via piece_justificative (when it looks like a UUID and maps
--     cleanly to a factures row).
-- ----------------------------------------------------------------------------
UPDATE public.ecritures_comptables e
SET facture_id = f.id
FROM public.factures f
WHERE e.facture_id IS NULL
  AND e.piece_justificative IS NOT NULL
  AND e.piece_justificative ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND e.piece_justificative::uuid = f.id;

-- ----------------------------------------------------------------------------
-- 2b. Back-fill via numero_piece = numero_facture, scoped to the same dossier.
--     We join through dossiers to make sure we don't cross-link ecritures from
--     one société to factures of another. Only applies when exactly one
--     facture matches — ambiguous matches stay unset.
-- ----------------------------------------------------------------------------
WITH unique_matches AS (
  SELECT e.id AS ecriture_id, f.id AS facture_id_match
  FROM public.ecritures_comptables e
  JOIN public.dossiers d ON d.id = e.dossier_id
  JOIN public.factures f ON
       f.societe_id = d.societe_id
    AND NULLIF(trim(f.numero_facture), '') IS NOT NULL
    AND NULLIF(trim(e.numero_piece), '') IS NOT NULL
    AND trim(f.numero_facture) = trim(e.numero_piece)
  WHERE e.facture_id IS NULL
  GROUP BY e.id, f.id
  HAVING COUNT(*) = 1
)
UPDATE public.ecritures_comptables e
SET facture_id = um.facture_id_match
FROM unique_matches um
WHERE e.id = um.ecriture_id;

-- ----------------------------------------------------------------------------
-- Documentation
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.ecritures_comptables.facture_id IS
  'Lien direct vers factures.id. Utilisé par le rapprochement pour
   auto-lettrer une facture approuvée avec sa contrepartie BNQ sans
   dépendre de la similarité texte sur libelle/numero_piece.
   Nullable : les écritures de paie, charges sociales, frais bancaires,
   etc. n''ont pas de facture attachée.';
