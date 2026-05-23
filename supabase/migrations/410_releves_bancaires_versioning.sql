-- Migration 410 — Releves_bancaires versioning + supersede
--
-- Contexte : la mig 409 a ajouté un UNIQUE INDEX sur
--   (compte_bancaire_id, date_debut, date_fin) qui empêche désormais tout
--   ré-upload d'un même relevé. C'est trop restrictif : un user peut vouloir
--   ré-uploader pour corriger une extraction IA fautive, ou un bot Telegram
--   peut re-pousser après correction. Sans gestion, ça crashe en 23505.
--
-- Solution : versioning + supersede.
--   - Chaque relevé porte un `version` (1, 2, 3, …)
--   - Une seule version est ACTIVE à la fois (`superseded_by_id IS NULL`)
--   - Les anciennes versions restent en base (audit, rollback possible)
--   - L'UNIQUE INDEX devient partial : il ne s'applique qu'à la version active
--   - Une RPC `replace_releve_bancaire` gère l'upsert atomique avec
--     advisory lock pour serialiser les uploads concurrents (Web ↔ Telegram).
--
-- Comportement applicatif :
--   - 1er upload : version=1, active
--   - 2e upload (re-upload corrigé) :
--       INSERT v2 active
--       UPDATE v1 SET superseded_by_id=v2.id, superseded_at=NOW()
--       DELETE transactions_bancaires WHERE releve_id=v1.id
--         (les transactions sont re-extraites du transactions_json de v2)
--   - Queries existantes : `WHERE superseded_by_id IS NULL` ramène la v active
--
-- Prérequis : mig 408 (trigger fn_log_audit_trail INSERT→CREATE) appliquée,
--   sinon les INSERT déclenchés par la RPC tombent en 23514.

BEGIN;

-- ========================================================================
-- 1. Colonnes de versioning
-- ========================================================================

ALTER TABLE releves_bancaires
  ADD COLUMN IF NOT EXISTS version          INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID        NULL
    REFERENCES releves_bancaires(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by      UUID        NULL,
  ADD COLUMN IF NOT EXISTS upload_source    TEXT        NULL;

-- CHECK séparé pour pouvoir réutiliser dans futurs ALTER si besoin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'releves_bancaires_upload_source_check'
  ) THEN
    ALTER TABLE releves_bancaires
      ADD CONSTRAINT releves_bancaires_upload_source_check
      CHECK (upload_source IS NULL OR upload_source IN ('web','telegram','api','cron','manual'));
  END IF;
END $$;

COMMENT ON COLUMN releves_bancaires.version IS
  'Numéro de version du relevé pour ce (compte, période). Incrémenté à chaque ré-upload.';
COMMENT ON COLUMN releves_bancaires.superseded_by_id IS
  'Si NOT NULL, ce relevé a été remplacé par un autre (version plus récente). Sinon = version active.';
COMMENT ON COLUMN releves_bancaires.superseded_at IS
  'Timestamp du remplacement.';
COMMENT ON COLUMN releves_bancaires.uploaded_by IS
  'auth.users.id de qui a uploadé. NULL pour cron / Telegram (service role).';
COMMENT ON COLUMN releves_bancaires.upload_source IS
  'Source de l''upload : web / telegram / api / cron / manual.';

-- ========================================================================
-- 2. UNIQUE INDEX : remplacer mig 409 par version partielle (active only)
-- ========================================================================

DROP INDEX IF EXISTS releves_bancaires_compte_periode_uq;

CREATE UNIQUE INDEX IF NOT EXISTS releves_bancaires_active_periode_uq
ON releves_bancaires (compte_bancaire_id, date_debut, date_fin)
WHERE superseded_by_id IS NULL
  AND compte_bancaire_id IS NOT NULL
  AND date_debut         IS NOT NULL
  AND date_fin           IS NOT NULL;

COMMENT ON INDEX releves_bancaires_active_periode_uq IS
  'Empeche les doublons sur la version ACTIVE uniquement. Les anciennes versions (superseded_by_id NOT NULL) sont conservees pour audit.';

