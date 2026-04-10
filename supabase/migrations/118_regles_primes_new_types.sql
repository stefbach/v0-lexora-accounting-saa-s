-- Migration 118: Add new prime rule types for automatic allowances
-- Meal Allowance, Call Allowance, Night Shift, Astreinte types
-- Fixes error "violates check constraint" when creating these rules

ALTER TABLE public.regles_primes DROP CONSTRAINT IF EXISTS regles_primes_type_check;

ALTER TABLE public.regles_primes ADD CONSTRAINT regles_primes_type_check
  CHECK (type IN (
    'fixe',
    'pourcentage',
    'par_heure',
    'par_jour',
    'par_anciennete',
    'objectif',
    'assiduite',
    'meal_allowance',
    'call_allowance',
    'astreinte',
    'night_shift'
  ));
