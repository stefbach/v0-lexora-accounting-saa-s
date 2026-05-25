-- supabase/migrations/413_password_reset_audit.sql
-- WORM audit table for password resets (SEC-001 remediation)
--
-- Tracks every successful admin-driven password reset performed via
-- PATCH /api/admin/users/[id]/password. Append-only by RLS policy.

CREATE TABLE IF NOT EXISTS public.password_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_role TEXT NOT NULL,
  target_email TEXT,
  target_societe_id UUID,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_audit_actor
  ON public.password_reset_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_audit_target
  ON public.password_reset_audit(target_id, created_at DESC);

-- WORM : pas d'update, pas de delete via PostgREST
ALTER TABLE public.password_reset_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_audit_no_update ON public.password_reset_audit;
CREATE POLICY password_reset_audit_no_update ON public.password_reset_audit
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS password_reset_audit_no_delete ON public.password_reset_audit;
CREATE POLICY password_reset_audit_no_delete ON public.password_reset_audit
  FOR DELETE TO authenticated USING (false);

-- Lecture admin uniquement
DROP POLICY IF EXISTS password_reset_audit_select_admin ON public.password_reset_audit;
CREATE POLICY password_reset_audit_select_admin ON public.password_reset_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')
    )
  );
