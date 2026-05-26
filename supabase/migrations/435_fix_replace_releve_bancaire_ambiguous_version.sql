-- Migration 435 — Fix replace_releve_bancaire: column reference "version" is ambiguous
--
-- Bug : la mig 410 a créé la RPC `replace_releve_bancaire` avec
--   `RETURNS TABLE (releve_id UUID, version INTEGER, previous_id UUID)`,
--   ce qui définit une variable PL/pgSQL implicite `version`. Mais la même
--   migration ajoute aussi une colonne `version` sur `releves_bancaires`.
--   Conséquence : dès que la fonction fait
--     SELECT id, version FROM releves_bancaires ... FOR UPDATE
--   Postgres ne sait pas si `version` est la variable OUT ou la colonne, et
--   lève 42702 : "column reference \"version\" is ambiguous".
--
-- Effet observé : toute tentative d'insertion d'un relevé (Web upload OU
--   pipeline Telegram via lib/bank/process-releve.ts) plante. Le helper
--   `processReleveBancaire` catche l'erreur et retourne
--   `releve_insert_failed`, ce qui se traduit par un log Vercel warning
--   `[process] releve_bancaire skipped: releve_insert_failed: ...` et
--   AUCUN relevé n'apparaît dans /client/banque. La table reste vide.
--
-- Fix : qualifier les colonnes (`releves_bancaires.version`) et
--   également renommer les variables locales PL/pgSQL pour préfixer `v_*`
--   sans collision (en réalité c'est déjà fait, le problème est uniquement
--   l'OUT param et la colonne du SELECT). Pour rester safe on qualifie
--   explicitement TOUTES les références à la colonne `version` dans la
--   fonction.

BEGIN;

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
  PERFORM pg_advisory_xact_lock(
    hashtext(p_compte_bancaire_id::text || '|' || p_date_debut::text || '|' || p_date_fin::text)
  );

  -- ⚠️ Qualifier `releves_bancaires.version` pour éviter 42702 (collision
  --    avec la variable OUT homonyme déclarée par RETURNS TABLE).
  SELECT rb.id, rb.version
    INTO v_existing_id, v_existing_version
    FROM releves_bancaires rb
   WHERE rb.compte_bancaire_id = p_compte_bancaire_id
     AND rb.date_debut         = p_date_debut
     AND rb.date_fin           = p_date_fin
     AND rb.superseded_by_id IS NULL
     FOR UPDATE;

  v_new_version := COALESCE(v_existing_version, 0) + 1;

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

  IF v_existing_id IS NOT NULL THEN
    UPDATE releves_bancaires
       SET superseded_by_id = v_new_id,
           superseded_at    = NOW()
     WHERE id = v_existing_id;

    DELETE FROM transactions_bancaires WHERE releve_id = v_existing_id;
  END IF;

  RETURN QUERY SELECT v_new_id, v_new_version, v_existing_id;
END;
$$;

COMMENT ON FUNCTION public.replace_releve_bancaire IS
  'Upsert atomique d''un releve bancaire avec versioning. Si une version active existe pour (compte_bancaire_id, date_debut, date_fin), elle est marquee superseded et une nouvelle version est creee. Gere la race condition via advisory_xact_lock. SECURITY DEFINER. Mig 435 : qualifie releves_bancaires.version pour fixer la collision 42702 introduite en mig 410.';

GRANT EXECUTE ON FUNCTION public.replace_releve_bancaire(
  UUID, UUID, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  INTEGER, NUMERIC, UUID, JSONB, TEXT, UUID, TEXT
) TO authenticated, service_role;

COMMIT;
