-- ============================================================================
-- Migration 139 — jours_feries : travail_autorise + majoration_pct + societe_id
-- ============================================================================
--
-- Contexte Sprint 4 RH :
--   1. Certains jours fériés Maurice peuvent être travaillés (commerces,
--      hôtellerie, hôpitaux) avec majoration WRA 2019 (double salaire).
--      → Nouveau flag `travail_autorise` + `majoration_pct`.
--   2. Une société peut vouloir ajouter des jours fériés personnalisés
--      (jour de fondation, religieux spécifique, …) sans polluer le
--      calendrier national MU.
--      → Nouveau `societe_id` (NULL = jour férié global Maurice).
--
-- Conflit UNIQUE(date) existant : la table pré-Sprint 4 avait un
-- UNIQUE(date) qui bloquait toute entrée date dupliquée. Comme on veut
-- désormais potentiellement plusieurs entrées pour la même date (une
-- globale + une par société spécifique), on remplace par UNIQUE(date,
-- societe_id) — qui traite correctement les NULL comme distincts en
-- PostgreSQL (NULLs NOT DISTINCT n'est pas le défaut, donc OK).
--
-- Idempotente : DO blocks + IF NOT EXISTS.
-- ============================================================================

-- 1. Nouvelles colonnes
ALTER TABLE public.jours_feries
  ADD COLUMN IF NOT EXISTS travail_autorise BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS majoration_pct NUMERIC(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS societe_id UUID;

-- 2. FK societe_id → societes(id) (ON DELETE CASCADE — si une société
--    disparaît, ses jours fériés personnalisés partent avec elle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jours_feries_societe_id_fkey'
  ) THEN
    ALTER TABLE public.jours_feries
      ADD CONSTRAINT jours_feries_societe_id_fkey
      FOREIGN KEY (societe_id)
      REFERENCES public.societes(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Remplacer UNIQUE(date) par UNIQUE(date, societe_id)
--    PostgreSQL considère NULL comme distincts dans un index unique
--    (comportement par défaut), donc deux lignes avec societe_id=NULL
--    seront autorisées — on veut UNE seule ligne globale par date +
--    des lignes spécifiques société. Pour garantir l'unicité globale,
--    on utilise une EXPRESSION INDEX sur COALESCE.
DO $$
BEGIN
  -- Drop l'ancien unique sur (date) s'il existe
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jours_feries_date_key' AND conrelid = 'public.jours_feries'::regclass
  ) THEN
    ALTER TABLE public.jours_feries DROP CONSTRAINT jours_feries_date_key;
  END IF;
END $$;

-- Nouvel index unique qui traite NULL comme '00000000-0000-0000-0000-000000000000'
-- pour garantir « une seule ligne globale par date + une seule ligne par
-- (date, société) spécifique ».
CREATE UNIQUE INDEX IF NOT EXISTS jours_feries_date_societe_unique
  ON public.jours_feries (date, COALESCE(societe_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Index non-unique sur societe_id pour filtrage rapide
CREATE INDEX IF NOT EXISTS idx_jours_feries_societe_id
  ON public.jours_feries(societe_id)
  WHERE societe_id IS NOT NULL;

-- 4. Documentation
COMMENT ON COLUMN public.jours_feries.travail_autorise IS
  'Si TRUE : les employés peuvent travailler ce jour férié (commerces,
   hôtellerie, santé). WRA 2019 — rémunération = salaire normal + majoration
   majoration_pct. Si FALSE : jour fermé, pas de pointage accepté.';

COMMENT ON COLUMN public.jours_feries.majoration_pct IS
  'Pourcentage de majoration appliqué au salaire si l''employé travaille ce
   jour férié. 100 = +100% = double salaire (défaut WRA 2019).
   Seulement pertinent si travail_autorise = TRUE.';

COMMENT ON COLUMN public.jours_feries.societe_id IS
  'NULL = jour férié national Maurice (applique à toutes les sociétés).
   Non-null = jour férié spécifique à UNE société (ex. anniversaire de la
   société, fête interne). Filtrage : toujours inclure NULL + matching
   societe_id dans les calculs paie/planning.';
