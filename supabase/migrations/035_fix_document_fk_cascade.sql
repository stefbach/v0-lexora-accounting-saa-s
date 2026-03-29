-- ============================================================
-- Migration 035: Add ON DELETE CASCADE to document FK references
-- ============================================================
-- Fix: deleting a document fails due to FK constraints without CASCADE

-- releves_bancaires.document_id
ALTER TABLE public.releves_bancaires DROP CONSTRAINT IF EXISTS releves_bancaires_document_id_fkey;
ALTER TABLE public.releves_bancaires ADD CONSTRAINT releves_bancaires_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- factures.document_id
ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_document_id_fkey;
ALTER TABLE public.factures ADD CONSTRAINT factures_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- ecritures_comptables_v2.document_id
ALTER TABLE public.ecritures_comptables_v2 DROP CONSTRAINT IF EXISTS ecritures_comptables_v2_document_id_fkey;
ALTER TABLE public.ecritures_comptables_v2 ADD CONSTRAINT ecritures_comptables_v2_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- transactions_bancaires.document_lie_id
ALTER TABLE public.transactions_bancaires DROP CONSTRAINT IF EXISTS transactions_bancaires_document_lie_id_fkey;
ALTER TABLE public.transactions_bancaires ADD CONSTRAINT transactions_bancaires_document_lie_id_fkey
  FOREIGN KEY (document_lie_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- immobilisations.document_id (if exists)
DO $$ BEGIN
  ALTER TABLE public.immobilisations DROP CONSTRAINT IF EXISTS immobilisations_document_id_fkey;
  ALTER TABLE public.immobilisations ADD CONSTRAINT immobilisations_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- depenses.document_id (if exists)
DO $$ BEGIN
  ALTER TABLE public.depenses DROP CONSTRAINT IF EXISTS depenses_document_id_fkey;
  ALTER TABLE public.depenses ADD CONSTRAINT depenses_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
