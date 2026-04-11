-- ============================================================
-- 108 — Stockage PDF factures
-- ============================================================

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS pdf_url     TEXT,
  ADD COLUMN IF NOT EXISTS pdf_stored_at TIMESTAMPTZ;

-- Bucket storage pour PDFs factures (à créer manuellement dans Supabase Dashboard)
-- Bucket name : factures-pdf
-- Public : false (accès via signed URL)

COMMENT ON COLUMN public.factures.pdf_url IS 'URL Supabase Storage du PDF figé à la finalisation';
COMMENT ON COLUMN public.factures.pdf_stored_at IS 'Date de génération et stockage du PDF';
