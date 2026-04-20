-- ============================================================
-- Migration 148 — Séparation shifts / config / règles WRA
--
-- NOTE: Le slot 147 est déjà occupé par 147_storage_buckets_avatars_certificats.sql.
-- Cette migration utilise donc 148 pour respecter l'ordre d'application.
--
-- AVANT : societes.regles_planning = array mélangeant
--   - des objets PlanningRule (14 règles WRA avec `key`)
--   - et optionnellement un objet { shifts, jours_travailles }
--
-- APRÈS :
--   - societes.regles_planning   → array des règles WRA uniquement
--   - societes.shifts_planning   → array des créneaux/shifts
--   - societes.config_planning   → { jours_travailles, semaine_type,
--                                    jour_repos_principal, type_rotation }
--
-- Idempotent : IF NOT EXISTS sur ADD COLUMN, filtrage WHERE sur UPDATE.
-- ============================================================

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS shifts_planning JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS config_planning JSONB DEFAULT '{
    "jours_travailles": ["lun","mar","mer","jeu","ven"],
    "semaine_type": "5j",
    "jour_repos_principal": "dim",
    "type_rotation": "fixe"
  }'::jsonb;

-- Migrer les shifts legacy (dernier élément de regles_planning contenant
-- une clé "shifts"). Exécuté uniquement sur les lignes où regles_planning
-- est un array ET où shifts_planning est encore le défaut vide.
UPDATE public.societes
SET
  shifts_planning = COALESCE(
    (SELECT rp->'shifts'
     FROM jsonb_array_elements(regles_planning) rp
     WHERE rp ? 'shifts'
     LIMIT 1),
    '[]'::jsonb
  ),
  config_planning = config_planning || jsonb_build_object(
    'jours_travailles',
    COALESCE(
      (SELECT rp->'jours_travailles'
       FROM jsonb_array_elements(regles_planning) rp
       WHERE rp ? 'jours_travailles'
       LIMIT 1),
      '["lun","mar","mer","jeu","ven"]'::jsonb
    )
  )
WHERE regles_planning IS NOT NULL
  AND jsonb_typeof(regles_planning) = 'array'
  AND (shifts_planning IS NULL OR shifts_planning = '[]'::jsonb);

-- Nettoyer regles_planning : ne conserver que les objets avec une clé "key"
-- (les vraies règles WRA). Supprime l'élément hybride {shifts, jours_travailles}.
UPDATE public.societes
SET regles_planning = (
  SELECT COALESCE(jsonb_agg(rp), '[]'::jsonb)
  FROM jsonb_array_elements(regles_planning) rp
  WHERE rp ? 'key'
)
WHERE regles_planning IS NOT NULL
  AND jsonb_typeof(regles_planning) = 'array';

-- Index GIN pour requêtes JSON sur shifts (ex: filtrer par code, par jour)
CREATE INDEX IF NOT EXISTS idx_societes_shifts_planning
  ON public.societes USING gin (shifts_planning);

COMMENT ON COLUMN public.societes.shifts_planning IS
  'Array de créneaux/shifts configurables (code, label, debut, fin, jours, couleur…). Séparé de regles_planning par mig 148.';
COMMENT ON COLUMN public.societes.config_planning IS
  'Configuration générale du planning: jours_travailles, semaine_type, jour_repos_principal, type_rotation.';
COMMENT ON COLUMN public.societes.regles_planning IS
  'Règles légales WRA 2019 uniquement (array de PlanningRule avec key). Les shifts ont migré vers shifts_planning (mig 148).';
