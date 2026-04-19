-- ============================================================================
-- Migration 150: Audit trail du lettrage
-- ============================================================================
-- Trace toute modification de la colonne lettre sur ecritures_comptables_v2 :
-- qui a lettré / déletré, quand, pour quelle écriture, ancien/nouveau code.
-- Utilisé pour audit légal, détection fraude, debug.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lettres_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id UUID NOT NULL,
  societe_id UUID,
  numero_compte TEXT,
  ancien_code VARCHAR(10),
  nouveau_code VARCHAR(10),
  action TEXT NOT NULL CHECK (action IN ('lettre', 'delettre', 'modifie')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raison TEXT,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lettres_ops_ecriture ON lettres_operations(ecriture_id);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_societe ON lettres_operations(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_user ON lettres_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_code ON lettres_operations(nouveau_code) WHERE nouveau_code IS NOT NULL;

COMMENT ON TABLE lettres_operations IS 'Audit trail exhaustif des opérations de lettrage (lettre/délétrage) sur ecritures_comptables_v2';
COMMENT ON COLUMN lettres_operations.action IS 'lettre=pose d''un code, delettre=retrait, modifie=changement';
COMMENT ON COLUMN lettres_operations.is_auto IS 'true si posé par rapprochement bancaire ou auto-lettrage, false si comptable manuel';

-- ============================================================================
-- Trigger fonction : logger toute modification de lettre
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_log_lettre_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_is_auto BOOLEAN;
BEGIN
  -- Récupérer l'utilisateur courant (peut être NULL si trigger déclenché par service role)
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Déterminer l'action
  IF TG_OP = 'INSERT' THEN
    IF NEW.lettre IS NOT NULL THEN
      v_action := 'lettre';
    ELSE
      RETURN NEW;  -- pas de lettre à logger à l'INSERT
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lettre IS DISTINCT FROM NEW.lettre THEN
      IF OLD.lettre IS NULL AND NEW.lettre IS NOT NULL THEN
        v_action := 'lettre';
      ELSIF OLD.lettre IS NOT NULL AND NEW.lettre IS NULL THEN
        v_action := 'delettre';
      ELSE
        v_action := 'modifie';
      END IF;
    ELSE
      RETURN NEW;  -- lettre non modifiée
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_is_auto := COALESCE(NEW.lettrage_auto, FALSE);

  INSERT INTO lettres_operations (
    ecriture_id, societe_id, numero_compte,
    ancien_code, nouveau_code, action, user_id, is_auto
  ) VALUES (
    NEW.id, NEW.societe_id, NEW.numero_compte,
    OLD.lettre, NEW.lettre, v_action, v_user_id, v_is_auto
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais faire échouer l'update à cause du trigger audit
  RAISE WARNING '[fn_log_lettre_change] audit failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Attacher le trigger à ecritures_comptables_v2
-- ============================================================================

DROP TRIGGER IF EXISTS trg_log_lettre_change ON ecritures_comptables_v2;

CREATE TRIGGER trg_log_lettre_change
AFTER INSERT OR UPDATE OF lettre ON ecritures_comptables_v2
FOR EACH ROW
EXECUTE FUNCTION fn_log_lettre_change();

-- ============================================================================
-- RLS pour la table d'audit (lecture seule pour comptable + admin)
-- ============================================================================

ALTER TABLE lettres_operations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lettres_operations' AND policyname = 'lettres_ops_select'
  ) THEN
    CREATE POLICY lettres_ops_select ON lettres_operations
      FOR SELECT TO authenticated
      USING (true);  -- Wave ultérieure : restreindre par societe_id via user_societes
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lettres_operations' AND policyname = 'lettres_ops_no_user_write'
  ) THEN
    -- Personne ne peut écrire directement — seul le trigger (SECURITY DEFINER) le fait
    CREATE POLICY lettres_ops_no_user_write ON lettres_operations
      FOR ALL TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
