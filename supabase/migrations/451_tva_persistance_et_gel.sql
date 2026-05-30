-- =============================================================================
-- Migration 451 — TVA : persistance robuste + gel des périodes déclarées
-- =============================================================================
-- PROBLÈME (constaté sur Digital Data Solutions, client_id NULL) :
--   La table tva_mensuelle a une contrainte UNIQUE (client_id, societe_id,
--   periode) et /api/comptable/tva/calculer fait
--       upsert(..., onConflict: 'client_id,societe_id,periode').
--   Or quand client_id IS NULL (sociétés seedées / sans client rattaché),
--   l'unicité ne joue pas comme attendu (NULL ≠ NULL en SQL) et l'upsert
--   échoue — erreur AVALÉE par la route (« Continuer malgré l'erreur »).
--   Conséquence : AUCUNE ligne tva_mensuelle n'est jamais persistée pour ces
--   sociétés → la TVA "se recalcule" à chaque ouverture, et il devient
--   impossible de figer / comparer ce qui a été réellement déclaré à la MRA.
--
--   En clair (cas utilisateur) : déclaration envoyée au comptable, puis
--   factures jan-avr ajoutées après → le système réaffiche une TVA
--   différente pour des mois déjà déclarés, sans trace de l'original.
--
-- CORRECTIFS :
--   1. Backfill client_id depuis societes.created_by quand NULL (cohérence).
--   2. Nouvelle contrainte UNIQUE (societe_id, periode) — une période TVA est
--      unique PAR SOCIÉTÉ (client_id redondant). Robuste au client_id NULL.
--   3. Colonnes de gel : declaration_figee, montant_declare_mra (déjà là via
--      mig 446), declare_at, declare_par, et stockage du RECALCUL postérieur
--      séparé du DÉCLARÉ (tva_nette_recalculee) pour exposer l'écart sans
--      écraser la déclaration d'origine.
-- =============================================================================

-- ── 1. Backfill client_id NULL depuis created_by ────────────────────────────
UPDATE public.tva_mensuelle t
SET client_id = s.created_by
FROM public.societes s
WHERE t.societe_id = s.id
  AND t.client_id IS NULL
  AND s.created_by IS NOT NULL;

-- ── 2. Contrainte d'unicité robuste : (societe_id, periode) ──────────────────
-- On garde l'ancienne (client_id, societe_id, periode) si présente (pas de
-- DROP destructif), mais on AJOUTE une UNIQUE sur (societe_id, periode) qui
-- est celle utilisée par l'upsert corrigé. Dédup préalable si doublons.
DO $$
BEGIN
  -- Supprimer d'éventuels doublons (societe_id, periode) en gardant le + récent
  DELETE FROM public.tva_mensuelle a
  USING public.tva_mensuelle b
  WHERE a.societe_id = b.societe_id
    AND a.periode = b.periode
    AND a.ctid < b.ctid;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tva_mensuelle'::regclass
      AND conname = 'tva_mensuelle_societe_periode_key'
  ) THEN
    ALTER TABLE public.tva_mensuelle
      ADD CONSTRAINT tva_mensuelle_societe_periode_key UNIQUE (societe_id, periode);
  END IF;
END $$;

-- ── 3. Colonnes de gel / suivi déclaratif ───────────────────────────────────
ALTER TABLE public.tva_mensuelle
  -- true = période verrouillée (déclaration envoyée à la MRA, ne plus écraser)
  ADD COLUMN IF NOT EXISTS declaration_figee     BOOLEAN NOT NULL DEFAULT false,
  -- horodatage + auteur du gel
  ADD COLUMN IF NOT EXISTS declare_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declare_par           UUID,
  -- recalcul POSTÉRIEUR (factures ajoutées après la déclaration) : stocké à
  -- part pour exposer l'écart SANS écraser le montant déclaré (montant_declare_mra)
  ADD COLUMN IF NOT EXISTS tva_nette_recalculee  NUMERIC(15,2);

COMMENT ON COLUMN public.tva_mensuelle.declaration_figee IS
  'true = période déclarée à la MRA et verrouillée — le recalcul ne réécrit plus les montants déclarés, il alimente tva_nette_recalculee (écart de régularisation).';
COMMENT ON COLUMN public.tva_mensuelle.tva_nette_recalculee IS
  'TVA nette recalculée depuis les écritures APRÈS gel (factures oubliées intégrées). Écart à régulariser = tva_nette_recalculee - montant_declare_mra.';
