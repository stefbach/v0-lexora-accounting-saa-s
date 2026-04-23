-- ============================================================
-- Migration 160 — F6 Sprint bugs paie/conges
--
-- Séparer UL (Unpaid Leave, congé sans solde approuvé) et absences
-- injustifiées dans bulletins_paie. Avant : les deux étaient mergés dans
-- montant_absence / jours_absence, ce qui empêchait la traçabilité fine
-- (impossible de distinguer sur le bulletin ni en compta un jour
-- UL d'un "no-show").
--
-- IDEMPOTENT : ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS montant_ul NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jours_ul NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.montant_ul IS
  'F6 — Déduction salariale pour Unpaid Leave (congé sans solde demandé et approuvé par l''employé).';
COMMENT ON COLUMN public.bulletins_paie.jours_ul IS
  'F6 — Nombre de jours UL approuvés dans la période du bulletin.';
COMMENT ON COLUMN public.bulletins_paie.montant_absence IS
  'F6 — Déduction salariale pour absences injustifiées UNIQUEMENT (PAS les UL, qui sont désormais dans montant_ul).';
COMMENT ON COLUMN public.bulletins_paie.jours_absence IS
  'F6 — Nombre de jours d''absences injustifiées UNIQUEMENT (PAS les UL).';
