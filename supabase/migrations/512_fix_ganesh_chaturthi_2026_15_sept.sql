-- ============================================================================
-- Migration 512 — Correction date Ganesh Chaturthi 2026 (16/09 → 15/09)
-- ============================================================================
-- Le Cabinet a AMENDÉ le calendrier des jours fériés 2026 : Ganesh Chaturthi
-- passe du mercredi 16/09/2026 au mardi 15/09/2026
-- (General Notice No. 611 of 2026, Prime Minister's Office).
--
-- La table `jours_feries` (et le fallback code `lib/rh/mauritius-holidays.ts`)
-- contenaient l'ancienne date 16/09. Conséquence : la majoration férié de la
-- paie de septembre serait tombée sur le 16/09 (jour désormais ouvré) au lieu
-- du 15/09, où 10 agents DDS ont effectivement travaillé.
--
-- La détection férié de la paie (app/api/rh/paie/route.ts) lit `jours_feries`
-- en direct au calcul ; corriger la date AVANT la clôture de septembre suffit
-- à réattribuer la majoration au bon jour au prochain recalcul.
--
-- Idempotente : ne modifie que si l'ancienne date 16/09 est encore présente.
-- ============================================================================

UPDATE public.jours_feries
SET date = '2026-09-15'
WHERE date = '2026-09-16'
  AND libelle = 'Ganesh Chaturthi'
  AND societe_id IS NULL;
