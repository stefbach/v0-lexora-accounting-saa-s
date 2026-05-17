-- ============================================================================
-- 282 — Aligne les modules /admin/services avec /tarifs
-- ============================================================================
--
-- Ajoute les 3 modules présents sur la page tarifaire mais absents du
-- gestionnaire admin :
--   - tibok       (TIBOK Corporate — santé salariés inclus dans tous les
--                  plans)
--   - alertes_ia  (Alertes IA & Pilotage — agent IA échéances, prévisionnel,
--                  recommandations stratégiques)
--   - telegram    (Chief of Staff IA — assistant Telegram)
--
-- Idempotent : si la clé existe déjà, conserve sa valeur.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. service_plans — backfill des 3 clés
--    Logique : tous les plans seed (premium / comptabilite / rh_paie /
--    compta_rh) ont TIBOK + Alertes IA activés (inclus dans toutes les
--    offres /tarifs). Telegram dépend du tier — désactivé par défaut
--    sauf 'premium'.
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.service_plans
   SET modules = modules
                 || COALESCE(modules->'tibok',      'true'::jsonb)::jsonb
                 || jsonb_build_object('tibok', COALESCE((modules->>'tibok')::boolean, TRUE))
                 || jsonb_build_object('alertes_ia', COALESCE((modules->>'alertes_ia')::boolean, TRUE))
                 || jsonb_build_object('telegram', COALESCE((modules->>'telegram')::boolean, code = 'premium'))
 WHERE code IN ('premium', 'comptabilite', 'rh_paie', 'compta_rh');

-- ─────────────────────────────────────────────────────────────────────
-- 2. societes.modules_actifs — backfill défensif des 3 clés
--    Heuristique conservative : on active TIBOK + Alertes IA pour toutes
--    les sociétés qui ont AU MOINS un module fonctionnel actif (pas une
--    coquille vide). Telegram reste désactivé (option payante).
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.societes
   SET modules_actifs = jsonb_set(modules_actifs, '{tibok}',
                          to_jsonb(
                            COALESCE((modules_actifs->>'tibok')::boolean,
                                     COALESCE((modules_actifs->>'comptabilite')::boolean, FALSE)
                                  OR COALESCE((modules_actifs->>'rh')::boolean, FALSE)
                            )
                          ),
                          true)
 WHERE modules_actifs IS NOT NULL AND NOT (modules_actifs ? 'tibok');

UPDATE public.societes
   SET modules_actifs = jsonb_set(modules_actifs, '{alertes_ia}',
                          to_jsonb(
                            COALESCE((modules_actifs->>'alertes_ia')::boolean,
                                     COALESCE((modules_actifs->>'comptabilite')::boolean, FALSE)
                                  OR COALESCE((modules_actifs->>'rh')::boolean, FALSE)
                            )
                          ),
                          true)
 WHERE modules_actifs IS NOT NULL AND NOT (modules_actifs ? 'alertes_ia');

UPDATE public.societes
   SET modules_actifs = jsonb_set(modules_actifs, '{telegram}',
                          to_jsonb(COALESCE((modules_actifs->>'telegram')::boolean, FALSE)),
                          true)
 WHERE modules_actifs IS NOT NULL AND NOT (modules_actifs ? 'telegram');

-- 3. DEFAULT pour les nouvelles sociétés : inclut les 3 clés
ALTER TABLE public.societes
  ALTER COLUMN modules_actifs SET DEFAULT
  '{"comptabilite":true,"rh":true,"juridique":true,"facturation":true,"documents":true,"fiscal":true,"etats_financiers":true,"employe_portal":true,"tibok":true,"alertes_ia":true,"telegram":false}'::jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
