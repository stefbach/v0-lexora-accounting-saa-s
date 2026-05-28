-- ============================================================
-- LEXORA — Migration 446 : Rattrapage & suivi déclaratif TVA
-- ------------------------------------------------------------
-- Objectif : permettre de savoir, période par période, ce qui a
-- été déclaré à la MRA et ce qui ne l'a pas été (reprise de
-- comptabilité, oublis de déclaration, années antérieures), et
-- de calculer le montant total de TVA à régulariser.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Supprimer le CHECK bloquant sur tva_mensuelle.societe
-- ------------------------------------------------------------
-- La contrainte d'origine (migration 001) limitait `societe` à
-- 4 valeurs legacy (TIBOK/BPO/OBESITY_CARE/NHS_S2). Conséquence :
-- l'upsert de tva/calculer échouait SILENCIEUSEMENT pour toute
-- autre société → aucune persistance, donc rien à suivre. On la
-- supprime pour que le calcul TVA se persiste pour TOUTES les
-- sociétés (prérequis indispensable au rattrapage).
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tva_mensuelle'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%TIBOK%'
  LOOP
    EXECUTE format('ALTER TABLE public.tva_mensuelle DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- `societe` (nom libre) ne doit plus être obligatoire
ALTER TABLE public.tva_mensuelle ALTER COLUMN societe DROP NOT NULL;

-- ------------------------------------------------------------
-- 2) Élargir statut_declaration pour autoriser 'paye'
-- ------------------------------------------------------------
-- L'UI utilise déjà le statut 'paye' mais la contrainte d'origine
-- ne l'autorisait pas (a_faire/declare/en_retard uniquement).
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tva_mensuelle'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%statut_declaration%'
  LOOP
    EXECUTE format('ALTER TABLE public.tva_mensuelle DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.tva_mensuelle
  ADD CONSTRAINT tva_mensuelle_statut_declaration_check
  CHECK (statut_declaration IN ('a_faire', 'declare', 'en_retard', 'paye'));

-- ------------------------------------------------------------
-- 3) Colonnes de suivi du rattrapage sur tva_mensuelle
-- ------------------------------------------------------------
ALTER TABLE public.tva_mensuelle
  -- Marque une déclaration de régularisation (période rattrapée)
  ADD COLUMN IF NOT EXISTS is_rattrapage       BOOLEAN DEFAULT false,
  -- Montant réellement déclaré à la MRA (saisi manuellement) —
  -- sert à détecter un écart avec la TVA recalculée
  ADD COLUMN IF NOT EXISTS montant_declare_mra NUMERIC(15,2);

-- Origine de la ligne : calcul automatique vs saisie manuelle
-- (reprise compta / période antérieure sans écritures).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tva_mensuelle'
      AND column_name = 'source_saisie'
  ) THEN
    ALTER TABLE public.tva_mensuelle
      ADD COLUMN source_saisie TEXT NOT NULL DEFAULT 'calcul'
      CHECK (source_saisie IN ('calcul', 'manuel'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) Date de début d'assujettissement TVA / reprise de compta
-- ------------------------------------------------------------
-- Point de départ de la timeline déclarative pour une société
-- (ex. date d'enregistrement TVA, ou date de reprise du dossier).
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS tva_date_debut DATE;

COMMENT ON COLUMN public.societes.tva_date_debut IS
  'Date d''assujettissement TVA / reprise de comptabilité — point de départ du suivi déclaratif (rattrapage).';
COMMENT ON COLUMN public.tva_mensuelle.is_rattrapage IS
  'true = déclaration de régularisation (rattrapage d''une période oubliée).';
COMMENT ON COLUMN public.tva_mensuelle.montant_declare_mra IS
  'Montant de TVA nette effectivement déclaré à la MRA (saisie manuelle) pour détection d''écart.';
COMMENT ON COLUMN public.tva_mensuelle.source_saisie IS
  'calcul = issu des écritures ; manuel = saisi (reprise / période antérieure).';
