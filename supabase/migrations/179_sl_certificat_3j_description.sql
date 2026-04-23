-- ============================================================
-- Migration 179 — Hotfix DOC1+G4
--
-- WRA 2019 S.46 précise que le certificat médical pour Sick Leave
-- n'est obligatoire que si l'absence couvre ≥ 3 jours consécutifs.
-- La règle conges_regles pour SL laissait requiert_certificat_medical=true,
-- interprété par l'API comme "toujours requis", ce qui bloquait les
-- demandes SL d'1 jour sans justificatif.
--
-- LE CHECK APPLICATIF EST DÉJÀ AJUSTÉ dans app/api/rh/conges/route.ts
-- (court-circuit si SL et nb_jours<3). Cette migration met à jour la
-- DESCRIPTION de la règle pour être explicite et conforme WRA.
-- requiert_certificat_medical reste true (= "peut être requis"), le
-- check API raffine selon la durée.
--
-- IDEMPOTENTE.
-- ============================================================

UPDATE public.conges_regles
SET description =
  'Sick Leave : 15 jours/an après 12 mois. Accrual 1j/mois M7-M12 ' ||
  '(plafond 6). Certificat médical OBLIGATOIRE si >= 3 jours ' ||
  'consécutifs (WRA S.46), recommandé sinon. Cumul possible jusqu''à 90 j.'
WHERE type_conge = 'SL' AND societe_id IS NULL;

COMMENT ON COLUMN public.conges_regles.requiert_certificat_medical IS
  'true = justificatif potentiellement requis. Pour SL, le seuil
   effectif est >= 3 jours consécutifs (WRA S.46). Le check est
   appliqué par l''API lors de la création de la demande.';
