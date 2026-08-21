-- =====================================================================
-- Migration 491 — Comptes Job Costing (reclassement analytique personnel)
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §2.4-2 / §4.
--
-- La spec proposait 6412 (production) / 6413 (jobs) — MAIS ces deux codes
-- sont DÉJÀ occupés dans le PCM canonique (mig 202/478 : Transport allowance
-- et Petrol allowance). Comme la mig 488 (manufacturing) l'a fait pour 7135→7131,
-- on n'écrase pas un compte canonique : on crée des codes libres du groupe 642.
--
--   6421 Charges de personnel — production        (reclassement MO directe OF)
--   6422 Charges de personnel — jobs facturables  (reclassement MO directe job)
--
-- Ce sont des sous-comptes de reclassement ANALYTIQUE : l'écriture débite
-- 642x et crédite le 641x d'origine — total des charges de personnel inchangé,
-- donc neutre pour les états financiers IFRS (les deux restent classés
-- SOCI.Charges.ChargesDePersonnel). Le reclassement est OPTIONNEL en v1.
--
-- Idempotente (ON CONFLICT), additive, aucune donnée modifiée.
-- =====================================================================

-- ── 1. plan_comptable (PCM Maurice, template global) ─────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('6421', 'Charges de personnel — production',       'charge', 'D', '641', 4),
  ('6422', 'Charges de personnel — jobs facturables', 'charge', 'D', '641', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle     = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal;

-- ── 2. comptes_ifrs (couche IFRS, migration 478) ─────────────────────
INSERT INTO public.comptes_ifrs
  (code_interne, libelle, categorie_ifrs, sous_categorie, poste_etat_financier, sens_normal, est_contra, est_mra_compte, type_mra, ancien_code_pcg, devise)
VALUES
  ('CHG-PERSONNEL-PRODUCTION', 'Charges de personnel — production',       'charges', 'charges_de_personnel', 'SOCI.Charges.ChargesDePersonnel', 'D', FALSE, FALSE, NULL, '6421', 'MUR'),
  ('CHG-PERSONNEL-JOBS',       'Charges de personnel — jobs facturables', 'charges', 'charges_de_personnel', 'SOCI.Charges.ChargesDePersonnel', 'D', FALSE, FALSE, NULL, '6422', 'MUR')
ON CONFLICT (code_interne) DO NOTHING;

-- ── 3. Correspondance PCG → IFRS ─────────────────────────────────────
INSERT INTO public.plan_comptable_migration_map
  (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
VALUES
  ('6421', 'CHG-PERSONNEL-PRODUCTION', TRUE, 'Job costing — reclassement MO production (mig 491)'),
  ('6422', 'CHG-PERSONNEL-JOBS',       TRUE, 'Job costing — reclassement MO jobs (mig 491)')
ON CONFLICT (ancien_code_pcg) DO NOTHING;

-- ── 4. Liaison directe plan_comptable → IFRS (migration 479) ─────────
UPDATE public.plan_comptable pc
SET categorie_ifrs            = ci.categorie_ifrs,
    sous_categorie_ifrs       = ci.sous_categorie,
    poste_etat_financier_ifrs = ci.poste_etat_financier,
    est_contra_ifrs           = ci.est_contra,
    type_mra_ifrs             = ci.type_mra,
    code_interne_ifrs         = ci.code_interne
FROM public.comptes_ifrs ci
WHERE ci.ancien_code_pcg = pc.compte
  AND pc.compte IN ('6421', '6422')
  AND pc.code_interne_ifrs IS NULL;
