-- ============================================================
-- Migration 110: Fix imported bulletins — recalculate primes
-- ============================================================
-- salaire_brut is a GENERATED column:
--   salaire_brut = salaire_base + increment_salaire + heures_sup_montant +
--                  transport_allowance + petrol_allowance +
--                  special_allowance_1 + special_allowance_2 + special_allowance_3 +
--                  other_refund + eoy_bonus + departure_notice
--
-- So we CANNOT update salaire_brut directly.
-- Instead, we fix special_allowance_1 to contain ALL primes/allowances.
--
-- The formula:
--   salaire_net = salaire_brut - total_deductions
--   => salaire_brut = salaire_net + total_deductions
--   => special_allowance_1 = salaire_brut - salaire_base - heures_sup_montant
--                            - transport - petrol - increment - eoy - departure - other
--                            - special_allowance_2 - special_allowance_3
-- ============================================================

-- STEP 1: Fix total_deductions if missing (sum individual deductions)
UPDATE public.bulletins_paie
SET total_deductions = COALESCE(csg_salarie, 0) + COALESCE(nsf_salarie, 0) + COALESCE(paye, 0) + COALESCE(montant_absence, 0)
WHERE (total_deductions IS NULL OR total_deductions = 0)
  AND (COALESCE(csg_salarie, 0) + COALESCE(nsf_salarie, 0) + COALESCE(paye, 0)) > 0;

-- STEP 2: Calculate what salaire_brut SHOULD be (net + deductions)
-- Then back-calculate special_allowance_1 = expected_brut - base - OT - other components
UPDATE public.bulletins_paie
SET special_allowance_1 = GREATEST(
    (COALESCE(salaire_net, 0) + COALESCE(total_deductions, 0))  -- this is the real brut
    - COALESCE(salaire_base, 0)
    - COALESCE(increment_salaire, 0)
    - COALESCE(heures_sup_montant, 0)
    - COALESCE(transport_allowance, 0)
    - COALESCE(petrol_allowance, 0)
    - COALESCE(special_allowance_2, 0)
    - COALESCE(special_allowance_3, 0)
    - COALESCE(other_refund, 0)
    - COALESCE(eoy_bonus, 0)
    - COALESCE(departure_notice, 0),
    0  -- never negative
  )
WHERE COALESCE(salaire_net, 0) > 0
  AND (
    -- Case 1: primes are 0 but brut should be higher
    (COALESCE(special_allowance_1, 0) = 0 AND COALESCE(salaire_net, 0) + COALESCE(total_deductions, 0) > COALESCE(salaire_base, 0) + COALESCE(heures_sup_montant, 0))
    OR
    -- Case 2: current brut (generated) < net (impossible — means primes missing)
    (salaire_brut < salaire_net)
  );

-- STEP 3: Fix total_charges_patronales if missing
UPDATE public.bulletins_paie
SET total_charges_patronales = COALESCE(csg_patronal, 0) + COALESCE(nsf_patronal, 0) + COALESCE(training_levy, 0) + COALESCE(prgf, 0)
WHERE (total_charges_patronales IS NULL OR total_charges_patronales = 0)
  AND (COALESCE(csg_patronal, 0) + COALESCE(nsf_patronal, 0)) > 0;

-- NOTE: cout_total_employeur does NOT exist as a column in bulletins_paie
-- It is calculated at runtime in the API: salaire_brut + total_charges_patronales

-- STEP 4: Verify — count fixed bulletins
DO $$
DECLARE
  total_count INTEGER;
  brut_ok INTEGER;
  brut_wrong INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM public.bulletins_paie WHERE COALESCE(salaire_net, 0) > 0;
  SELECT COUNT(*) INTO brut_ok FROM public.bulletins_paie WHERE salaire_brut >= salaire_net AND COALESCE(salaire_net, 0) > 0;
  SELECT COUNT(*) INTO brut_wrong FROM public.bulletins_paie WHERE salaire_brut < salaire_net AND COALESCE(salaire_net, 0) > 0;
  RAISE NOTICE 'Fix result: % bulletins total, % brut >= net (OK), % brut < net (still wrong)', total_count, brut_ok, brut_wrong;
END $$;
