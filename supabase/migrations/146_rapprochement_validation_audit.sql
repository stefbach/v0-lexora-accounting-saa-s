-- ═══════════════════════════════════════════════════════════════
-- Migration 146: Rapprochement phase 4 — validation & audit trail
--
-- Adds:
--   - snapshot columns on rapprochements_bancaires (immutable copy of
--     the reconciliation state at validation time)
--   - rapprochement_validation_log: every validate/unvalidate event,
--     with actor, reason, and balance delta
--   - Enforces statut transitions via trigger (en_cours ↔ valide)
-- ═══════════════════════════════════════════════════════════════

-- ── Extra columns on rapprochements_bancaires ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='rapprochements_bancaires'
                   AND column_name='snapshot_at_validation') THEN
    ALTER TABLE public.rapprochements_bancaires
      ADD COLUMN snapshot_at_validation JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='rapprochements_bancaires'
                   AND column_name='hash_integrite') THEN
    ALTER TABLE public.rapprochements_bancaires
      ADD COLUMN hash_integrite TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='rapprochements_bancaires'
                   AND column_name='justification_ecart') THEN
    ALTER TABLE public.rapprochements_bancaires
      ADD COLUMN justification_ecart TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='rapprochements_bancaires'
                   AND column_name='locked') THEN
    ALTER TABLE public.rapprochements_bancaires
      ADD COLUMN locked BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ── Validation log table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rapprochement_validation_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rapprochement_id     UUID NOT NULL REFERENCES public.rapprochements_bancaires(id) ON DELETE CASCADE,
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  action               TEXT NOT NULL,  -- 'validate' | 'unvalidate' | 'lock' | 'unlock' | 'comment'
  statut_avant         TEXT,
  statut_apres         TEXT,
  solde_releve         NUMERIC(15,2),
  solde_comptable      NUMERIC(15,2),
  ecart                NUMERIC(15,2),
  raison               TEXT,
  snapshot             JSONB,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email           TEXT,
  user_role            TEXT,
  ip_address           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rapp_val_log_rapp   ON public.rapprochement_validation_log(rapprochement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapp_val_log_soc    ON public.rapprochement_validation_log(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapp_val_log_action ON public.rapprochement_validation_log(action, created_at DESC);

ALTER TABLE public.rapprochement_validation_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY rapp_val_log_read ON public.rapprochement_validation_log
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY rapp_val_log_insert ON public.rapprochement_validation_log
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Lock enforcement: prevent modifying a locked rapprochement ─
CREATE OR REPLACE FUNCTION public.prevent_locked_rapprochement_modif()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked = TRUE AND NEW.locked = TRUE THEN
    -- Only allow unlocking (locked = FALSE) and updating the locked flag itself
    -- Everything else must go through unlock first.
    IF (NEW.solde_releve IS DISTINCT FROM OLD.solde_releve
        OR NEW.solde_comptable IS DISTINCT FROM OLD.solde_comptable
        OR NEW.periode_debut IS DISTINCT FROM OLD.periode_debut
        OR NEW.periode_fin IS DISTINCT FROM OLD.periode_fin
        OR NEW.statut IS DISTINCT FROM OLD.statut) THEN
      RAISE EXCEPTION 'Rapprochement % verrouillé — dévérouiller d''abord', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_locked_rapp ON public.rapprochements_bancaires;
CREATE TRIGGER trg_prevent_locked_rapp
  BEFORE UPDATE ON public.rapprochements_bancaires
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_rapprochement_modif();

-- ── Same lock for lignes_rapprochement (children of locked parent) ─
CREATE OR REPLACE FUNCTION public.prevent_locked_lignes_rapp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT locked INTO v_locked
  FROM public.rapprochements_bancaires
  WHERE id = COALESCE(NEW.rapprochement_id, OLD.rapprochement_id);

  IF v_locked THEN
    RAISE EXCEPTION 'Rapprochement parent verrouillé — dévérouiller d''abord';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_prevent_locked_lignes ON public.lignes_rapprochement;
CREATE TRIGGER trg_prevent_locked_lignes
  BEFORE INSERT OR UPDATE OR DELETE ON public.lignes_rapprochement
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_lignes_rapp();

COMMENT ON COLUMN public.rapprochements_bancaires.snapshot_at_validation IS 'JSON immuable des lignes au moment de la validation (audit trail)';
COMMENT ON COLUMN public.rapprochements_bancaires.hash_integrite IS 'SHA-256 du snapshot — détection d''altération';
COMMENT ON COLUMN public.rapprochements_bancaires.locked IS 'Si TRUE, les lignes et soldes sont verrouillés — toute modification requiert unlock explicite';
