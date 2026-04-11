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
-- Mirror of the facture.rapproche_* pattern: lets us know which
-- bank transaction lettered a given ecriture without grep'ing the
-- transactions_json blob.
ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS rapproche_releve_id        UUID REFERENCES public.releves_bancaires(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rapproche_transaction_idx  INTEGER,
  ADD COLUMN IF NOT EXISTS rapproche_at               TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ecritures_rapproche_releve
  ON public.ecritures_comptables(rapproche_releve_id, rapproche_transaction_idx);

COMMENT ON TABLE  public.rapprochement_audit_log IS 'Journal d''audit complet des actions de rapprochement bancaire';
COMMENT ON COLUMN public.ecritures_comptables.rapproche_releve_id IS 'Transaction bancaire qui a lettré cette écriture (sync avec releves_bancaires.transactions_json[idx].ecriture_id)';
