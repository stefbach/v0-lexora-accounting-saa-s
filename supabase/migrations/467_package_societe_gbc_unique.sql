-- ============================================================================
-- 467 — Refonte tarifaire : Package Société unique + Package GBC / IFRS
-- ============================================================================
--
-- CONTEXTE
-- --------
-- La grille issue de la migration 283 découpait l'offre en 3 packs
-- (compta / paie / bundle) × 4 tailles, plus 2 add-ons. Ce découpage posait
-- trois problèmes :
--
--   1) Il facturait la paie au salarié (PAIE_TIERS : 250 → 70 Rs/salarié)
--      alors que le coût de servir la paie ne dépend PAS de l'effectif :
--      générer 5 ou 100 bulletins mobilise le même code déterministe. Le
--      coût marginal réel est porté par le volume de pièces traitées (OCR,
--      lignes de relevé, écritures, tokens LLM de rapprochement).
--   2) Il obligeait le prospect à arbitrer entre modules alors que la
--      proposition de valeur est justement le « tout-en-un » : une société
--      mauricienne a besoin de compta ET de social ET de juridique.
--   3) Il ne monétisait nulle part le bloc GBC / IFRS complet
--      (app/client/gbc-*, ifrs9-ecl, leases, mra-cit/sft/tds, it-form3),
--      qui est pourtant la partie la plus coûteuse à produire et celle qui
--      s'adresse au segment le plus solvable (GBC sous licence FSC,
--      management companies).
--
-- NOUVELLE STRUCTURE
-- ------------------
--   Package Société  — tout compris (compta + facturation + banque + OCR IA
--                      + fiscal MRA + RH/paie + juridique + alertes IA
--                      + Telegram + accès TIBOK). Salariés et utilisateurs
--                      ILLIMITÉS. Le prix ne varie que sur le volume moyen
--                      de transactions par mois.
--
--   Package GBC/IFRS — surensemble strict du Package Société, augmenté du
--                      bloc IFRS complet et conformité Global Business.
--                      Le prix varie sur le nombre d'entités du périmètre
--                      de consolidation, puis sur le volume de transactions.
--
-- DÉFINITION D'UNE « TRANSACTION » (à implémenter côté compteur applicatif)
-- ------------------------------------------------------------------------
--   COMPTE     : pièce comptable, facture émise ou reçue, ligne de relevé
--                bancaire importée, document soumis à l'OCR.
--   NE COMPTE  : bulletin de paie, salarié, congé, pointage, contrat
--     PAS        juridique, utilisateur, société. Ces objets sont illimités
--                — c'est le cœur de la promesse commerciale.
--
-- TIBOK — PAY AS YOU GO
-- ---------------------
-- L'accès à TIBOK Corporate est ouvert à tous les salariés sur tous les
-- paliers, sans supplément d'abonnement. En revanche chaque téléconsultation
-- réellement effectuée est facturée Rs 500 à l'acte.
--
-- C'est le seul modèle tenable : le coût TIBOK est un coût médical tiers,
-- strictement proportionnel au nombre de consultations. Un forfait — a
-- fortiori un forfait indépendant de l'effectif, comme l'ancien add-on à
-- Rs 1 200/mois — expose à une perte non bornée dès qu'une société de 80
-- salariés consomme normalement. À l'acte, la marge est invariante.
--
-- FRAIS DE MISE EN SERVICE
-- ------------------------
-- Rs 8 000 facturés une seule fois à la souscription : paramétrage de la
-- société et 4 heures de formation. Identique sur tous les paliers et sur
-- les deux packages, porté par `limites.frais_setup_mur`.
--
-- Ce n'est pas un centre de profit : il couvre le temps humain engagé, sans
-- plus. Sa fonction est de financer l'onboarding et de filtrer les
-- souscriptions non sérieuses — un client formé reste, et le churn de la
-- première année se joue là.
--
-- ATTENTION : la reprise d'historique (balance d'ouverture, import du parc
-- salarié, plan comptable existant) n'entre PAS dans ces 4 heures. Elle doit
-- être devisée séparément, faute de quoi elle est absorbée à perte sur les
-- paliers PME et Corporate, où elle dépasse largement une demi-journée.
--
-- DÉPASSEMENT
-- -----------
--   Société : Rs 15 / transaction au-delà du plafond, facturation plafonnée
--             au prix du palier supérieur (jamais de bill shock : dépasser
--             ne coûte jamais plus cher que d'être monté de palier).
--   GBC     : Rs 4 500 / mois par entité consolidée au-delà du plafond.
--
-- MIGRATION DU PARC EXISTANT
-- --------------------------
-- Les 13 plans de la 283 ne sont pas supprimés (des `societes` y sont
-- rattachées et l'historique de facturation doit rester lisible) : ils
-- passent `actif = FALSE` + `prix_visible = FALSE`, ce qui les retire du
-- catalogue public servi par /api/plans sans casser les jointures.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Étendre les contraintes : nouveaux packs `societe` et `gbc`
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_pack_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_pack_check
  CHECK (pack IS NULL OR pack IN (
    'societe', 'gbc',                                  -- grille 2026 (467)
    'compta', 'paie', 'bundle', 'addon',               -- grille 283, archivée
    'cabinet', 'legacy'
  ));

-- `taille_entreprise` reste utilisable pour les libellés marketing mais
-- n'est plus un axe de prix : le palier est porté par `limites`.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_taille_entreprise_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_taille_entreprise_check
  CHECK (taille_entreprise IS NULL OR taille_entreprise IN (
    'solo', 'petite', 'pme', 'grande', 'enterprise'
  ));

-- ─────────────────────────────────────────────────────────────────────
-- 2. Archiver la grille 283 (3 packs × 4 tailles + add-ons)
-- ─────────────────────────────────────────────────────────────────────
--
-- Les add-ons `addon_telegram` et `addon_tibok` disparaissent. Telegram est
-- inclus d'office ; TIBOK passe en pay-as-you-go à Rs 500 la consultation
-- (voir plus haut), ce qui supprime le forfait `addon_tibok` — structurellement
-- déficitaire, puisqu'il facturait Rs 1 200 fixes un coût médical strictement
-- proportionnel au nombre de consultations.

UPDATE public.plans
   SET actif = FALSE,
       prix_visible = FALSE,
       updated_at = NOW()
 WHERE pack IN ('compta', 'paie', 'bundle', 'addon');

-- ─────────────────────────────────────────────────────────────────────
-- 3. Package Société — 5 paliers sur le volume de transactions
-- ─────────────────────────────────────────────────────────────────────
--
-- Tous les modules sont à `true` sans exception : c'est la définition même
-- du package. Toute nouvelle clé de module ajoutée plus tard devra l'être
-- ici aussi, sinon le « tout compris » devient faux.

INSERT INTO public.plans (
  code, nom, description, type_cible,
  prix_mensuel_mur, prix_annuel_mur,
  modules_inclus, limites,
  populaire, ordre, actif, pack, taille_entreprise, prix_visible
) VALUES
  ('societe_essentiel',
   'Package Société — Essentiel',
   'Tout compris pour freelances, professions libérales et micro-entreprises. Jusqu''à 50 transactions par mois. Salariés et utilisateurs illimités.',
   'dirigeant', 2500, 25000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":false,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":50,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":5}'::jsonb,
   FALSE, 110, TRUE, 'societe', 'solo', TRUE),

  ('societe_croissance',
   'Package Société — Croissance',
   'Tout compris pour les entreprises en croissance. Jusqu''à 200 transactions par mois. Salariés et utilisateurs illimités.',
   'dirigeant', 4900, 49000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":false,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":200,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":20}'::jsonb,
   TRUE, 120, TRUE, 'societe', 'petite', TRUE),

  ('societe_pme',
   'Package Société — PME',
   'Tout compris pour les PME établies. Jusqu''à 500 transactions par mois. Salariés et utilisateurs illimités.',
   'dirigeant', 9900, 99000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":false,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":500,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":100}'::jsonb,
   FALSE, 130, TRUE, 'societe', 'pme', TRUE),

  ('societe_corporate',
   'Package Société — Corporate',
   'Tout compris pour les grandes structures. Jusqu''à 1 500 transactions par mois. Salariés et utilisateurs illimités, support dédié.',
   'dirigeant', 18900, 189000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":false,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":1500,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":null}'::jsonb,
   FALSE, 140, TRUE, 'societe', 'grande', TRUE),

  ('societe_enterprise',
   'Package Société — Enterprise',
   'Volume de transactions illimité, engagement de service (SLA), API dédiée et accompagnement sur mesure. Tarif négocié.',
   'dirigeant', 0, NULL,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":false,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":null,"salaries_max":null,"utilisateurs_max":null,"societes_max":null,"entites_consolidees_max":null,"depassement_mur_par_transaction":null,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":null}'::jsonb,
   FALSE, 150, TRUE, 'societe', 'enterprise', FALSE)

ON CONFLICT (code) DO UPDATE
  SET nom = EXCLUDED.nom, description = EXCLUDED.description,
      type_cible = EXCLUDED.type_cible,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur,
      prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus,
      limites = EXCLUDED.limites,
      populaire = EXCLUDED.populaire, ordre = EXCLUDED.ordre,
      actif = EXCLUDED.actif, pack = EXCLUDED.pack,
      taille_entreprise = EXCLUDED.taille_entreprise,
      prix_visible = EXCLUDED.prix_visible,
      updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Package GBC / IFRS — surensemble, paliers sur le périmètre consolidé
-- ─────────────────────────────────────────────────────────────────────
--
-- Cible : sociétés titulaires d'une Global Business Licence (GBC) ou d'une
-- Authorised Company auprès de la FSC, et les management companies qui les
-- administrent. Le pilote de prix n'est pas le volume de pièces (un holding
-- GBC peut n'avoir que 30 écritures par mois) mais la complexité du
-- reporting : nombre d'entités à consolider, obligations Pillar Two,
-- documentation prix de transfert, échanges CRS/FATCA.
--
-- Chaque palier inclut l'intégralité du Package Société.

INSERT INTO public.plans (
  code, nom, description, type_cible,
  prix_mensuel_mur, prix_annuel_mur,
  modules_inclus, limites,
  populaire, ordre, actif, pack, taille_entreprise, prix_visible
) VALUES
  ('gbc_authorised',
   'Package GBC — Authorised Company',
   'Authorised Company ou GBC simple : IFRS complet, Partial Exemption Regime, substance (CIGA), bénéficiaires effectifs (UBO), CRS/FATCA. Une entité, jusqu''à 100 transactions par mois. Inclut tout le Package Société.',
   'dirigeant', 8500, 85000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":true,"ifrs_avance":false}'::jsonb,
   '{"transactions_max":100,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"depassement_mur_par_entite":4500,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":50}'::jsonb,
   FALSE, 210, TRUE, 'gbc', 'solo', TRUE),

  ('gbc_standard',
   'Package GBC — Standard',
   'GBC en régime d''exonération partielle : tout le palier Authorised, plus IFRS 9 (dépréciation ECL), IFRS 16 (contrats de location) et documentation prix de transfert simplifiée. Une entité, jusqu''à 500 transactions par mois.',
   'dirigeant', 15000, 150000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":true,"ifrs_avance":true}'::jsonb,
   '{"transactions_max":500,"salaries_max":null,"utilisateurs_max":null,"societes_max":1,"entites_consolidees_max":1,"depassement_mur_par_transaction":15,"depassement_mur_par_entite":4500,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":200}'::jsonb,
   TRUE, 220, TRUE, 'gbc', 'pme', TRUE),

  ('gbc_groupe',
   'Package GBC — Groupe consolidé',
   'Groupe multi-entités : consolidation IFRS 10, prix de transfert complet, BEPS Pillar Two (GloBE), monnaie fonctionnelle IAS 21. Jusqu''à 5 entités consolidées et 1 500 transactions par mois.',
   'dirigeant', 32000, 320000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":true,"ifrs_avance":true}'::jsonb,
   '{"transactions_max":1500,"salaries_max":null,"utilisateurs_max":null,"societes_max":5,"entites_consolidees_max":5,"depassement_mur_par_transaction":15,"depassement_mur_par_entite":4500,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":null}'::jsonb,
   FALSE, 230, TRUE, 'gbc', 'grande', TRUE),

  ('gbc_management_co',
   'Package GBC — Management Company',
   'Pour les management companies administrant un portefeuille de GBC : entités et transactions illimitées, vue portefeuille, piste d''audit complète, API et SLA. Tarif négocié.',
   'comptable', 0, NULL,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true,"gbc":true,"ifrs_avance":true}'::jsonb,
   '{"transactions_max":null,"salaries_max":null,"utilisateurs_max":null,"societes_max":null,"entites_consolidees_max":null,"depassement_mur_par_transaction":null,"depassement_mur_par_entite":null,"tibok_mur_par_consultation":500,"frais_setup_mur":8000,"setup_heures_formation":4,"stockage_go":null}'::jsonb,
   FALSE, 240, TRUE, 'gbc', 'enterprise', FALSE)

ON CONFLICT (code) DO UPDATE
  SET nom = EXCLUDED.nom, description = EXCLUDED.description,
      type_cible = EXCLUDED.type_cible,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur,
      prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus,
      limites = EXCLUDED.limites,
      populaire = EXCLUDED.populaire, ordre = EXCLUDED.ordre,
      actif = EXCLUDED.actif, pack = EXCLUDED.pack,
      taille_entreprise = EXCLUDED.taille_entreprise,
      prix_visible = EXCLUDED.prix_visible,
      updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────
-- 5. Plans cabinet — alignement sur la nouvelle logique
-- ─────────────────────────────────────────────────────────────────────
-- Les plans cabinets restent négociés au cas par cas (prix_visible = FALSE)
-- mais doivent exposer les mêmes modules que le Package Société, sans quoi
-- un cabinet aurait moins de fonctionnalités que ses propres clients.

UPDATE public.plans
   SET modules_inclus = modules_inclus
       || '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"telegram":true,"employe_portal":true}'::jsonb,
       updated_at = NOW()
 WHERE pack = 'cabinet';

COMMIT;

NOTIFY pgrst, 'reload schema';
