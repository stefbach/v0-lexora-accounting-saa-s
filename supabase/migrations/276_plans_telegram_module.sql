-- ============================================================================
-- 276 — Intégration de l'Assistant IA Telegram dans l'offre tarifaire
-- ============================================================================
--
-- Le service "Chief of Staff IA" via Telegram devient un module à part entière
-- dans le plan tarifaire. Il est inclus à partir du plan Pro (dirigeants) et
-- Cabinet Team (comptables). Starter et Cabinet Solo n'y ont pas accès par
-- défaut.
--
-- Idempotent : utilise jsonb_set pour ajouter la clé sans écraser les autres
-- modules déjà présents.
-- ============================================================================

BEGIN;

-- 1) Plans dirigeants
UPDATE public.plans
   SET modules_inclus = jsonb_set(COALESCE(modules_inclus, '{}'::jsonb), '{telegram}', 'false'::jsonb, true)
 WHERE code = 'starter';

UPDATE public.plans
   SET modules_inclus = jsonb_set(COALESCE(modules_inclus, '{}'::jsonb), '{telegram}', 'true'::jsonb, true)
 WHERE code IN ('pro', 'premium');

-- 2) Plans cabinets comptables — Telegram inclus dès Team
UPDATE public.plans
   SET modules_inclus = jsonb_set(COALESCE(modules_inclus, '{}'::jsonb), '{telegram}', 'false'::jsonb, true)
 WHERE code = 'cabinet_solo';

UPDATE public.plans
   SET modules_inclus = jsonb_set(COALESCE(modules_inclus, '{}'::jsonb), '{telegram}', 'true'::jsonb, true)
 WHERE code IN ('cabinet_team', 'cabinet_enterprise');

-- 3) Plan add-on "Telegram seul" — pour les clients Starter / Cabinet Solo
--    qui veulent ajouter uniquement l'Assistant IA Telegram à leur offre.
INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif)
VALUES
  ('addon_telegram', 'Add-on Assistant IA Telegram',
   'Chief of Staff IA via Telegram — agenda, emails, RDV, alertes, langage naturel. Add-on à ajouter à toute formule.',
   'dirigeant', 990, 9900,
   '{"telegram":true}'::jsonb,
   FALSE, 90, TRUE)
ON CONFLICT (code) DO UPDATE
  SET nom = EXCLUDED.nom,
      description = EXCLUDED.description,
      prix_mensuel_mur = EXCLUDED.prix_mensuel_mur,
      prix_annuel_mur = EXCLUDED.prix_annuel_mur,
      modules_inclus = EXCLUDED.modules_inclus,
      actif = TRUE;

COMMIT;

NOTIFY pgrst, 'reload schema';
