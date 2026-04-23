-- ============================================================
-- Migration 174 — Sprint PE1 BUG 2
--
-- parametres_paie_mra.night_shift_pct était stocké en pourcentage
-- (15) au lieu de décimal (0.15) comme toutes les autres colonnes
-- de taux. Conséquence :
--   - UI : affichait "1500 %" (15 × 100)
--   - Moteur paie : multipliait les allocations nuit par ×100
--
-- Ce patch normalise toute valeur > 1 en la divisant par 100.
-- Idempotent : rien à faire si déjà en décimal.
-- ============================================================
UPDATE public.parametres_paie_mra
SET night_shift_pct = night_shift_pct / 100
WHERE night_shift_pct > 1;

COMMENT ON COLUMN public.parametres_paie_mra.night_shift_pct IS
  'PE1 - Majoration heures de nuit (21h-06h) en DÉCIMAL : 0.15 = 15 %.';
