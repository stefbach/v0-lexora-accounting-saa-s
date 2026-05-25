-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 430 — Colonnes Solde de Tout Compte (STC) sur bulletins_paie
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexte (bug Alicia 18/05/2026) :
--   Le calcul du Solde de Tout Compte dans /rh/depart accepte des retenues
--   manuelles (avances, acomptes, ajustements négatifs via `lignes_extra`).
--   Avant cette migration, ces ajustements n'avaient pas de colonne dédiée
--   et étaient noyés dans `special_allowance_2` (où ils pouvaient devenir
--   négatifs et se mélanger au 13e mois) + tracés uniquement en texte libre
--   dans `notes`. Conséquence : le bulletin de paie de sortie affichait un
--   montant différent du STC calculé dans /rh/depart.
--
-- Fix :
--   - `type_bulletin` : discrimine 'mensuel' vs 'solde_tout_compte'
--   - `retenues_manuelles` : somme des `lignes_extra` négatives (montant
--     positif stocké — ex. 5000 pour une retenue de 5000)
--   - `acomptes` : sous-catégorie séparée (réservé usage futur)
--   - `breakdown_json` : dump complet du breakdown calculé par /rh/depart
--     pour audit et reconstruction identique à l'identique
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS type_bulletin TEXT NOT NULL DEFAULT 'mensuel',
  ADD COLUMN IF NOT EXISTS retenues_manuelles NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acomptes NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakdown_json JSONB;

-- Contrainte CHECK : type_bulletin ∈ {'mensuel','solde_tout_compte'}.
-- On la pose en NOT VALID pour ne pas bloquer si d'anciennes lignes
-- contiennent NULL (la valeur par défaut couvre les nouvelles insertions).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bulletins_paie_type_bulletin_chk'
  ) THEN
    ALTER TABLE public.bulletins_paie
      ADD CONSTRAINT bulletins_paie_type_bulletin_chk
      CHECK (type_bulletin IN ('mensuel', 'solde_tout_compte')) NOT VALID;
  END IF;
END $$;

-- Index pour filtrer rapidement les STC dans /rh/historique-paie
CREATE INDEX IF NOT EXISTS idx_bulletins_paie_type_bulletin
  ON public.bulletins_paie (type_bulletin)
  WHERE type_bulletin = 'solde_tout_compte';

COMMENT ON COLUMN public.bulletins_paie.type_bulletin IS
  'Type de bulletin : "mensuel" (paie standard) ou "solde_tout_compte" (départ). FIX-STC-IDENTIQUE mig 430.';
COMMENT ON COLUMN public.bulletins_paie.retenues_manuelles IS
  'Somme des retenues manuelles saisies dans /rh/depart (avances, acomptes, ajustements négatifs). Montant positif. FIX-STC-IDENTIQUE mig 430.';
COMMENT ON COLUMN public.bulletins_paie.acomptes IS
  'Acomptes versés en cours de période (sous-catégorie des retenues). FIX-STC-IDENTIQUE mig 430.';
COMMENT ON COLUMN public.bulletins_paie.breakdown_json IS
  'Dump du breakdown calculé par /rh/depart (pour audit + reconstruction STC identique). FIX-STC-IDENTIQUE mig 430.';