CREATE INDEX IF NOT EXISTS releves_bancaires_superseded_chain_idx
  ON releves_bancaires (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- ========================================================================
-- 3. RPC d'upsert atomique
-- ========================================================================

CREATE OR REPLACE FUNCTION public.replace_releve_bancaire(
  p_compte_bancaire_id    UUID,
  p_societe_id            UUID,
  p_periode               TEXT,
  p_date_debut            DATE,
  p_date_fin              DATE,
  p_solde_ouverture       NUMERIC,
  p_solde_cloture         NUMERIC,
  p_total_debits          NUMERIC,
  p_total_credits         NUMERIC,
  p_nb_transactions       INTEGER,
  p_ecart_solde           NUMERIC,
  p_document_id           UUID,
  p_transactions_json     JSONB,
  p_statut_rapprochement  TEXT,
  p_uploaded_by           UUID,
  p_upload_source         TEXT
)
RETURNS TABLE (releve_id UUID, version INTEGER, previous_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id      UUID;
  v_existing_version INTEGER;
  v_new_id           UUID;
  v_new_version      INTEGER;
BEGIN
  -- Serialize concurrent uploads pour le même triplet (compte, début, fin).
  -- pg_advisory_xact_lock est libéré automatiquement à la fin de la transaction.
  -- hashtext(text) → int4. On concatène pour clé.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_compte_bancaire_id::text || '|' || p_date_debut::text || '|' || p_date_fin::text)
  );

  -- Verrou ligne au cas où l'advisory lock soit contourné (autre code SQL externe)
  SELECT id, version INTO v_existing_id, v_existing_version
  FROM releves_bancaires
  WHERE compte_bancaire_id = p_compte_bancaire_id
    AND date_debut         = p_date_debut
    AND date_fin           = p_date_fin
    AND superseded_by_id IS NULL
  FOR UPDATE;

  v_new_version := COALESCE(v_existing_version, 0) + 1;

  -- Insert nouvelle version active
  INSERT INTO releves_bancaires (
    compte_bancaire_id, societe_id, periode,
    date_debut, date_fin,
    solde_ouverture, solde_cloture, total_debits, total_credits,
    nb_transactions, ecart_solde,
    document_id, transactions_json, statut_rapprochement,
    version, uploaded_by, upload_source
  ) VALUES (
    p_compte_bancaire_id, p_societe_id, p_periode,
    p_date_debut, p_date_fin,
    p_solde_ouverture, p_solde_cloture, p_total_debits, p_total_credits,
    p_nb_transactions, p_ecart_solde,
    p_document_id, p_transactions_json, p_statut_rapprochement,
    v_new_version, p_uploaded_by, p_upload_source
  ) RETURNING id INTO v_new_id;

  -- Supersede ancienne version + nettoyer ses transactions
  IF v_existing_id IS NOT NULL THEN
    UPDATE releves_bancaires
       SET superseded_by_id = v_new_id,
           superseded_at    = NOW()
     WHERE id = v_existing_id;

    -- Les transactions de l'ancienne version sont supprimées : elles seront
    -- re-extraites du nouveau transactions_json par le caller si besoin.
    DELETE FROM transactions_bancaires WHERE releve_id = v_existing_id;
  END IF;

  RETURN QUERY SELECT v_new_id, v_new_version, v_existing_id;
END;
$$;

COMMENT ON FUNCTION public.replace_releve_bancaire IS
  'Upsert atomique d''un releve bancaire avec versioning. Si une version active existe pour (compte_bancaire_id, date_debut, date_fin), elle est marquee superseded et une nouvelle version est creee. Gere la race condition via advisory_xact_lock. SECURITY DEFINER : appelable par n''importe quel role auth/anon.';

-- Permissions : appelable par les rôles applicatifs
GRANT EXECUTE ON FUNCTION public.replace_releve_bancaire(
  UUID, UUID, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  INTEGER, NUMERIC, UUID, JSONB, TEXT, UUID, TEXT
) TO authenticated, service_role;

COMMIT;
