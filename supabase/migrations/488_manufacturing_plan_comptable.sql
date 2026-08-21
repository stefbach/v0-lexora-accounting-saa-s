-- =====================================================================
-- Migration 488 — Comptes Manufacturing (classe 3 production / 6031)
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §1.4 / §4.
--
--   3100 Matières premières                    (SOFP actif courant, stocks)
--   3300 En-cours de production                (SOFP actif courant, stocks —
--        soldé à zéro pour tout OF clôturé, cf. test lib/manufacturing)
--   3500 Produits finis                        (SOFP actif courant, stocks)
--   6031 Variation des stocks de matières premières (symétrique de 6037)
--
-- Réutilisés (pas créés ici) :
--   6586 Pertes sur stocks   (mig 483) — écarts matière anormaux en fabrication
--   7131 Production stockée  (mig 202, IFRS déjà classé 478/479 en
--        SOCI.Produits.AutresProduitsOperationnels) — la spec §4 proposait un
--        « 7135 » ; le PCM canonique ayant déjà 7131 avec la classification
--        IFRS voulue (production, PAS coût des ventes), on le réutilise.
--
-- Comptes 6412/6413 (reclassement main d'œuvre) : NON créés — Module D
-- (imputations_temps) hors périmètre de ce MVP.
--
-- Idempotente (ON CONFLICT), additive, aucune donnée modifiée.
-- =====================================================================

-- ── 1. plan_comptable (PCM Maurice, template global) ─────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('3100', 'Matières premières',                             'actif',  'D', '310', 4),
  ('3300', 'En-cours de production',                         'actif',  'D', '330', 4),
  ('3500', 'Produits finis',                                 'actif',  'D', '350', 4),
  ('6031', 'Variation des stocks de matières premières',     'charge', 'D', '603', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle     = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal;

-- ── 2. comptes_ifrs (couche IFRS, migration 478) ─────────────────────
INSERT INTO public.comptes_ifrs
  (code_interne, libelle, categorie_ifrs, sous_categorie, poste_etat_financier, sens_normal, est_contra, est_mra_compte, type_mra, ancien_code_pcg, devise)
VALUES
  ('STK-MATIERES-PREMIERES',  'Stocks de matières premières',                 'actif_courant', 'stocks',          'SOFP.ActifsCourants.Stocks',  'D', FALSE, FALSE, NULL, '3100', 'MUR'),
  ('STK-EN-COURS-PRODUCTION', 'En-cours de production',                       'actif_courant', 'stocks',          'SOFP.ActifsCourants.Stocks',  'D', FALSE, FALSE, NULL, '3300', 'MUR'),
  ('STK-PRODUITS-FINIS',      'Stocks de produits finis',                     'actif_courant', 'stocks',          'SOFP.ActifsCourants.Stocks',  'D', FALSE, FALSE, NULL, '3500', 'MUR'),
  ('CHG-VARIATION-MATIERES',  'Variation des stocks de matières premières',   'charges',       'cout_des_ventes', 'SOCI.Charges.CoutDesVentes',  'D', FALSE, FALSE, NULL, '6031', 'MUR')
ON CONFLICT (code_interne) DO NOTHING;

-- ── 3. Correspondance PCG → IFRS ─────────────────────────────────────
INSERT INTO public.plan_comptable_migration_map
  (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
VALUES
  ('3100', 'STK-MATIERES-PREMIERES',  TRUE, 'Module manufacturing — matières premières (mig 488)'),
  ('3300', 'STK-EN-COURS-PRODUCTION', TRUE, 'Module manufacturing — en-cours de production (mig 488)'),
  ('3500', 'STK-PRODUITS-FINIS',      TRUE, 'Module manufacturing — produits finis (mig 488)'),
  ('6031', 'CHG-VARIATION-MATIERES',  TRUE, 'Module manufacturing — variation stocks matières (mig 488)')
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
  AND pc.compte IN ('3100', '3300', '3500', '6031')
  AND pc.code_interne_ifrs IS NULL;
