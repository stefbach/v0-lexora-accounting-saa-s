-- Migration 409 — Dédupe releves_bancaires + UNIQUE constraint
--
-- v2 : remplace TEMP TABLE par CTE/subquery inline. La TEMP TABLE était
--   évaporée entre statements via le pooler Supabase (pgbouncer transaction
--   mode), causant "relation releves_doublons does not exist" en Phase 2.
--
-- Problème :
--   La table releves_bancaires n'a pas de contrainte d'unicité sur
--   (compte_bancaire_id, date_debut, date_fin). Quand l'utilisateur ré-upload
--   un relevé pour corriger une erreur d'extraction, ça crée un nouveau row
--   au lieu de remplacer/upserter. Observé en prod (société 1826dde7) avant
--   le nettoyage manuel : 4 relevés pour 2025-12, 2 pour 2026-03, 2 pour
--   2026-04 sur le même compte bancaire.
--
-- Stratégie de dédupe :
--   Pour chaque (compte_bancaire_id, date_debut, date_fin), garder le row avec
--   MAX(created_at) — supposé être le re-upload corrigé.
--
-- Note : la mig 408 doit être appliquée AVANT celle-ci.

BEGIN;

-- ========================================================================
-- Phase 1 : Rapport (RAISE NOTICE)
-- ========================================================================

DO $$
DECLARE
  v_total       INTEGER;
  v_a_supprimer INTEGER;
  v_tx_a_suppr  INTEGER;
BEGIN
  WITH d AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY compte_bancaire_id, date_debut, date_fin
      ORDER BY created_at DESC, id
    ) AS rn
    FROM releves_bancaires
    WHERE compte_bancaire_id IS NOT NULL
      AND date_debut IS NOT NULL
      AND date_fin IS NOT NULL
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE rn > 1)
    INTO v_total, v_a_supprimer
  FROM d;

  WITH d AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY compte_bancaire_id, date_debut, date_fin
      ORDER BY created_at DESC, id
    ) AS rn
    FROM releves_bancaires
    WHERE compte_bancaire_id IS NOT NULL
      AND date_debut IS NOT NULL
      AND date_fin IS NOT NULL
  )
  SELECT COUNT(*) INTO v_tx_a_suppr
  FROM transactions_bancaires
  WHERE releve_id IN (SELECT id FROM d WHERE rn > 1);

  RAISE NOTICE 'Mig 409 — releves_bancaires dedupe';
  RAISE NOTICE '  Total scanne  : %', v_total;
  RAISE NOTICE '  A supprimer   : % (doublons)', v_a_supprimer;
  RAISE NOTICE '  Transactions  : % (cascade)', v_tx_a_suppr;

  IF v_a_supprimer = 0 THEN
    RAISE NOTICE '  -> Aucun doublon (UNIQUE INDEX cree quand meme).';
  END IF;
END $$;

-- ========================================================================
-- Phase 2 : Snapshot audit_trail des relevés obsolètes (best-effort)
-- ========================================================================

DO $$
BEGIN
  INSERT INTO audit_trail (
    user_id, user_email, user_role, action, table_name, row_id,
    old_values, description, created_at
  )
  SELECT
    NULL::uuid, NULL, 'migration',
    'DELETE', 'releves_bancaires', r.id, to_jsonb(r.*),
    'Dedupe mig 409 - doublon obsolete (kept MAX(created_at))',
    NOW()
  FROM releves_bancaires r
  WHERE r.id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY compte_bancaire_id, date_debut, date_fin
        ORDER BY created_at DESC, id
      ) AS rn
      FROM releves_bancaires
      WHERE compte_bancaire_id IS NOT NULL
        AND date_debut IS NOT NULL
        AND date_fin IS NOT NULL
    ) x WHERE rn > 1
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Mig 409 snapshot audit_trail failed: %', SQLERRM;
END $$;

-- ========================================================================
-- Phase 3 : DELETE des transactions_bancaires liées aux relevés obsolètes
-- ========================================================================

DELETE FROM transactions_bancaires
WHERE releve_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY compte_bancaire_id, date_debut, date_fin
      ORDER BY created_at DESC, id
    ) AS rn
    FROM releves_bancaires
    WHERE compte_bancaire_id IS NOT NULL
      AND date_debut IS NOT NULL
      AND date_fin IS NOT NULL
  ) x WHERE rn > 1
);

-- ========================================================================
-- Phase 4 : DELETE des relevés obsolètes
-- ========================================================================

DELETE FROM releves_bancaires
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY compte_bancaire_id, date_debut, date_fin
      ORDER BY created_at DESC, id
    ) AS rn
    FROM releves_bancaires
    WHERE compte_bancaire_id IS NOT NULL
      AND date_debut IS NOT NULL
      AND date_fin IS NOT NULL
  ) x WHERE rn > 1
);

-- ========================================================================
-- Phase 5 : Partial UNIQUE INDEX
-- ========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS releves_bancaires_compte_periode_uq
ON releves_bancaires (compte_bancaire_id, date_debut, date_fin)
WHERE compte_bancaire_id IS NOT NULL
  AND date_debut   IS NOT NULL
  AND date_fin     IS NOT NULL;

COMMENT ON INDEX releves_bancaires_compte_periode_uq IS
  'Empeche doublons relevés sur meme (compte, periode). App doit utiliser ON CONFLICT.';

COMMIT;
