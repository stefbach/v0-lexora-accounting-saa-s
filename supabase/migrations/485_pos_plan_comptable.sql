-- =====================================================================
-- Migration 485 — Comptes POS (encaissements) + classification IFRS
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §2.4 / §4.
--
--   530  Caisse                (existant, mig 018 — réaffirmé, encaissement espèces)
--   5118 Monétique en transit  (à créer — carte / mobile money avant crédit banque,
--                               soldé par le rapprochement bancaire existant)
--   758  Produits divers…      (existant, mig 018 — excédent de caisse)
--   6588 Écarts d'inventaire / de caisse (créé en mig 483 — manque de caisse)
--
-- Idempotente (ON CONFLICT), additive, aucune donnée modifiée.
-- =====================================================================

-- ── 1. plan_comptable (PCM Maurice) ──────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  ('530',  'Caisse',                              'actif',   'D', NULL,  2),
  ('5118', 'Monétique en transit',                'actif',   'D', '511', 4),
  ('758',  'Produits divers de gestion courante', 'produit', 'C', '75',  3)
ON CONFLICT (compte) DO NOTHING;

-- ── 2. comptes_ifrs (couche IFRS, migration 478) ─────────────────────
INSERT INTO public.comptes_ifrs
  (code_interne, libelle, categorie_ifrs, sous_categorie, poste_etat_financier, sens_normal, est_contra, est_mra_compte, type_mra, ancien_code_pcg, devise)
VALUES
  ('TRES-CAISSE-POS',        'Caisse (espèces point de vente)', 'actif_courant', 'tresorerie',       'SOFP.ActifsCourants.Tresorerie',      'D', FALSE, FALSE, NULL, '530',  'MUR'),
  ('TRES-MONETIQUE-TRANSIT', 'Monétique en transit',            'actif_courant', 'tresorerie',       'SOFP.ActifsCourants.Tresorerie',      'D', FALSE, FALSE, NULL, '5118', 'MUR'),
  ('PROD-DIVERS-GESTION',    'Produits divers de gestion',      'produits',      'autres_produits',  'SOCI.Produits.AutresProduits',        'C', FALSE, FALSE, NULL, '758',  'MUR')
ON CONFLICT (code_interne) DO NOTHING;

-- ── 3. Correspondance PCG → IFRS (migration 478, table de mapping) ───
INSERT INTO public.plan_comptable_migration_map
  (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
VALUES
  ('530',  'TRES-CAISSE-POS',        TRUE, 'Module POS — caisse espèces (mig 485)'),
  ('5118', 'TRES-MONETIQUE-TRANSIT', TRUE, 'Module POS — encaissements carte/mobile money en transit (mig 485)'),
  ('758',  'PROD-DIVERS-GESTION',    TRUE, 'Module POS — excédents de caisse (mig 485)')
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
  AND pc.compte IN ('530', '5118', '758')
  AND pc.code_interne_ifrs IS NULL;
