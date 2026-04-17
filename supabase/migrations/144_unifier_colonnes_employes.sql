-- Migration 144 : Sprint 14 FIX 1 — Unification des colonnes dupliquées
-- =====================================================================
-- Les migrations successives (015, 040, 047) ont créé des doublons :
--
--   ADRESSE:
--     address, address_2, postcode, city, mobile  (mig 040)
--     adresse, adresse2, code_postal, ville       (mig 047)
--   → Canonique : adresse, adresse2, code_postal, ville
--
--   GENRE:
--     genre (mig 015) + gender (mig 040)
--   → Canonique : genre
--
--   TYPE CONTRAT:
--     type_contrat (mig 040) + contrat_type (mig 047)
--   → Canonique : type_contrat
--
-- Stratégie : COALESCE backfill vers les colonnes canoniques.
-- On NE SUPPRIME PAS les anciennes colonnes (risque de casser des vues,
-- triggers ou clients legacy) — on garantit juste que les valeurs
-- canoniques sont remplies et que les APIs read/write les bonnes.
-- =====================================================================

-- 1. Backfill ADRESSE (address → adresse, etc.)
UPDATE public.employes
SET
  adresse     = COALESCE(adresse, address),
  adresse2    = COALESCE(adresse2, address_2),
  code_postal = COALESCE(code_postal, postcode),
  ville       = COALESCE(ville, city)
WHERE adresse IS NULL AND address IS NOT NULL
   OR adresse2 IS NULL AND address_2 IS NOT NULL
   OR code_postal IS NULL AND postcode IS NOT NULL
   OR ville IS NULL AND city IS NOT NULL;

-- 2. Backfill GENRE (gender → genre)
UPDATE public.employes
SET genre = COALESCE(genre, gender)
WHERE genre IS NULL AND gender IS NOT NULL;

-- 3. Backfill TYPE CONTRAT (contrat_type → type_contrat)
UPDATE public.employes
SET type_contrat = COALESCE(type_contrat, contrat_type)
WHERE type_contrat IS NULL AND contrat_type IS NOT NULL;

-- 4. Log résultats
DO $$
DECLARE
  addr_count INTEGER;
  genre_count INTEGER;
  contrat_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO addr_count FROM public.employes WHERE adresse IS NOT NULL;
  SELECT COUNT(*) INTO genre_count FROM public.employes WHERE genre IS NOT NULL;
  SELECT COUNT(*) INTO contrat_count FROM public.employes WHERE type_contrat IS NOT NULL;
  RAISE NOTICE 'Migration 144 résultats: % adresses remplies, % genres remplis, % type_contrat remplis', addr_count, genre_count, contrat_count;
END $$;
