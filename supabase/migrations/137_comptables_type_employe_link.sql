-- ============================================================================
-- Migration 137 — comptables.type_comptable + employe_id + societe_cabinet
-- ============================================================================
--
-- Contexte : la table comptables existe depuis la mig 006 avec une colonne
-- `type` (valeurs 'principal' | 'dedie') qui mélange deux notions :
--   • le rôle d'accès Lexora (principal vs dedie)
--   • la nature contractuelle du comptable (employé interne vs prestataire
--     externe vs accès dédié à la plateforme)
--
-- Cette migration ajoute des colonnes orthogonales pour clarifier :
--
--   type_comptable   — nature contractuelle :
--                      'interne'  = salarié de la société, lié à employes
--                      'externe'  = prestataire externe (cabinet comptable),
--                                   lié à tiers_annuaire ou simplement nommé
--                                   via societe_cabinet
--                      'dedie'    = accès Lexora dédié, sans lien employé
--                                   (cas par défaut compatible avec existant)
--
--   employe_id       — FK vers employes(id) si type='interne'.
--                      Permet d'afficher le composant MonEspacePersonnel,
--                      le bulletin de paie, etc. dans l'espace comptable
--                      lui-même.
--
--   societe_cabinet  — Texte libre nom du cabinet comptable externe
--                      (ex. « PWC Mauritius », « EY Maurice »).
--                      Utilisé uniquement si type='externe'.
--
--   notes            — Texte libre pour annotations diverses (ex. « ne
--                      gère que la TVA », « part en mai 2026 »).
--
-- L'ancienne colonne `type` (principal/dedie) reste en place pour
-- rétrocompat — type_comptable est ADDITIONNEL, pas un remplacement.
--
-- Idempotent (IF NOT EXISTS + DO blocks).
-- ============================================================================

-- 1. Ajout des colonnes (nullable, valeur par défaut 'dedie' pour compat)
ALTER TABLE public.comptables
  ADD COLUMN IF NOT EXISTS type_comptable TEXT DEFAULT 'dedie',
  ADD COLUMN IF NOT EXISTS employe_id UUID,
  ADD COLUMN IF NOT EXISTS societe_cabinet TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. CHECK constraint sur les valeurs autorisées
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptables_type_comptable_check'
  ) THEN
    ALTER TABLE public.comptables
      ADD CONSTRAINT comptables_type_comptable_check
      CHECK (type_comptable IN ('interne', 'externe', 'dedie'));
  END IF;
END $$;

-- 3. FK employe_id → employes ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptables_employe_id_fkey'
  ) THEN
    ALTER TABLE public.comptables
      ADD CONSTRAINT comptables_employe_id_fkey
      FOREIGN KEY (employe_id)
      REFERENCES public.employes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. CHECK cohérence : si type='interne', employe_id devrait être renseigné.
--    Souple — on ne bloque pas (un comptable peut être passé en 'interne'
--    avant d'être lié), mais on documente l'intention via commentaire.
COMMENT ON COLUMN public.comptables.employe_id IS
  'Si type_comptable=''interne'', référence vers la fiche employé. Sinon NULL.';

COMMENT ON COLUMN public.comptables.societe_cabinet IS
  'Si type_comptable=''externe'', nom du cabinet comptable externe.';

COMMENT ON COLUMN public.comptables.type_comptable IS
  'Nature contractuelle : interne (salarié), externe (cabinet), dedie (accès Lexora seul).';

-- 5. Index partiel sur employe_id pour requêtes « le comptable interne X
--    a-t-il accès à... »
CREATE INDEX IF NOT EXISTS idx_comptables_employe_id
  ON public.comptables(employe_id)
  WHERE employe_id IS NOT NULL;

-- ============================================================================
-- 6. Sprint 2 — night_shift_pct paramétrable (TÂCHE 9 quick win)
-- ============================================================================
-- Auparavant le taux de majoration des heures de nuit était hardcodé à 15%
-- dans /api/rh/paie/route.ts (ligne 769). On expose désormais la valeur via
-- parametres_paie_mra pour qu'elle soit éditable depuis /rh/paie/parametres.
-- Défaut 0.15 = 15% (compat avec le code legacy).
ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS night_shift_pct NUMERIC(5,4) DEFAULT 0.15;

COMMENT ON COLUMN public.parametres_paie_mra.night_shift_pct IS
  'Majoration % de salaire base appliquée aux heures de nuit (21h-6h).
   0.15 = +15% par défaut. Lue par /api/rh/paie route.ts.';
