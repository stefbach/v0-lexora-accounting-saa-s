-- ============================================================================
-- 277 — Complétion des clés modules dans service_plans et societes.modules_actifs
-- ============================================================================
--
-- Bug constaté : le paramétrage admin "RH & Paie uniquement" ne masquait
-- pas correctement les sections Fiscal MRA / États Financiers / Portail
-- employé côté client. Cause : ces 3 clés (fiscal, etats_financiers,
-- employe_portal) n'étaient pas définies dans service_plans.modules ni
-- dans societes.modules_actifs, et la sidebar les traitait comme
-- "activées par défaut" quand absentes.
--
-- Cette migration :
--   1) Backfille les 4 plans de service_plans avec une sémantique cohérente
--   2) Backfille toutes les sociétés existantes avec ces 3 clés selon la
--      logique métier suivante :
--        - fiscal           = true si compta OU rh est true
--        - etats_financiers = true si compta est true
--        - employe_portal   = true si rh est true
-- ============================================================================

BEGIN;

-- 1) service_plans — sémantique métier explicite pour les 4 plans seed
UPDATE public.service_plans
   SET modules = '{"comptabilite":true,"rh":true,"juridique":true,"facturation":true,"documents":true,"fiscal":true,"etats_financiers":true,"employe_portal":true}'::jsonb
 WHERE code = 'premium';

UPDATE public.service_plans
   SET modules = '{"comptabilite":true,"rh":false,"juridique":false,"facturation":true,"documents":true,"fiscal":true,"etats_financiers":true,"employe_portal":false}'::jsonb
 WHERE code = 'comptabilite';

UPDATE public.service_plans
   SET modules = '{"comptabilite":false,"rh":true,"juridique":false,"facturation":false,"documents":true,"fiscal":true,"etats_financiers":false,"employe_portal":true}'::jsonb
 WHERE code = 'rh_paie';

UPDATE public.service_plans
   SET modules = '{"comptabilite":true,"rh":true,"juridique":false,"facturation":true,"documents":true,"fiscal":true,"etats_financiers":true,"employe_portal":true}'::jsonb
 WHERE code = 'compta_rh';

-- 2) societes.modules_actifs — backfill des 3 clés manquantes selon
--    la logique métier. Idempotent : ne touche pas aux clés déjà présentes.
UPDATE public.societes
   SET modules_actifs = jsonb_set(
         COALESCE(modules_actifs, '{}'::jsonb),
         '{fiscal}',
         to_jsonb(
           COALESCE((modules_actifs->>'comptabilite')::boolean, false)
           OR COALESCE((modules_actifs->>'rh')::boolean, false)
         ),
         true
       )
 WHERE modules_actifs IS NOT NULL
   AND NOT (modules_actifs ? 'fiscal');

UPDATE public.societes
   SET modules_actifs = jsonb_set(
         COALESCE(modules_actifs, '{}'::jsonb),
         '{etats_financiers}',
         to_jsonb(COALESCE((modules_actifs->>'comptabilite')::boolean, false)),
         true
       )
 WHERE modules_actifs IS NOT NULL
   AND NOT (modules_actifs ? 'etats_financiers');

UPDATE public.societes
   SET modules_actifs = jsonb_set(
         COALESCE(modules_actifs, '{}'::jsonb),
         '{employe_portal}',
         to_jsonb(COALESCE((modules_actifs->>'rh')::boolean, false)),
         true
       )
 WHERE modules_actifs IS NOT NULL
   AND NOT (modules_actifs ? 'employe_portal');

-- 3) Met à jour la valeur par défaut de la colonne pour les nouvelles sociétés
ALTER TABLE public.societes
  ALTER COLUMN modules_actifs SET DEFAULT
  '{"comptabilite":true,"rh":true,"juridique":true,"facturation":true,"documents":true,"fiscal":true,"etats_financiers":true,"employe_portal":true}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
