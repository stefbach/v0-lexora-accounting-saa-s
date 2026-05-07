-- ============================================================================
-- Migration 236 — bulletins_paie : cohérence stricte salaire_net
-- ============================================================================
--
-- Contexte : la colonne `salaire_brut` est GENERATED ALWAYS (mig 016) et
-- recalcule auto à partir des composants. Mais `salaire_net` est laissé
-- libre, donc l'import Excel peut y mettre n'importe quoi (cumul YTD,
-- mauvais mapping de colonne…) → bulletin déséquilibré → écritures OD-PAIE
-- déséquilibrées → Grand Livre faux.
--
-- Cas concret OCC : 56 / 96 bulletins ont net > brut (ex. Cecilia PAUL :
-- brut=27472, net=75311). Cumul Grand Livre : -382k MUR.
--
-- On ne peut PAS rendre `salaire_net` GENERATED sans casser les bulletins
-- en cours d'écriture par l'app (qui pose explicitement la valeur). À la
-- place, on ajoute :
--   1. Un TRIGGER BEFORE INSERT/UPDATE qui force la cohérence si l'écart
--      est important (>1 MUR), en logguant un NOTICE.
--   2. Un INDEX expressif sur l'écart pour permettre un audit rapide.
--   3. Une VIEW publique `v_bulletins_paie_incoherents` qui liste les
--      bulletins à corriger.
--
-- Idempotente : DROP IF EXISTS + recréation.
-- ============================================================================

-- ── 1. Fonction de recalcul du net ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_salaire_net(
  p_salaire_brut NUMERIC,
  p_csg_salarie NUMERIC,
  p_nsf_salarie NUMERIC,
  p_paye NUMERIC,
  p_montant_absence NUMERIC
) RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    0,
    COALESCE(p_salaire_brut, 0)
    - COALESCE(p_csg_salarie, 0)
    - COALESCE(p_nsf_salarie, 0)
    - COALESCE(p_paye, 0)
    - COALESCE(p_montant_absence, 0)
  );
$$;

COMMENT ON FUNCTION public.compute_salaire_net IS
  'Recalcule salaire_net = salaire_brut - retenues_salariales (cap à 0). '
  'Source unique de vérité pour la cohérence comptable des bulletins.';

-- ── 2. Trigger BEFORE INSERT/UPDATE qui corrige automatiquement ─────────────
CREATE OR REPLACE FUNCTION public.trg_bulletins_paie_enforce_net()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- salaire_brut est GENERATED, déjà cohérent
  v_expected := public.compute_salaire_net(
    NEW.salaire_brut,
    NEW.csg_salarie,
    NEW.nsf_salarie,
    NEW.paye,
    NEW.montant_absence
  );

  v_diff := COALESCE(NEW.salaire_net, 0) - v_expected;

  -- Si l'écart > 1 MUR (au-delà des arrondis), on force la valeur cohérente
  IF ABS(v_diff) > 1 THEN
    RAISE NOTICE 'bulletin % périod=% : net=% incohérent (attendu %, écart %.2f) → force à %',
      NEW.id, NEW.periode, NEW.salaire_net, v_expected, v_diff, v_expected;
    NEW.salaire_net := v_expected;
    -- Trace l'incident dans notes
    NEW.notes := COALESCE(NEW.notes, '') ||
      CASE WHEN COALESCE(NEW.notes, '') = '' THEN '' ELSE ' | ' END ||
      'AUTO-FIX net : était ' || ROUND(v_diff + v_expected, 2) ||
      ', recalculé ' || ROUND(v_expected, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bulletins_paie_enforce_net ON public.bulletins_paie;
CREATE TRIGGER bulletins_paie_enforce_net
BEFORE INSERT OR UPDATE OF salaire_net, csg_salarie, nsf_salarie, paye, montant_absence
ON public.bulletins_paie
FOR EACH ROW
EXECUTE FUNCTION public.trg_bulletins_paie_enforce_net();

COMMENT ON TRIGGER bulletins_paie_enforce_net ON public.bulletins_paie IS
  'Enforce salaire_net = salaire_brut - retenues_salariales. Tout écart '
  '>1 MUR est auto-corrigé et tracé dans notes. Empêche les bulletins '
  'incohérents qui déséquilibreraient le journal OD-PAIE.';

-- ── 3. Vue d'audit des bulletins déséquilibrés (pour suivi historique) ─────
DROP VIEW IF EXISTS public.v_bulletins_paie_incoherents;
CREATE VIEW public.v_bulletins_paie_incoherents AS
SELECT
  b.id,
  b.societe_id,
  b.employe_id,
  b.periode,
  TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom_complet,
  b.salaire_brut,
  b.salaire_net,
  public.compute_salaire_net(
    b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye, b.montant_absence
  ) AS salaire_net_attendu,
  (b.salaire_net - public.compute_salaire_net(
    b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye, b.montant_absence
  )) AS ecart_net,
  b.csg_salarie, b.nsf_salarie, b.paye, b.montant_absence,
  b.source, b.notes, b.created_at
FROM public.bulletins_paie b
LEFT JOIN public.employes e ON e.id = b.employe_id
WHERE ABS(
  COALESCE(b.salaire_net, 0)
  - public.compute_salaire_net(
      b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye, b.montant_absence
    )
) > 1;

COMMENT ON VIEW public.v_bulletins_paie_incoherents IS
  'Liste des bulletins où salaire_net ne matche pas la formule. '
  'Devrait rester vide après mig 236 ; sinon investiguer.';

-- ── 4. Recalcul one-shot des bulletins existants ────────────────────────────
-- Sécurité : on touche uniquement les bulletins flagués comme incohérents.
-- Le trigger se chargera de re-poser la valeur correcte.
DO $$
DECLARE
  nb_fix INTEGER := 0;
BEGIN
  UPDATE public.bulletins_paie
  SET salaire_net = public.compute_salaire_net(
        salaire_brut, csg_salarie, nsf_salarie, paye, montant_absence
      )
  WHERE ABS(
    COALESCE(salaire_net, 0)
    - public.compute_salaire_net(
        salaire_brut, csg_salarie, nsf_salarie, paye, montant_absence
      )
  ) > 1;
  GET DIAGNOSTICS nb_fix = ROW_COUNT;
  RAISE NOTICE 'mig 236 : % bulletins corrigés', nb_fix;
END $$;
