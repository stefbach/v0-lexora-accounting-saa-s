-- ============================================================
-- Migration 011: Make dossiers.comptable_id nullable
-- Allows linking clients to societies without requiring
-- an accountant to be assigned first.
-- ============================================================

ALTER TABLE public.dossiers
  ALTER COLUMN comptable_id DROP NOT NULL;
