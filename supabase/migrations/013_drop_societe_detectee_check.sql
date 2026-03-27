-- ============================================================
-- Migration 013: Drop societe_detectee check constraint
-- Allow any company name, not just the 4 hardcoded ones
-- ============================================================

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_societe_detectee_check;
