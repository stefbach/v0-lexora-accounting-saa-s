-- ═══════════════════════════════════════════════════════════════
-- Migration 126: Rapprochement audit log + ecriture link
-- Provides traceability for every reconciliation action (lettrage,
-- delettrage, auto, multi-facture, pattern) and adds the ability
-- to link a bank transaction to an ecriture via an explicit column
-- instead of relying on transactions_json drift.
-- ═══════════════════════════════════════════════════════════════

-- ── Audit log table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rapprochement_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  -- 'lettrer_manuel' | 'lettrer_multi' | 'delettrer' | 'auto_rapprocher'
  -- 'apply_patterns' | 'learn_pattern' | 'smart_apply'
  releve_id        UUID REFERENCES public.releves_bancaires(id) ON DELETE SET NULL,
  transaction_idx  INTEGER,
  facture_ids      UUID[] DEFAULT '{}',
  ecriture_id      UUID,
  lettre_code      TEXT,
  montant          NUMERIC,
  devise           TEXT,
  confidence       NUMERIC,
  strategy         TEXT,
  reason           TEXT,
  before_state     JSONB,
  after_state      JSONB,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rapp_audit_societe ON public.rapprochement_audit_log(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapp_audit_releve  ON public.rapprochement_audit_log(releve_id, transaction_idx);
CREATE INDEX IF NOT EXISTS idx_rapp_audit_action  ON public.rapprochement_audit_log(action, created_at DESC);

ALTER TABLE public.rapprochement_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY rapp_audit_read ON public.rapprochement_audit_log
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY rapp_audit_insert ON public.rapprochement_audit_log
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Ecriture ↔ releve link ────────────────────────────────────
-- ecritures_comptables is a VIEW over ecritures_comptables_v2.
-- We must add columns to the REAL TABLE (v2), then recreate the
-- view to expose them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'rapproche_releve_id'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN rapproche_releve_id UUID REFERENCES public.releves_bancaires(id) ON DELETE SET NULL;
    RAISE NOTICE 'Migration 126: added rapproche_releve_id to ecritures_comptables_v2';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'rapproche_transaction_idx'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN rapproche_transaction_idx INTEGER;
    RAISE NOTICE 'Migration 126: added rapproche_transaction_idx to ecritures_comptables_v2';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ecritures_comptables_v2'
      AND column_name  = 'rapproche_at'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN rapproche_at TIMESTAMPTZ;
    RAISE NOTICE 'Migration 126: added rapproche_at to ecritures_comptables_v2';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_rapproche_releve
  ON public.ecritures_comptables_v2(rapproche_releve_id, rapproche_transaction_idx);

-- Recreate the VIEW to include the new columns
DROP VIEW IF EXISTS public.ecritures_comptables;

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
  -- Lettrage columns
  v2.lettre,
  v2.date_lettrage,
  COALESCE(v2.lettrage_auto, FALSE)     AS lettrage_auto,
  -- Rapprochement link columns (new in migration 126)
  v2.rapproche_releve_id,
  v2.rapproche_transaction_idx,
  v2.rapproche_at
FROM public.ecritures_comptables_v2 v2;

-- Recreate the INSTEAD OF INSERT trigger — preserving the v1_compat smart logic
-- from migration 122, but adding the 3 new rapproche columns.
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
    rapproche_releve_id, rapproche_transaction_idx, rapproche_at
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
    NEW.rapproche_at
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_insert_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_insert_trigger
  INSTEAD OF INSERT ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_insert_v1_compat();

-- Recreate the INSTEAD OF UPDATE trigger — same pattern, add new columns
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
    rapproche_at              = NEW.rapproche_at
  WHERE id = OLD.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecritures_comptables_update_trigger ON public.ecritures_comptables;
CREATE TRIGGER ecritures_comptables_update_trigger
  INSTEAD OF UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.ecritures_comptables_update_v1_compat();

-- Recreate the INSTEAD OF DELETE trigger (unchanged, but must be re-created after VIEW DROP)
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

COMMENT ON COLUMN public.ecritures_comptables_v2.rapproche_releve_id IS 'Transaction bancaire qui a lettré cette écriture (sync avec releves_bancaires.transactions_json[idx].ecriture_id)';
