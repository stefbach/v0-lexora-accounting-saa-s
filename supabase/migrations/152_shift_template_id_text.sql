-- ============================================================
-- Migration 152 — employes.shift_template_id : UUID → TEXT
--
-- CONTEXTE :
--   Les shifts sont stockés dans societes.shifts_planning (JSONB).
--   Leurs `id` sont mixtes : certains UUIDs générés par crypto.randomUUID
--   (shifts nouveaux), d'autres des strings timestamp-like legacy
--   (ex: 'c1776684776901' pour "Horaire OCC").
--   La colonne employes.shift_template_id est typée UUID → incompatible
--   avec les ids legacy. 0 employé ne l'utilise actuellement, donc safe
--   d'altérer le type sans perte.
--
--   La FK vers shift_templates(id) est abandonnée : la table
--   shift_templates est vide et la source de vérité est désormais
--   societes.shifts_planning. Pas de FK car la référence est vers un
--   id de JSONB (impossible à contraindre au niveau PG).
-- ============================================================

ALTER TABLE public.employes
  DROP CONSTRAINT IF EXISTS employes_shift_template_id_fkey;

ALTER TABLE public.employes
  ALTER COLUMN shift_template_id TYPE TEXT USING shift_template_id::text;

COMMENT ON COLUMN public.employes.shift_template_id IS
  'Shift par défaut pour le planning. Référence un id dans societes.shifts_planning (JSONB). TEXT car les ids peuvent être UUID (nouveaux) ou strings legacy. Pas de FK (target = JSONB).';
