-- Migration 117: Primes fixes sur fiche employe
-- Pour les primes recurrentes incluses automatiquement chaque mois

ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_1 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_1_libelle TEXT DEFAULT '';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_2 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_2_libelle TEXT DEFAULT '';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_3 DECIMAL(10,2) DEFAULT 0;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS prime_fixe_3_libelle TEXT DEFAULT '';

COMMENT ON COLUMN employes.prime_fixe_1 IS 'Prime fixe mensuelle 1 (ex: prime de fonction, prime anciennete...)';
COMMENT ON COLUMN employes.prime_fixe_2 IS 'Prime fixe mensuelle 2';
COMMENT ON COLUMN employes.prime_fixe_3 IS 'Prime fixe mensuelle 3';
