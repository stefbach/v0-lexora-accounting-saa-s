-- ============================================================
-- Migration 149 — FK pointages.planning_assignment_id ON DELETE SET NULL
--
-- Problème : la sauvegarde d'un planning dans /rh/planning supprime puis
-- réinsère les planning_assignments du mois (cf. POST /api/rh/planning,
-- `supabase.from('planning_assignments').delete().eq('planning_id', ...)`).
-- Or pointages.planning_assignment_id a une FK vers planning_assignments
-- avec la règle par défaut NO ACTION → Postgres renvoie 23503 dès qu'au
-- moins un pointage référence une ligne à supprimer, ce qui bloque toute
-- sauvegarde sur des mois où des employés ont déjà pointé.
--
-- Solution : passer la FK à ON DELETE SET NULL. Les données historiques
-- des pointages (heure_entree, heure_sortie, etc.) sont préservées ; seul
-- le lien vers l'assignment reconfiguré est effacé. Idempotent via
-- DROP CONSTRAINT IF EXISTS.
-- ============================================================

ALTER TABLE public.pointages
  DROP CONSTRAINT IF EXISTS pointages_planning_assignment_id_fkey;

ALTER TABLE public.pointages
  ADD CONSTRAINT pointages_planning_assignment_id_fkey
  FOREIGN KEY (planning_assignment_id)
  REFERENCES public.planning_assignments(id)
  ON DELETE SET NULL;
