-- Table pour tracker les jobs de batch re-analyse OCR
-- Admin-only : permet de relancer l'extraction IA sur un ensemble de documents
-- déjà uploadés, pour tester les améliorations du pipeline (validation-rules,
-- confidence-scorer, suggest-account, workflow_action).
CREATE TABLE IF NOT EXISTS public.batch_reanalyze_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  societe_id UUID REFERENCES public.societes(id) ON DELETE SET NULL,
  filters JSONB,
  total_documents INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  stats JSONB DEFAULT '{}'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_reanalyze_status ON public.batch_reanalyze_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_reanalyze_initiator ON public.batch_reanalyze_jobs(initiated_by);

COMMENT ON TABLE public.batch_reanalyze_jobs IS 'Tracker des jobs de batch re-analyse OCR (admin-only). Utile pour monitoring + audit.';

ALTER TABLE public.batch_reanalyze_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='batch_reanalyze_jobs' AND policyname='batch_jobs_admin_read') THEN
    CREATE POLICY batch_jobs_admin_read ON public.batch_reanalyze_jobs
      FOR SELECT TO authenticated
      USING (
        initiated_by = auth.uid()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin','super_admin')
      );
  END IF;
END $$;
