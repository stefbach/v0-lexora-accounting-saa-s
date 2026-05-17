-- ============================================================================
-- 283 — Refonte `plans` pour matcher exactement /tarifs (3 packs × 4 tailles)
-- ============================================================================
--
-- La table plans avait initialement 6 lignes plates (starter, pro, premium,
-- cabinet_*). La page /tarifs propose au contraire une grille structurée :
--
--   PACKS :  Comptabilité + Facturation
--            RH & Paie + TIBOK
--            Pack Complet ERP
--   TAILLES (par pack) : Solo / Petite / PME / Grande
--   ADD-ONS : Telegram, TIBOK (peuvent être ajoutés à n'importe quel pack)
--   CABINETS : plans cabinets comptables sans tarif (négocié au cas par cas)
--
-- Cette migration :
--   1) Ajoute 3 colonnes : pack, taille_entreprise, is_addon, prix_visible
--   2) Met à jour les 6 plans seed existants pour pointer sur les nouvelles
--      colonnes (cabinets passent à prix_visible=false)
--   3) Insère 13 nouveaux plans (3 packs × 4 tailles + 1 add-on Telegram)
--      avec les prix exacts de /tarifs (1500/3500/6500/12000 pour compta,
--      etc.) et les modules adaptés à chaque tier.
-- ============================================================================

BEGIN;

-- 1) Colonnes nouvelles
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS pack             TEXT
    CHECK (pack IS NULL OR pack IN ('compta', 'paie', 'bundle', 'addon', 'cabinet', 'legacy'));
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS taille_entreprise TEXT
    CHECK (taille_entreprise IS NULL OR taille_entreprise IN ('solo', 'petite', 'pme', 'grande'));
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_addon         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS prix_visible     BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_plans_pack_taille
  ON public.plans(pack, taille_entreprise) WHERE pack IS NOT NULL;

-- 2) Marque les seeds existants comme "legacy" pour ne pas mélanger
UPDATE public.plans SET pack = 'legacy'
 WHERE pack IS NULL AND code IN ('starter', 'pro', 'premium');

-- 3) Cabinets : pack='cabinet', prix invisible côté client (négocié)
UPDATE public.plans SET pack = 'cabinet', prix_visible = FALSE
 WHERE code IN ('cabinet_solo', 'cabinet_team', 'cabinet_enterprise');

-- ─────────────────────────────────────────────────────────────────────
-- 4. Seed 3 packs × 4 tailles + add-ons
-- ─────────────────────────────────────────────────────────────────────

-- Helper : modules JSONB par pack + taille
--   compta : documents + comptabilite + facturation + fiscal + etats_financiers (PME+) + juridique (Grande) + alertes_ia
--   paie   : documents + rh + fiscal + employe_portal + tibok + juridique (Grande) + alertes_ia
--   bundle : tous les modules sauf telegram (ajoutable en add-on)

-- compta : pack 'compta', taille_entreprise, prix mensuel/annuel
INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif, pack, taille_entreprise)
VALUES
  ('compta_solo',   'Comptabilité Solo',   'Comptabilité + facturation pour freelances et auto-entrepreneurs (1-3 personnes).',
   'dirigeant', 1500, 15000,
   '{"documents":true,"comptabilite":true,"facturation":true,"fiscal":true,"alertes_ia":true,"etats_financiers":false,"juridique":false,"rh":false,"tibok":false,"telegram":false,"employe_portal":false}'::jsonb,
   FALSE, 110, TRUE, 'compta', 'solo'),
  ('compta_petite', 'Comptabilité Petite Entreprise', 'Comptabilité + facturation pour petites équipes (4-15 personnes).',
   'dirigeant', 3500, 35000,
   '{"documents":true,"comptabilite":true,"facturation":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":false,"rh":false,"tibok":false,"telegram":false,"employe_portal":false}'::jsonb,
   FALSE, 120, TRUE, 'compta', 'petite'),
  ('compta_pme',    'Comptabilité PME',    'Comptabilité + facturation pour PME établies (16-50 personnes).',
   'dirigeant', 6500, 65000,
   '{"documents":true,"comptabilite":true,"facturation":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"rh":false,"tibok":false,"telegram":false,"employe_portal":false}'::jsonb,
   FALSE, 130, TRUE, 'compta', 'pme'),
  ('compta_grande', 'Comptabilité Grande Entreprise', 'Comptabilité + facturation pour grandes structures (50+ personnes).',
   'dirigeant', 12000, 120000,
   '{"documents":true,"comptabilite":true,"facturation":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"rh":false,"tibok":false,"telegram":false,"employe_portal":false}'::jsonb,
   FALSE, 140, TRUE, 'compta', 'grande')
ON CONFLICT (code) DO UPDATE
  SET pack = EXCLUDED.pack, taille_entreprise = EXCLUDED.taille_entreprise,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur, prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus, nom = EXCLUDED.nom, description = EXCLUDED.description;

