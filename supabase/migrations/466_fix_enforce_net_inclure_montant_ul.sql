-- ============================================================================
-- Migration 466 — bulletins_paie : le net doit déduire montant_ul (unpaid leave)
-- ============================================================================
--
-- BUG (prod) : le trigger `bulletins_paie_enforce_net` (issu des migrations
-- 436/437, appliquées directement en prod et jamais versionnées) recalcule à
-- chaque INSERT/UPDATE :
--
--     total_deductions = csg + nsf + paye + montant_absence
--     salaire_net      = brut - csg - nsf - paye - montant_absence
--
-- Il OUBLIE `montant_ul`. Or depuis la mig 160, les congés SANS solde (unpaid
-- leave) sont stockés SÉPARÉMENT dans `montant_ul` (et `montant_absence` ne
-- contient QUE les absences injustifiées). Résultat : chaque déduction de
-- congé non payé s'affiche bien sur le bulletin (ligne « Congés non payés UL »)
-- mais est SILENCIEUSEMENT ignorée du net et du total des déductions — le
-- trigger écrase même la valeur correcte posée par l'app (route /api/rh/paie
-- qui, elle, déduit bien l'UL du net).
--
-- Exemple juillet 2026 :
--   Emilie HENRI : brut 23 496, UL 8 615 → net affiché 23 124 (= brut-372),
--                  alors que le net correct est 14 509.
--   Suzelle PIERRE : brut 21 700, UL 2 067 → net 21 210 au lieu de 19 143.
--
-- CORRECTIF : réintégrer `montant_ul` dans les DEUX formules du trigger. On
-- réutilise `compute_salaire_net` en lui passant (montant_absence + montant_ul)
-- comme montant d'absence total — sémantiquement les deux réduisent le net de
-- la même façon, et la mig 160 garantit qu'ils ne se chevauchent jamais (pas
-- de double comptage). L'invariant net = brut - total_deductions reste vrai.
--
-- La fonction `compute_salaire_net` (5 args) est laissée INCHANGÉE pour ne pas
-- casser ses autres appelants ; on somme absence+UL côté appelant.
--
-- Idempotente : CREATE OR REPLACE.
-- ============================================================================

-- ── 1. Trigger : inclure montant_ul dans total_deductions ET dans le net ────
CREATE OR REPLACE FUNCTION public.trg_bulletins_paie_enforce_net()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_salaire_brut NUMERIC;
  v_total_deductions NUMERIC;
  v_absence_totale NUMERIC;
  v_expected NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- Recalcul de salaire_brut depuis ses composants (mig 436)
  v_salaire_brut :=
      COALESCE(NEW.salaire_base, 0)
    + COALESCE(NEW.increment_salaire, 0)
    + COALESCE(NEW.heures_sup_montant, 0)
    + COALESCE(NEW.transport_allowance, 0)
    + COALESCE(NEW.petrol_allowance, 0)
    + COALESCE(NEW.special_allowance_1, 0)
    + COALESCE(NEW.special_allowance_2, 0)
    + COALESCE(NEW.special_allowance_3, 0)
    + COALESCE(NEW.other_refund, 0)
    + COALESCE(NEW.eoy_bonus, 0)
    + COALESCE(NEW.departure_notice, 0)
    + COALESCE(NEW.montant_ferie_travaille, 0);
  NEW.salaire_brut := ROUND(v_salaire_brut * 100) / 100;

  -- Mig 466 — absence TOTALE réduisant le net = injustifiées + congés non payés.
  -- (mig 160 : montant_absence et montant_ul sont disjoints → pas de doublon.)
  v_absence_totale := COALESCE(NEW.montant_absence, 0) + COALESCE(NEW.montant_ul, 0);

  -- Mig 437 + 466 — total_deductions = csg + nsf + paye + absence + UL
  v_total_deductions :=
      COALESCE(NEW.csg_salarie, 0)
    + COALESCE(NEW.nsf_salarie, 0)
    + COALESCE(NEW.paye, 0)
    + v_absence_totale;
  NEW.total_deductions := ROUND(v_total_deductions * 100) / 100;

  -- Enforce net coherence (montant_ul désormais inclus via v_absence_totale)
  v_expected := public.compute_salaire_net(
    NEW.salaire_brut,
    NEW.csg_salarie, NEW.nsf_salarie, NEW.paye, v_absence_totale
  );
  v_diff := COALESCE(NEW.salaire_net, 0) - v_expected;

  IF ABS(v_diff) > 1 THEN
    RAISE NOTICE 'bulletin % périod=% : net=% incohérent (attendu %, écart %.2f) → force à %',
      NEW.id, NEW.periode, NEW.salaire_net, v_expected, v_diff, v_expected;
    NEW.salaire_net := v_expected;
    NEW.notes := COALESCE(NEW.notes, '') ||
      CASE WHEN COALESCE(NEW.notes, '') = '' THEN '' ELSE ' | ' END ||
      'AUTO-FIX (mig 466) : net était ' || ROUND(v_diff + v_expected, 2) ||
      ', recalculé ' || ROUND(v_expected, 2);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Vue d'audit : cohérence attendue incluant montant_ul ─────────────────
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
    b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye,
    COALESCE(b.montant_absence, 0) + COALESCE(b.montant_ul, 0)
  ) AS salaire_net_attendu,
  (b.salaire_net - public.compute_salaire_net(
    b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye,
    COALESCE(b.montant_absence, 0) + COALESCE(b.montant_ul, 0)
  )) AS ecart_net,
  b.csg_salarie, b.nsf_salarie, b.paye, b.montant_absence, b.montant_ul,
  b.source, b.notes, b.created_at
FROM public.bulletins_paie b
LEFT JOIN public.employes e ON e.id = b.employe_id
WHERE ABS(
  COALESCE(b.salaire_net, 0)
  - public.compute_salaire_net(
      b.salaire_brut, b.csg_salarie, b.nsf_salarie, b.paye,
      COALESCE(b.montant_absence, 0) + COALESCE(b.montant_ul, 0)
    )
) > 1;

COMMENT ON VIEW public.v_bulletins_paie_incoherents IS
  'Bulletins où salaire_net ≠ brut - (csg+nsf+paye+absence+UL). '
  'Devrait rester vide après mig 466 ; sinon investiguer.';

-- ── 3. Reprise ciblée : uniquement les bulletins NON comptabilisés ──────────
-- On ne touche PAS les bulletins déjà comptabilisés (payslips émis, écritures
-- bouclées) — leur reprise est une décision métier distincte. Le trigger
-- recalcule net + total_deductions au passage.
DO $$
DECLARE
  nb_fix INTEGER := 0;
BEGIN
  UPDATE public.bulletins_paie
  SET salaire_net = public.compute_salaire_net(
        salaire_brut, csg_salarie, nsf_salarie, paye,
        COALESCE(montant_absence, 0) + COALESCE(montant_ul, 0)
      )
  WHERE COALESCE(comptabilise, false) = false
    AND COALESCE(is_archived, false) = false
    AND superseded_by IS NULL
    AND COALESCE(montant_ul, 0) > 0
    AND ABS(
      COALESCE(salaire_net, 0)
      - public.compute_salaire_net(
          salaire_brut, csg_salarie, nsf_salarie, paye,
          COALESCE(montant_absence, 0) + COALESCE(montant_ul, 0)
        )
    ) > 1;
  GET DIAGNOSTICS nb_fix = ROW_COUNT;
  RAISE NOTICE 'mig 466 : % bulletins non comptabilisés corrigés (UL réintégré au net)', nb_fix;
END $$;
