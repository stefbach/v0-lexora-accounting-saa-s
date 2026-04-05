-- ============================================================
-- Migration 110: Recalculate salaire_brut for all imported bulletins
-- ============================================================
-- Problem: imported bulletins have salaire_brut = NULL or incorrect
-- because the import didn't sum all allowances.
--
-- Fix: recalculate from the fields we DO have:
-- salaire_brut = salaire_base + heures_sup_montant + special_allowance_1
--                + special_allowance_2 + special_allowance_3
--                + transport_allowance + petrol_allowance
--                + increment_salaire + eoy_bonus + other_refund
--
-- But the REAL brut can be back-calculated from net + deductions:
-- salaire_brut = salaire_net + total_deductions
-- This is the most reliable method since net is always correct from Excel.
-- ============================================================

-- STEP 1: Recalculate salaire_brut = net + total_deductions (most reliable)
UPDATE public.bulletins_paie
SET salaire_brut = COALESCE(salaire_net, 0) + COALESCE(total_deductions, 0)
WHERE source = 'import_excel'
  AND (salaire_brut IS NULL OR salaire_brut = 0 OR salaire_brut = salaire_base);

-- STEP 2: For bulletins where total_deductions is also wrong/null,
-- recalculate total_deductions from individual deduction fields
UPDATE public.bulletins_paie
SET total_deductions = COALESCE(csg_salarie, 0) + COALESCE(nsf_salarie, 0) + COALESCE(paye, 0) + COALESCE(montant_absence, 0)
WHERE source = 'import_excel'
  AND (total_deductions IS NULL OR total_deductions = 0)
  AND (COALESCE(csg_salarie, 0) + COALESCE(nsf_salarie, 0) + COALESCE(paye, 0)) > 0;

-- Re-run STEP 1 after fixing total_deductions
UPDATE public.bulletins_paie
SET salaire_brut = COALESCE(salaire_net, 0) + COALESCE(total_deductions, 0)
WHERE source = 'import_excel'
  AND (salaire_brut IS NULL OR salaire_brut = 0 OR salaire_brut = salaire_base)
  AND COALESCE(salaire_net, 0) > 0;

-- STEP 3: Calculate the "hidden primes" = brut - base - OT
-- and store in special_allowance_1 if it was 0
UPDATE public.bulletins_paie
SET special_allowance_1 = GREATEST(
    COALESCE(salaire_brut, 0) - COALESCE(salaire_base, 0) - COALESCE(heures_sup_montant, 0)
    - COALESCE(transport_allowance, 0) - COALESCE(petrol_allowance, 0)
    - COALESCE(increment_salaire, 0) - COALESCE(eoy_bonus, 0),
    0
  )
WHERE source = 'import_excel'
  AND (special_allowance_1 IS NULL OR special_allowance_1 = 0)
  AND COALESCE(salaire_brut, 0) > COALESCE(salaire_base, 0) + COALESCE(heures_sup_montant, 0);

-- STEP 4: Recalculate total_charges_patronales
UPDATE public.bulletins_paie
SET total_charges_patronales = COALESCE(csg_patronal, 0) + COALESCE(nsf_patronal, 0) + COALESCE(training_levy, 0) + COALESCE(prgf, 0)
WHERE source = 'import_excel'
  AND (total_charges_patronales IS NULL OR total_charges_patronales = 0)
  AND (COALESCE(csg_patronal, 0) + COALESCE(nsf_patronal, 0)) > 0;

-- STEP 5: Recalculate cout_total_employeur
UPDATE public.bulletins_paie
SET cout_total_employeur = COALESCE(salaire_brut, 0) + COALESCE(total_charges_patronales, 0)
WHERE source = 'import_excel'
  AND COALESCE(salaire_brut, 0) > 0;

-- STEP 6: Verify — show summary
DO $$
DECLARE
  total_bulletins INTEGER;
  fixed_brut INTEGER;
  fixed_primes INTEGER;
  still_zero INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_bulletins FROM public.bulletins_paie WHERE source = 'import_excel';
  SELECT COUNT(*) INTO fixed_brut FROM public.bulletins_paie WHERE source = 'import_excel' AND salaire_brut > 0 AND salaire_brut != salaire_base;
  SELECT COUNT(*) INTO fixed_primes FROM public.bulletins_paie WHERE source = 'import_excel' AND special_allowance_1 > 0;
  SELECT COUNT(*) INTO still_zero FROM public.bulletins_paie WHERE source = 'import_excel' AND (salaire_brut IS NULL OR salaire_brut = 0);
  RAISE NOTICE 'Recalculation complete: % total bulletins, % with correct brut, % with primes, % still zero brut', total_bulletins, fixed_brut, fixed_primes, still_zero;
END $$;
