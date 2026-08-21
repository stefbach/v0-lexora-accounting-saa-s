-- =====================================================================
-- Migration 483 — Comptes stock (classe 3 / 60) + classification IFRS
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §4.
-- Comptes POS (530, 5118) volontairement exclus — Module B, hors périmètre.
--
--   3701 Stock de marchandises                (SOFP actif courant)
--   6037 Variation des stocks de marchandises (contrepartie mouvements valorisés)
--   6586 Pertes sur stocks                    (casse / perte constatée)
--   6588 Écarts d'inventaire                  (écarts de comptage physique)
--
-- Idempotente (ON CONFLICT), additive, aucune donnée modifiée.
-- =====================================================================

-- ── 1. plan_comptable (PCM Maurice, template global societe_id NULL) ──
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('3701', 'Stock de marchandises',                    'actif',  'D', '370', 4),
  ('6037', 'Variation des stocks de marchandises',     'charge', 'D', '603', 4),
  ('6586', 'Pertes sur stocks',                        'charge', 'D', '658', 4),
  ('6588', 'Écarts d''inventaire',                     'charge', 'D', '658', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle     = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal;

-- ── 2. comptes_ifrs (couche IFRS, migration 478) ─────────────────────
INSERT INTO public.comptes_ifrs
  (code_interne, libelle, categorie_ifrs, sous_categorie, poste_etat_financier, sens_normal, est_contra, est_mra_compte, type_mra, ancien_code_pcg, devise)
VALUES
  ('STK-MARCHANDISES',      'Stocks de marchandises',                    'actif_courant', 'stocks',          'SOFP.ActifsCourants.Stocks',    'D', FALSE, FALSE, NULL, '3701', 'MUR'),
  ('CHG-VARIATION-STOCKS',  'Variation des stocks de marchandises',      'charges',       'cout_des_ventes', 'SOCI.Charges.CoutDesVentes',    'D', FALSE, FALSE, NULL, '6037', 'MUR'),
  ('CHG-PERTES-STOCKS',     'Pertes sur stocks',                         'charges',       'cout_des_ventes', 'SOCI.Charges.CoutDesVentes',    'D', FALSE, FALSE, NULL, '6586', 'MUR'),
  ('CHG-ECARTS-INVENTAIRE', 'Écarts d''inventaire',                      'charges',       'cout_des_ventes', 'SOCI.Charges.CoutDesVentes',    'D', FALSE, FALSE, NULL, '6588', 'MUR')
ON CONFLICT (code_interne) DO NOTHING;

-- ── 3. Correspondance PCG → IFRS (migration 478, table de mapping) ───
INSERT INTO public.plan_comptable_migration_map
  (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
VALUES
  ('3701', 'STK-MARCHANDISES',      TRUE, 'Module inventaire — stock de marchandises (mig 483)'),
  ('6037', 'CHG-VARIATION-STOCKS',  TRUE, 'Module inventaire — variation des stocks (mig 483)'),
  ('6586', 'CHG-PERTES-STOCKS',     TRUE, 'Module inventaire — pertes/casse (mig 483)'),
  ('6588', 'CHG-ECARTS-INVENTAIRE', TRUE, 'Module inventaire — écarts d''inventaire (mig 483)')
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
  AND pc.compte IN ('3701', '6037', '6586', '6588')
  AND pc.code_interne_ifrs IS NULL;
