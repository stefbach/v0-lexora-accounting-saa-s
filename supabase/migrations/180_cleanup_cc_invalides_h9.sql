-- ============================================================
-- Migration 180 — Sprint bugs résiduels H9
--
-- Nettoyage des demandes_conges 'congé collectif' qui ont été
-- imposées à des employés arrivés APRÈS la date_debut du congé.
--
-- Cas réel Lexora : les employés 'New employe' et 'Test Nouveau'
-- (date_arrivee 2026-04-xx) se retrouvent avec des demandes AL
-- pour un CC du 22/12/2025 au 02/01/2026 qu'ils n'auraient jamais
-- dû recevoir.
--
-- On :
--   1. Snapshot des lignes à supprimer dans
--      `_demandes_conges_invalides_h9_backup` (inspection ultérieure).
--   2. Supprime les demandes où type_conge=AL, motif contient
--      'collectif' (ou est lié à un CC via conges_collectifs), et
--      la date_debut précède la date_arrivee de l'employé.
--
-- Le fix code (app/api/rh/conges/collectif/route.ts) empêche la
-- recréation de tels enregistrements.
--
-- IDEMPOTENTE.
-- ============================================================

-- 1. Table de backup (idempotente).
CREATE TABLE IF NOT EXISTS public._demandes_conges_invalides_h9_backup (
  LIKE public.demandes_conges INCLUDING ALL
);

-- La LIKE clause peut copier des indexes/PK. On leur ajoute un suffixe
-- safe — mais si déjà créé c'est no-op, donc on ajoute un deleted_at
-- seulement si la colonne n'existe pas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_demandes_conges_invalides_h9_backup'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public._demandes_conges_invalides_h9_backup
      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

COMMENT ON TABLE public._demandes_conges_invalides_h9_backup IS
  'H9 — Snapshot des demandes_conges AL/collectif imposées à des employés
   arrivés après la date_debut du CC. Supprimées le deleted_at.';

-- 2. Snapshot + suppression.
-- On identifie les demandes où :
--   - type_conge = 'AL'
--   - impose_par_societe = TRUE (signal qu'elle vient d'un CC)
--   - date_debut < employes.date_arrivee
WITH invalides AS (
  SELECT dc.*
  FROM public.demandes_conges dc
  JOIN public.employes e ON e.id = dc.employe_id
  WHERE dc.type_conge = 'AL'
    AND dc.impose_par_societe IS TRUE
    AND e.date_arrivee IS NOT NULL
    AND dc.date_debut < e.date_arrivee
)
INSERT INTO public._demandes_conges_invalides_h9_backup
SELECT *, NOW()::timestamptz AS deleted_at
FROM invalides
ON CONFLICT DO NOTHING;

DELETE FROM public.demandes_conges dc
USING public.employes e
WHERE dc.employe_id = e.id
  AND dc.type_conge = 'AL'
  AND dc.impose_par_societe IS TRUE
  AND e.date_arrivee IS NOT NULL
  AND dc.date_debut < e.date_arrivee;
