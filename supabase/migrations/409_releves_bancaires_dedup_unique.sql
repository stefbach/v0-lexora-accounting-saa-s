-- Migration 409 — Dédupe releves_bancaires + UNIQUE constraint
--
-- Problème :
--   La table releves_bancaires n'a pas de contrainte d'unicité sur
--   (compte_bancaire_id, date_debut, date_fin). Quand l'utilisateur ré-upload
--   un relevé pour corriger une erreur d'extraction, ça crée un nouveau row
--   au lieu de remplacer/upserter. Observé en prod (société 1826dde7) avant
--   le nettoyage manuel : 4 relevés pour 2025-12, 2 pour 2026-03, 2 pour
--   2026-04 sur le même compte bancaire — créant autant de batches dupliqués
--   de transactions_bancaires côté rapprochement.
--
-- Stratégie de dédupe :
--   Pour chaque (compte_bancaire_id, date_debut, date_fin), garder le row avec
--   MAX(created_at) — supposé être le re-upload le plus récent et corrigé.
--   Cascade DELETE des transactions_bancaires des relevés obsolètes.
--   Snapshot dans audit_trail avant DELETE pour traçabilité.
--
-- Prévention :
--   Partial UNIQUE INDEX sur le triplet (skip les rows avec NULL pour
--   compatibilité legacy). L'app devra utiliser ON CONFLICT à l'avenir.
--
-- Note : la mig 408 (TG_OP=INSERT → action=CREATE dans fn_log_audit_trail)
--   doit être appliquée AVANT celle-ci, sinon les snapshots INSERT vers
--   audit_trail tombent en 23514. Vérifier l'ordre des migrations.

BEGIN;

-- ========================================================================
-- Phase 1 : Inventaire des doublons (avant action)
-- ========================================================================

CREATE TEMP TABLE releves_doublons ON COMMIT DROP AS
SELECT
  id,
  societe_id,
  compte_bancaire_id,
  date_debut,
  date_fin,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY compte_bancaire_id, date_debut, date_fin
    ORDER BY created_at DESC, id  -- plus récent gagne, id stable pour tie-break
  ) AS rn
FROM releves_bancaires
WHERE compte_bancaire_id IS NOT NULL
  AND date_debut IS NOT NULL
  AND date_fin IS NOT NULL;

DO $$
DECLARE
  v_total       INTEGER;
  v_a_garder    INTEGER;
  v_a_supprimer INTEGER;
  v_tx_a_suppr  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM releves_doublons;
  SELECT COUNT(*) INTO v_a_garder FROM releves_doublons WHERE rn = 1;
  SELECT COUNT(*) INTO v_a_supprimer FROM releves_doublons WHERE rn > 1;

  SELECT COUNT(*) INTO v_tx_a_suppr
  FROM transactions_bancaires
  WHERE releve_id IN (SELECT id FROM releves_doublons WHERE rn > 1);

  RAISE NOTICE 'Mig 409 — releves_bancaires dédupe';
  RAISE NOTICE '  Total scanné  : %', v_total;
  RAISE NOTICE '  À garder      : %', v_a_garder;
  RAISE NOTICE '  À supprimer   : % (doublons)', v_a_supprimer;
  RAISE NOTICE '  Transactions  : % (à supprimer en cascade)', v_tx_a_suppr;

  IF v_a_supprimer = 0 THEN
    RAISE NOTICE '  → Aucun doublon, rien à faire (sauf création UNIQUE INDEX).';
  END IF;
END $$;

-- ========================================================================
-- Phase 2 : Snapshot dans audit_trail des relevés obsolètes
-- ========================================================================
-- best-effort, peut échouer si partition manquante — on continue quand même

DO $$
BEGIN
  BEGIN
    INSERT INTO audit_trail (
      user_id, user_email, user_role, action, table_name, row_id,
      old_values, description, created_at
    )
    SELECT
      NULL::uuid, NULL, 'migration',
      'DELETE', 'releves_bancaires', r.id,
      to_jsonb(r.*),
      'Dédupe mig 409 — doublon obsolète (kept MAX(created_at) per (compte_bancaire_id, date_debut, date_fin))',
      NOW()
    FROM releves_bancaires r
    WHERE r.id IN (SELECT id FROM releves_doublons WHERE rn > 1);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Mig 409 — snapshot audit_trail failed (peut-être partition manquante) : %', SQLERRM;
  END;
END $$;

-- ========================================================================
-- Phase 3 : DELETE des transactions_bancaires liées aux relevés obsolètes
-- ========================================================================

DELETE FROM transactions_bancaires
WHERE releve_id IN (SELECT id FROM releves_doublons WHERE rn > 1);

-- ========================================================================
-- Phase 4 : DELETE des relevés obsolètes eux-mêmes
-- ========================================================================

DELETE FROM releves_bancaires
WHERE id IN (SELECT id FROM releves_doublons WHERE rn > 1);

-- ========================================================================
-- Phase 5 : Partial UNIQUE INDEX pour empêcher les futurs doublons
-- ========================================================================
-- Partial WHERE pour rester compatible avec d'éventuels rows legacy qui
-- auraient des NULL sur l'un des 3 champs (skip silencieux).
-- IF NOT EXISTS : idempotent si on re-run la migration.

CREATE UNIQUE INDEX IF NOT EXISTS releves_bancaires_compte_periode_uq
ON releves_bancaires (compte_bancaire_id, date_debut, date_fin)
WHERE compte_bancaire_id IS NOT NULL
  AND date_debut   IS NOT NULL
  AND date_fin     IS NOT NULL;

COMMENT ON INDEX releves_bancaires_compte_periode_uq IS
  'Empêche les doublons de relevés bancaires sur même (compte, période). '
  'L''app doit utiliser ON CONFLICT (compte_bancaire_id, date_debut, date_fin) '
  'pour upsert lors d''un re-upload (mig 409).';

COMMIT;
