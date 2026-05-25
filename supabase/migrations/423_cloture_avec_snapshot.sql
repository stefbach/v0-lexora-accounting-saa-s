-- =====================================================================
-- Migration 423 — Wrapper cloture_exercice + snapshot auto
-- =====================================================================
-- Branche : feat/cloture-immutability
--
-- Objectif :
--   Combiner en une seule RPC atomique la clôture comptable (mig 225)
--   et la génération du snapshot immuable (mig 422). Garantit qu'aucun
--   exercice ne peut être clôturé sans snapshot, et qu'aucun snapshot
--   généré dans ce flux n'est désaligné avec les écritures CL/AN.
--
-- Comportement :
--   1. Appelle public.cloture_exercice(societe, exercice) → JSONB des résultats
--   2. Génère public.generate_exercice_snapshot(societe, exercice, 'all')
--   3. Retourne le résultat de la clôture enrichi du snapshot_id
--
-- Idempotent :
--   - cloture_exercice est idempotente (purge CL/AN avant ré-insert)
--   - generate_exercice_snapshot désactive les snapshots précédents
--   → Réinvocation = même état final + nouvelle ligne snapshot
--
-- Dépend de :
--   - mig 225 : cloture_exercice(uuid, text)
--   - mig 422 : generate_exercice_snapshot(uuid, text, text, uuid, text)
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cloture_exercice_with_snapshot(
  p_societe_id UUID,
  p_exercice   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cloture_row    RECORD;
  v_snapshot_id    UUID;
  v_result         JSONB;
BEGIN
  -- Validation des inputs
  IF p_societe_id IS NULL THEN
    RAISE EXCEPTION 'p_societe_id requis';
  END IF;
  IF p_exercice IS NULL OR LENGTH(TRIM(p_exercice)) = 0 THEN
    RAISE EXCEPTION 'p_exercice requis (format YYYY-YYYY ou YYYY)';
  END IF;

  -- 1) Clôture comptable standard (mig 225)
  --    cloture_exercice() retourne un TABLE — on aplatit en RECORD.
  SELECT *
    INTO v_cloture_row
    FROM public.cloture_exercice(p_societe_id, p_exercice);

  v_result := jsonb_build_object(
    'societe_id',        p_societe_id,
    'exercice',          p_exercice,
    'resultat_exercice', v_cloture_row.resultat_exercice,
    'nb_lignes_cloture', v_cloture_row.nb_lignes_cloture,
    'nb_lignes_an',      v_cloture_row.nb_lignes_an,
    'total_actif_an',    v_cloture_row.total_actif_an,
    'total_passif_an',   v_cloture_row.total_passif_an,
    'equilibre',         v_cloture_row.equilibre
  );

  -- 2) Génération du snapshot immuable (mig 422)
  --    Type 'all' = vue complète (bilan + CR + balance + GL)
  --    On passe une note traçant l'origine.
  v_snapshot_id := public.generate_exercice_snapshot(
    p_societe_id,
    p_exercice,
    'all',
    NULL,
    'Auto-généré par cloture_exercice_with_snapshot'
  );

  -- 3) Enrichit la réponse avec l'id du snapshot
  v_result := v_result || jsonb_build_object(
    'snapshot_id',         v_snapshot_id,
    'snapshot_generated_at', NOW()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.cloture_exercice_with_snapshot(UUID, TEXT) IS
  'Wrapper atomique : (1) clôture comptable (mig 225 — écritures CL/AN, '
  'affectation 1200→119), puis (2) génère snapshot immuable (mig 422 — '
  'soldes/totaux/ratios figés). Retourne JSONB enrichi avec snapshot_id. '
  'Idempotent. À utiliser pour toute clôture d''exercice côté UI/API.';

GRANT EXECUTE ON FUNCTION public.cloture_exercice_with_snapshot(UUID, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------
-- Vérification post-migration
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'cloture_exercice_with_snapshot'
  ) INTO v_exists;

  RAISE NOTICE '[mig 423] cloture_exercice_with_snapshot : %', v_exists;
  RAISE NOTICE '[mig 423] Clôture + snapshot atomique disponible.';
END;
$$;

COMMIT;