-- paie + TIBOK
INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif, pack, taille_entreprise)
VALUES
  ('paie_solo',   'RH & Paie + TIBOK Solo',   'Bulletins, congés, santé TIBOK pour 1-3 salariés.',
   'dirigeant', 1700, 17000,
   '{"documents":true,"rh":true,"fiscal":true,"alertes_ia":true,"tibok":true,"employe_portal":true,"comptabilite":false,"facturation":false,"juridique":false,"etats_financiers":false,"telegram":false}'::jsonb,
   FALSE, 210, TRUE, 'paie', 'solo'),
  ('paie_petite', 'RH & Paie + TIBOK Petite Entreprise', 'Bulletins, congés, santé TIBOK pour 4-15 salariés.',
   'dirigeant', 2700, 27000,
   '{"documents":true,"rh":true,"fiscal":true,"alertes_ia":true,"tibok":true,"employe_portal":true,"comptabilite":false,"facturation":false,"juridique":false,"etats_financiers":false,"telegram":false}'::jsonb,
   FALSE, 220, TRUE, 'paie', 'petite'),
  ('paie_pme',    'RH & Paie + TIBOK PME',    'Bulletins, congés, santé TIBOK pour 16-50 salariés.',
   'dirigeant', 6700, 67000,
   '{"documents":true,"rh":true,"fiscal":true,"alertes_ia":true,"tibok":true,"employe_portal":true,"comptabilite":false,"facturation":false,"juridique":true,"etats_financiers":false,"telegram":false}'::jsonb,
   FALSE, 230, TRUE, 'paie', 'pme'),
  ('paie_grande', 'RH & Paie + TIBOK Grande Entreprise', 'Bulletins, congés, santé TIBOK pour 50+ salariés.',
   'dirigeant', 14500, 145000,
   '{"documents":true,"rh":true,"fiscal":true,"alertes_ia":true,"tibok":true,"employe_portal":true,"comptabilite":false,"facturation":false,"juridique":true,"etats_financiers":false,"telegram":false}'::jsonb,
   FALSE, 240, TRUE, 'paie', 'grande')
ON CONFLICT (code) DO UPDATE
  SET pack = EXCLUDED.pack, taille_entreprise = EXCLUDED.taille_entreprise,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur, prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus, nom = EXCLUDED.nom, description = EXCLUDED.description;

-- bundle ERP complet (tous modules, telegram en option add-on)
INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif, pack, taille_entreprise)
VALUES
  ('bundle_solo',   'Pack Complet ERP Solo',   'Compta + Facturation + RH + TIBOK pour 1-3 personnes.',
   'dirigeant', 2720, 27200,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":false,"juridique":false,"tibok":true,"telegram":false,"employe_portal":true}'::jsonb,
   FALSE, 310, TRUE, 'bundle', 'solo'),
  ('bundle_petite', 'Pack Complet ERP Petite Entreprise', 'Compta + Facturation + RH + TIBOK pour 4-15 personnes.',
   'dirigeant', 4960, 49600,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":false,"tibok":true,"telegram":false,"employe_portal":true}'::jsonb,
   TRUE,  320, TRUE, 'bundle', 'petite'),
  ('bundle_pme',    'Pack Complet ERP PME',    'Compta + Facturation + RH + TIBOK + Juridique pour 16-50 personnes.',
   'dirigeant', 10560, 105600,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":false,"employe_portal":true}'::jsonb,
   TRUE,  330, TRUE, 'bundle', 'pme'),
  ('bundle_grande', 'Pack Complet ERP Grande Entreprise', 'ERP complet pour grandes structures (50+).',
   'dirigeant', 21200, 212000,
   '{"documents":true,"comptabilite":true,"facturation":true,"rh":true,"fiscal":true,"alertes_ia":true,"etats_financiers":true,"juridique":true,"tibok":true,"telegram":true,"employe_portal":true}'::jsonb,
   FALSE, 340, TRUE, 'bundle', 'grande')
ON CONFLICT (code) DO UPDATE
  SET pack = EXCLUDED.pack, taille_entreprise = EXCLUDED.taille_entreprise,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur, prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus, nom = EXCLUDED.nom, description = EXCLUDED.description;

-- Add-on Telegram (ajoutable à n'importe quel pack)
INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif, pack, is_addon)
VALUES
  ('addon_telegram', 'Add-on Chief of Staff IA — Telegram', 'Assistant IA Telegram à ajouter à toute formule (agenda, RDV, emails, OCR, RH, banque en langage naturel).',
   'dirigeant', 990, 9900,
   '{"telegram":true}'::jsonb, FALSE, 910, TRUE, 'addon', TRUE),
  ('addon_tibok',    'Add-on TIBOK Corporate (Santé salariés)', 'Santé salariés TIBOK à ajouter à un plan Compta (déjà inclus dans Paie et Pack Complet).',
   'dirigeant', 1200, 12000,
   '{"tibok":true}'::jsonb, FALSE, 920, TRUE, 'addon', TRUE)
ON CONFLICT (code) DO UPDATE
  SET pack = EXCLUDED.pack, is_addon = EXCLUDED.is_addon,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur, prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus, nom = EXCLUDED.nom, description = EXCLUDED.description;

COMMIT;

NOTIFY pgrst, 'reload schema';
