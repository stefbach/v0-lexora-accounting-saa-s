-- ============================================================
-- MIGRATION 129 — DB Health Check audit trail
-- ============================================================
-- Stores the result of each daily health check run so admins can
-- review what was auto-fixed vs what needs manual action, and revert
-- auto-fixes if they turn out to be wrong.

CREATE TABLE IF NOT EXISTS health_check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT NOW(),
  societe_id UUID REFERENCES societes(id) ON DELETE SET NULL,
  anomalies JSONB DEFAULT '[]'::jsonb,      -- {type, severity, details, count}[]
  auto_fixed JSONB DEFAULT '[]'::jsonb,     -- {type, table, id, old, new}[]
  needs_action JSONB DEFAULT '[]'::jsonb,   -- {type, severity, details}[]
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  duration_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_check_runs_societe_date
  ON health_check_runs (societe_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_check_runs_date
  ON health_check_runs (run_at DESC);

-- RLS: read for authenticated, write-only via service role (cron)
ALTER TABLE health_check_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_check_runs_read ON health_check_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin')
    )
  );

COMMENT ON TABLE health_check_runs IS 'Audit trail of daily DB health check runs — records anomalies found, auto-fixes applied, and items needing human action.';
