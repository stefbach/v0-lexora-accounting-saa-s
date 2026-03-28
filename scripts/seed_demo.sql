-- Seed démo pour csbach@tibok.mu
-- Exécuter dans Supabase SQL Editor

INSERT INTO public.societes (nom, brn, numero_tva_mra, secteur_activite, created_by, ern, statut_tva)
SELECT 'Digital Data Solutions Ltd', 'C20173522', '27816949', 'Technologies de l information', id, 'ERN-DDS-001', true
FROM public.profiles WHERE email = 'csbach@tibok.mu'
ON CONFLICT (brn) DO UPDATE SET created_by = EXCLUDED.created_by, ern = EXCLUDED.ern, numero_tva_mra = EXCLUDED.numero_tva_mra;

INSERT INTO public.societes (nom, brn, secteur_activite, created_by, statut_tva)
SELECT 'Obesity Care Clinic', 'C187118', 'Sante', id, false
FROM public.profiles WHERE email = 'csbach@tibok.mu'
ON CONFLICT (brn) DO UPDATE SET created_by = EXCLUDED.created_by;

SELECT id, nom, brn, created_by FROM public.societes WHERE brn IN ('C20173522','C187118');
