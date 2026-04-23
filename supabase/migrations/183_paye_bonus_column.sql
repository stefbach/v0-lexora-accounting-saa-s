-- ============================================================
-- Migration 183 — Sprint G11 Phase 2
--
-- End of Year Bonus — ajout de la colonne paye_bonus pour isoler
-- la portion de PAYE calculée sur le bonus (MRA cumulative system).
--
-- Les autres colonnes (csg_bonus, csg_patronal_bonus, eoy_bonus,
-- source, paye_ytd_cumul) existent déjà en DB.
--
-- IDEMPOTENTE.
-- ============================================================
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS paye_bonus NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.paye_bonus IS
  'G11 - PAYE calcule separement sur le EOY Bonus (MRA cumulative system). 0 si non-EOY.';
