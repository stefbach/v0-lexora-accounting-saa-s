-- ============================================================================
-- 284 — Unifie le système d'abonnement : societes → plans (catalogue /tarifs)
-- ============================================================================
--
-- Avant cette migration :
--   - /admin/plans éditait la table `plans` (catalogue /tarifs : 12 packs +
--     2 add-ons + 3 cabinets, prix exacts).
--   - /admin/services éditait la table `service_plans` (4 plans hardcodés)
--     puis assignait à `societes.plan_id` qui pointait sur `service_plans`.
--   - Bug : les vrais tarifs /tarifs n'étaient PAS utilisables pour assigner
--     un abonnement à une société, ni pour facturer.
--
-- Cette migration unifie tout autour de `plans` :
--   1) Détache societes.plan_id de service_plans (drop FK).
--   2) Ajoute societes.plan_id_new pour pointer sur plans(id), copie les
--      données existantes (mapping service_plans.code → plans.code quand
--      possible), puis renomme.
--   3) Ajoute 3 nouvelles colonnes :
--        - addons_actifs JSONB : codes des add-ons souscrits (telegram, tibok)
--        - periodicite : 'mensuelle' | 'annuelle' (choix de facturation)
--        - prix_mensuel_effectif : prix mensuel total (plan + addons), cache
--   4) Fonction SQL `compute_subscription(plan_id, addons[], periodicite)`
--      qui retourne prix mensuel + prix période + modules union.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Drop l'ancienne FK societes.plan_id → service_plans (sera ré-pointée)
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.societes'::regclass
     AND contype = 'f'
     AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                    WHERE attrelid = 'public.societes'::regclass
                      AND attname = 'plan_id')
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.societes DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Mappe l'ancien plan_code (service_plans) vers le nouveau plan_id
--    de la table `plans`. Quand pas de correspondance, met à NULL —
--    l'admin devra réattribuer.
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.societes s
   SET plan_id = (
     SELECT p.id FROM public.plans p
      WHERE p.code = CASE s.plan_code
        WHEN 'premium'      THEN 'bundle_pme'
        WHEN 'comptabilite' THEN 'compta_petite'
        WHEN 'rh_paie'      THEN 'paie_petite'
        WHEN 'compta_rh'    THEN 'bundle_petite'
        ELSE s.plan_code
      END
      LIMIT 1
   )
 WHERE s.plan_id IS NOT NULL;

-- Add new FK to plans(id)
ALTER TABLE public.societes
  ADD CONSTRAINT societes_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Add-ons + périodicité + prix effectif
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS addons_actifs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS periodicite TEXT NOT NULL DEFAULT 'mensuelle'
    CHECK (periodicite IN ('mensuelle', 'annuelle'));
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS prix_mensuel_effectif NUMERIC(12,2);
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS prix_periode_effectif NUMERIC(12,2);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Fonction de calcul d'abonnement : merge plan + add-ons
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_subscription(
  p_plan_id UUID,
  p_addon_codes TEXT[],
  p_periodicite TEXT DEFAULT 'mensuelle'
) RETURNS TABLE (
  prix_mensuel    NUMERIC,
  prix_periode    NUMERIC,
  modules_inclus  JSONB
) LANGUAGE plpgsql AS $$
DECLARE
  v_plan      public.plans%ROWTYPE;
  v_addons    public.plans[];
  v_modules   JSONB := '{}'::jsonb;
  v_prix_mens NUMERIC := 0;
  v_prix_per  NUMERIC := 0;
  v_addon     public.plans%ROWTYPE;
BEGIN
  IF p_plan_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, '{}'::jsonb;
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, '{}'::jsonb;
    RETURN;
  END IF;

  v_modules   := COALESCE(v_plan.modules_inclus, '{}'::jsonb);
  v_prix_mens := COALESCE(v_plan.prix_mensuel_mur, 0);
  v_prix_per  := CASE p_periodicite
                   WHEN 'annuelle' THEN COALESCE(v_plan.prix_annuel_mur, v_plan.prix_mensuel_mur * 12)
                   ELSE             COALESCE(v_plan.prix_mensuel_mur, 0)
                 END;

  -- Add-ons : merge modules (true gagne), additionne les prix
  IF p_addon_codes IS NOT NULL THEN
    FOR v_addon IN
      SELECT * FROM public.plans
       WHERE code = ANY(p_addon_codes)
         AND COALESCE(is_addon, FALSE) = TRUE
    LOOP
      -- merge modules : true gagne (un addon active des modules)
      v_modules := v_modules || COALESCE(v_addon.modules_inclus, '{}'::jsonb);
      v_prix_mens := v_prix_mens + COALESCE(v_addon.prix_mensuel_mur, 0);
      v_prix_per  := v_prix_per + CASE p_periodicite
                   WHEN 'annuelle' THEN COALESCE(v_addon.prix_annuel_mur, v_addon.prix_mensuel_mur * 12)
                   ELSE             COALESCE(v_addon.prix_mensuel_mur, 0)
                 END;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_prix_mens, v_prix_per, v_modules;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_subscription(UUID, TEXT[], TEXT) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
