-- Migration 116: Champ exclure_mra pour employés hors champs MRA
-- (travailleurs hors Maurice, expatriés, etc.)
-- Quand exclure_mra = true : pas de CSG, NSF, PAYE, pas dans les déclarations MRA

ALTER TABLE employes ADD COLUMN IF NOT EXISTS exclure_mra BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN employes.exclure_mra IS 'Employé hors champs MRA (pas de CSG/NSF/PAYE). Ex: travailleur hors Maurice.';
