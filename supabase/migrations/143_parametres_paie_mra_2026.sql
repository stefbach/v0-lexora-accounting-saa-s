-- ============================================================================
-- Migration 143 — parametres_paie_mra : insertion des taux 2026 Maurice
-- ============================================================================
--
-- Sprint 10 BUG 1 — la table parametres_paie_mra peut être vide en prod
-- (mig 016 insérait seulement l'année 2025 en s'appuyant sur les DEFAULT).
-- Pour garantir des taux corrects appliqués au calcul de paie 2026+, on
-- insère explicitement une ligne 2026 avec TOUS les taux MRA à jour.
--
-- TAUX MRA 2026 Maurice (source: MRA + WRA 2019 + Finance Act 2024) :
--   CSG salarié : 1.5% si brut ≤ 50 000 | 3% si brut > 50 000 MUR/mois
--   CSG patronal : 3% si brut ≤ 50 000 | 6% si brut > 50 000
--   NSF salarié : 1.5%   | NSF patronal : 2.5%
--   Training Levy : 1% sur salaire de base
--   PRGF : 4.5% des emoluments totaux OU 4.5 MUR/jour (fallback)
--   PAYE : 0% jusqu'à 390 000 MUR/an (32 500/mois),
--          10% de 390K à 650K, 15% au-delà
--   Salary Compensation 2026 : Rs 635/mois si salaire ≤ 50 000
--
-- Idempotent via WHERE NOT EXISTS — safe à re-exécuter.
-- ============================================================================

INSERT INTO public.parametres_paie_mra (
  annee,
  mois_debut,
  salaire_minimum_national,
  csg_salarie_taux_plein,
  csg_salarie_taux_reduit,
  csg_patronal,
  csg_seuil_taux_reduit,
  nsf_salarie,
  nsf_patronal,
  training_levy,
  prgf_patronal_par_jour,
  heures_standard_semaine,
  jours_travail_semaine,
  heures_sup_taux_normal,
  heures_sup_taux_majore,
  conges_annuels_moins_5ans,
  conges_annuels_plus_5ans,
  conges_maladie_annuels,
  conges_maternite_semaines,
  conges_paternite_semaines,
  actif
)
SELECT
  2026,        -- annee
  1,           -- mois_debut (janvier)
  16500.00,    -- salaire_minimum_national MUR (National Minimum Wage 2026)
  0.03,        -- csg_salarie_taux_plein (3% si brut > 50K)
  0.015,       -- csg_salarie_taux_reduit (1.5% si brut ≤ 50K)
  0.06,        -- csg_patronal (6% si brut > 50K — 3% sinon géré dans calculs)
  50000.00,    -- csg_seuil_taux_reduit (50 000 MUR/mois)
  0.015,       -- nsf_salarie (1.5%)
  0.025,       -- nsf_patronal (2.5%)
  0.01,        -- training_levy (1% sur salaire base — HRDC)
  4.50,        -- prgf_patronal_par_jour (fallback MUR/jour — calcul réel 4.5%)
  45.00,       -- heures_standard_semaine (WRA 2019 art. 14)
  5,           -- jours_travail_semaine (Mon-Fri standard)
  1.50,        -- heures_sup_taux_normal (1.5x)
  2.00,        -- heures_sup_taux_majore (2x après 2h OT ou jours fériés)
  15,          -- conges_annuels_moins_5ans (AL)
  22,          -- conges_annuels_plus_5ans (AL après 5 ans — WRA 2019)
  15,          -- conges_maladie_annuels (SL)
  16,          -- conges_maternite_semaines (Finance Act 2024)
  4,           -- conges_paternite_semaines (Finance Act 2024)
  true         -- actif
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametres_paie_mra WHERE annee = 2026
);

-- Désactiver les anciennes années (actif=false) pour éviter confusion
UPDATE public.parametres_paie_mra
  SET actif = false
WHERE annee < 2026 AND actif = true;

-- S'assurer que 2026 est la ligne active
UPDATE public.parametres_paie_mra
  SET actif = true
WHERE annee = 2026;
