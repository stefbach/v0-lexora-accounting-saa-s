-- ═══════════════════════════════════════════════════════════════
-- Migration 122: Fix lettrage trigger + VIEW columns
--
-- Problem: migration 120 created the UPDATE trigger on ecritures_comptables
--   (which is now a VIEW over ecritures_comptables_v2) but forgot to map
--   the lettrage columns:
--     lettre, date_lettrage, lettrage_auto
--   So any UPDATE that sets these columns (e.g. bank reconciliation) silently
--   dropped them → the Grand Livre never reflected the lettrage.
--
-- Solution:
--   1. Add lettre, date_lettrage, lettrage_auto columns to ecritures_comptables_v2
--      if they don't exist yet.
--   2. Recreate the VIEW to expose those columns.
--   3. Fix the UPDATE trigger to propagate all three columns.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add missing columns to ecritures_comptables_v2 (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'lettre'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN lettre TEXT DEFAULT NULL;
    RAISE NOTICE 'Migration 122: added column lettre to ecritures_comptables_v2';
  ELSE
    RAISE NOTICE 'Migration 122: lettre already exists in ecritures_comptables_v2';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'date_lettrage'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN date_lettrage DATE DEFAULT NULL;
    RAISE NOTICE 'Migration 122: added column date_lettrage to ecritures_comptables_v2';
  ELSE
    RAISE NOTICE 'Migration 122: date_lettrage already exists in ecritures_comptables_v2';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'lettrage_auto'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN lettrage_auto BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Migration 122: added column lettrage_auto to ecritures_comptables_v2';
  ELSE
    RAISE NOTICE 'Migration 122: lettrage_auto already exists in ecritures_comptables_v2';
  END IF;
END $$;

-- Step 2: Recreate the VIEW to include the new columns
-- (DROP + recreate to avoid column ordering issues)
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
  -- Lettrage columns (newly exposed)
  v2.lettre,
  v2.date_lettrage,
  COALESCE(v2.lettrage_auto, FALSE)     AS lettrage_auto
FROM public.ecritures_comptables_v2 v2;

-- Step 3: Recreate all four INSTEAD OF triggers on the view
--   (they were dropped with the CASCADE above)

-- ── INSERT trigger ───────────────────────────────────────────────
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
    lettre, date_lettrage, lettrage_auto
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
    COALESCE(NEW.lettrage_auto, FALSE)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_insert_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_insert_trigger
  INSTEAD OF INSERT ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_insert_v1_compat();

-- ── UPDATE trigger (FIXED: now propagates lettre, date_lettrage, lettrage_auto) ──
CREATE OR REPLACE FUNCTION public.ecritures_comptables_update_v1_compat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ecritures_comptables_v2
  SET
    dossier_id     = NEW.dossier_id,
    date_ecriture  = NEW.date_ecriture,
    journal        = NEW.journal,
    numero_piece   = NEW.numero_piece,
    numero_compte  = NEW.compte,
    libelle        = NEW.libelle,
    debit_mur      = COALESCE(NEW.debit, 0),
    credit_mur     = COALESCE(NEW.credit, 0),
    ref_folio      = COALESCE(NEW.ref_folio, NEW.piece_justificative, NEW.numero_piece),
    -- Lettrage columns — THE FIX: these were missing in migration 120
    lettre         = NEW.lettre,
    date_lettrage  = NEW.date_lettrage,
    lettrage_auto  = COALESCE(NEW.lettrage_auto, FALSE)
  WHERE id = OLD.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_update_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_update_trigger
  INSTEAD OF UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_update_v1_compat();

-- ── DELETE trigger ───────────────────────────────────────────────
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

-- Done
DO $$
BEGIN
  RAISE NOTICE 'Migration 122: lettrage trigger fix applied — lettre, date_lettrage, lettrage_auto now propagate correctly via the v1 compat triggers.';
END $$;
