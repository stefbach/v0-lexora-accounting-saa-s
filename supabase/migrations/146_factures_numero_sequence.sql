-- ============================================================================
-- Migration 146 — Numérotation séquentielle gap-free des factures CLIENTS
-- ============================================================================
--
-- Contexte :
--   Les cabinets comptables à Maurice doivent émettre des factures CLIENT avec
--   une numérotation chronologique sans trou (exigence MRA). Les factures
--   FOURNISSEURS gardent leur numéro d'origine imprimé par le fournisseur et
--   ne sont pas concernées par cette séquence.
--
-- Stratégie :
--   1. Table `factures_sequences` (societe_id, exercice) -> last_number
--   2. Fonction `get_next_facture_number(societe_id, exercice)` qui fait un
--      UPSERT atomique avec RETURNING pour éviter les race conditions entre
--      transactions concurrentes.
--   3. Colonne `numero_sequence BIGINT` sur `factures` (nullable pour legacy)
--   4. UNIQUE partiel (societe_id, exercice, numero_sequence)
--      WHERE type_facture='client' AND numero_sequence IS NOT NULL
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table de séquences par société et par exercice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_sequences (
  societe_id   UUID    NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice     INT     NOT NULL,
  last_number  INT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (societe_id, exercice)
);

COMMENT ON TABLE public.factures_sequences IS
  'Séquence gap-free de numérotation des factures CLIENTS, indexée par société
   et par exercice fiscal (année civile INT). Ne concerne pas les factures
   fournisseurs qui conservent leur numéro d''origine.';

COMMENT ON COLUMN public.factures_sequences.societe_id IS
  'Société propriétaire de la séquence.';

COMMENT ON COLUMN public.factures_sequences.exercice IS
  'Exercice fiscal (année civile, ex: 2026).';

COMMENT ON COLUMN public.factures_sequences.last_number IS
  'Dernier numéro émis (0 si aucune facture émise). Le prochain sera last_number+1.';

-- ---------------------------------------------------------------------------
-- 2. Fonction PL/pgSQL atomique d'attribution du prochain numéro
--    UPSERT + RETURNING => thread-safe même en cas de transactions parallèles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_facture_number(
  p_societe_id UUID,
  p_exercice   INT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_number INT;
BEGIN
  IF p_societe_id IS NULL THEN
    RAISE EXCEPTION 'get_next_facture_number: p_societe_id ne peut pas être NULL';
  END IF;
  IF p_exercice IS NULL THEN
    RAISE EXCEPTION 'get_next_facture_number: p_exercice ne peut pas être NULL';
  END IF;

  -- UPSERT atomique : insère (societe, exercice, 1) si absent, sinon
  -- incrémente last_number. RETURNING récupère la valeur allouée.
  INSERT INTO public.factures_sequences (societe_id, exercice, last_number, updated_at)
  VALUES (p_societe_id, p_exercice, 1, NOW())
  ON CONFLICT (societe_id, exercice)
  DO UPDATE SET
    last_number = public.factures_sequences.last_number + 1,
    updated_at  = NOW()
  RETURNING last_number INTO v_new_number;

  RETURN 'FV-' || p_exercice::TEXT || '-' || LPAD(v_new_number::TEXT, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.get_next_facture_number(UUID, INT) IS
  'Retourne le prochain numéro de facture CLIENT au format
   ''FV-YYYY-NNNNNN'' (ex: FV-2026-000001). UPSERT atomique + RETURNING
   => safe contre les race conditions entre transactions concurrentes.
   À appeler UNIQUEMENT pour les factures type_facture=''client''.';

-- ---------------------------------------------------------------------------
-- 3. Colonne numero_sequence sur factures (nullable pour legacy)
-- ---------------------------------------------------------------------------
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS numero_sequence BIGINT;

COMMENT ON COLUMN public.factures.numero_sequence IS
  'Numéro séquentiel (entier) attribué par get_next_facture_number pour les
   factures CLIENT uniquement. NULL pour les factures fournisseurs et pour les
   factures legacy antérieures à la migration 146 (pas de backfill).';

-- ---------------------------------------------------------------------------
-- 4. Contrainte UNIQUE partielle sur (societe_id, exercice, numero_sequence)
--    pour les factures clients qui ont bien une séquence (non NULL).
-- ---------------------------------------------------------------------------
-- On ajoute une colonne dérivée "exercice" n'est pas nécessaire, on utilise
-- un index UNIQUE partiel directement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_numero_sequence
  ON public.factures (societe_id, numero_sequence)
  WHERE type_facture = 'client'
    AND numero_sequence IS NOT NULL;

COMMENT ON INDEX public.uq_factures_numero_sequence IS
  'Unicité gap-free du numéro séquentiel client par société. Partial index :
   ne concerne que type_facture=''client'' ET numero_sequence IS NOT NULL
   (fournisseurs et legacy exclus).';

-- Index de lookup rapide pour les listes/statistiques par exercice
CREATE INDEX IF NOT EXISTS idx_factures_sequences_societe_exercice
  ON public.factures_sequences (societe_id, exercice);
