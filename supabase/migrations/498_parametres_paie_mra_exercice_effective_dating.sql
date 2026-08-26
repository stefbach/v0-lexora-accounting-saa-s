-- =====================================================================
-- Migration 498 — Versionnement par EXERCICE des paramètres fiscaux/sociaux
-- =====================================================================
-- `parametres_paie_mra` est DÉJÀ la table de taux versionnée de Lexora
-- (CSG / NSF / PRGF / Training Levy / PAYE / CIT / salaire minimum), versionnée
-- par `annee` INTEGER + `actif`. L'audit demande un versionnement par exercice
-- fiscal ; on le formalise en ajoutant des dates d'effet (comme `nsf_baremes`),
-- pour résoudre les taux par plage de dates et non par heuristique `annee desc`.
--
-- ADDITIF : aucune colonne existante modifiée, aucun consommateur cassé
-- (les lookups actuels par `annee`/`actif` continuent de fonctionner).
-- =====================================================================

BEGIN;

ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS exercice   TEXT,
  ADD COLUMN IF NOT EXISTS date_debut DATE,
  ADD COLUMN IF NOT EXISTS date_fin   DATE;

UPDATE public.parametres_paie_mra
   SET exercice   = COALESCE(exercice, annee::text),
       date_debut = COALESCE(date_debut, make_date(annee, 1, 1)),
       date_fin   = COALESCE(date_fin,   make_date(annee, 12, 31))
 WHERE annee IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parametres_paie_mra_dates
  ON public.parametres_paie_mra(date_debut, date_fin);

COMMENT ON COLUMN public.parametres_paie_mra.date_debut IS
  'Date d''effet des taux (versionnement par exercice, mig 498). NULL = utiliser annee.';

COMMIT;
