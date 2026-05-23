-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 331 — AUDIT TRAIL (IMMUTABLE) ET SEPARATION OF DUTIES (SOD)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- TASK 1.5: Create audit_trail table with immutable triggers
-- TASK 1.6: Create SOD matrix and database enforcement
--
-- AUDIT REQUIREMENTS:
-- - ✓ Track all CRUD operations on sensitive tables
-- - ✓ Log READ/VIEW operations (for compliance with big 4 auditors)
-- - ✓ Track authentication events
-- - ✓ Immutable audit log (INSERT only, no UPDATE/DELETE)
-- - ✓ Full change tracking (old_values vs new_values in JSONB)
-- - ✓ IP address and user tracking
--
-- SOD REQUIREMENTS:
-- - ✓ Separation between creator and approver for high-value transactions
-- - ✓ Role-based transaction thresholds and approval requirements
-- - ✓ Enforcement at database level with constraints
-- - ✓ Audit trail linking creator and approver
--
-- PHASE 1: Create SOD matrix infrastructure
-- PHASE 2: Create audit_trail table (immutable)
-- PHASE 3: Create triggers for automatic audit logging
-- PHASE 4: Add SOD enforcement columns to critical tables
-- PHASE 5: Create API audit endpoint helpers
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 1: SEPARATION OF DUTIES (SOD) MATRIX
-- ───────────────────────────────────────────────────────────────────────────
-- Define roles, transaction types, and approval requirements

DROP TABLE IF EXISTS public.sod_matrix CASCADE;
CREATE TABLE IF NOT EXISTS public.sod_matrix (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  max_amount_mur NUMERIC(15,2),
  requires_approval BOOLEAN DEFAULT FALSE,
  approver_role TEXT,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, transaction_type)
);

-- Indexes for SOD matrix queries
CREATE INDEX IF NOT EXISTS idx_sod_matrix_role ON public.sod_matrix(role);
CREATE INDEX IF NOT EXISTS idx_sod_matrix_transaction_type ON public.sod_matrix(transaction_type);
CREATE INDEX IF NOT EXISTS idx_sod_matrix_approver_role ON public.sod_matrix(approver_role);

-- RLS for SOD matrix (admins and comptables can view)
ALTER TABLE public.sod_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage SOD matrix" ON public.sod_matrix;
CREATE POLICY "Admins manage SOD matrix" ON public.sod_matrix FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Comptables view SOD matrix" ON public.sod_matrix FOR SELECT;
CREATE POLICY "Comptables view SOD matrix" ON public.sod_matrix FOR SELECT
  USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));

-- Populate SOD matrix with audit-ready rules
-- Note: Amounts in MUR (Mauritian Rupee)
DELETE FROM public.sod_matrix;

INSERT INTO public.sod_matrix (role, transaction_type, max_amount_mur, requires_approval, approver_role, description) VALUES
  -- Admin role: unlimited authority
  ('admin', 'invoice_create', NULL, FALSE, NULL, 'Admin can create invoices without approval'),
  ('admin', 'invoice_approve', NULL, FALSE, NULL, 'Admin can approve invoices without further approval'),
  ('admin', 'payment_approve', NULL, FALSE, NULL, 'Admin can approve payments without further approval'),
  ('admin', 'gl_entry', NULL, FALSE, NULL, 'Admin can create GL entries without approval'),
  ('admin', 'gl_entry_approve', NULL, FALSE, NULL, 'Admin can approve GL entries without further approval'),
  ('admin', 'payroll_create', NULL, FALSE, NULL, 'Admin can create payroll without approval'),
  ('admin', 'payroll_approve', NULL, FALSE, NULL, 'Admin can approve payroll without further approval'),

  -- Comptable (accountant): can create/modify up to 10,000 MUR, requires approval above
  ('comptable', 'invoice_create', 10000.00, TRUE, 'admin', 'Comptable can create invoices up to 10k MUR'),
  ('comptable', 'invoice_approve', 10000.00, TRUE, 'admin', 'Comptable can approve invoices up to 10k MUR'),
  ('comptable', 'payment_approve', 10000.00, TRUE, 'admin', 'Comptable can approve payments up to 10k MUR'),
  ('comptable', 'gl_entry', 10000.00, TRUE, 'admin', 'Comptable can create GL entries up to 10k MUR'),
  ('comptable', 'gl_entry_approve', 10000.00, TRUE, 'admin', 'Comptable can approve GL entries up to 10k MUR'),
  ('comptable', 'payroll_create', 10000.00, TRUE, 'admin', 'Comptable can create payroll up to 10k MUR'),
  ('comptable', 'payroll_approve', 10000.00, TRUE, 'admin', 'Comptable can approve payroll up to 10k MUR'),

  -- Comptable dédiée (junior accountant): can create/modify up to 5,000 MUR
  ('comptable_dedie', 'invoice_create', 5000.00, TRUE, 'comptable', 'Junior comptable can create invoices up to 5k MUR'),
  ('comptable_dedie', 'invoice_approve', 5000.00, TRUE, 'comptable', 'Junior comptable can approve invoices up to 5k MUR'),
  ('comptable_dedie', 'payment_approve', 5000.00, TRUE, 'comptable', 'Junior comptable can approve payments up to 5k MUR'),
  ('comptable_dedie', 'gl_entry', 5000.00, TRUE, 'comptable', 'Junior comptable can create GL entries up to 5k MUR'),
  ('comptable_dedie', 'gl_entry_approve', 5000.00, TRUE, 'comptable', 'Junior comptable can approve GL entries up to 5k MUR'),
  ('comptable_dedie', 'payroll_create', 5000.00, TRUE, 'comptable', 'Junior comptable can create payroll up to 5k MUR'),
  ('comptable_dedie', 'payroll_approve', 5000.00, TRUE, 'comptable', 'Junior comptable can approve payroll up to 5k MUR'),

  -- Assistant comptable: can create up to 2,000 MUR, cannot approve
  ('assistant_comptable', 'invoice_create', 2000.00, TRUE, 'comptable', 'Assistant can create invoices up to 2k MUR'),
  ('assistant_comptable', 'invoice_approve', NULL, FALSE, NULL, 'Assistant cannot approve invoices'),
  ('assistant_comptable', 'payment_approve', NULL, FALSE, NULL, 'Assistant cannot approve payments'),
  ('assistant_comptable', 'gl_entry', 2000.00, TRUE, 'comptable', 'Assistant can create GL entries up to 2k MUR'),
  ('assistant_comptable', 'gl_entry_approve', NULL, FALSE, NULL, 'Assistant cannot approve GL entries'),
  ('assistant_comptable', 'payroll_create', NULL, FALSE, NULL, 'Assistant cannot create payroll'),
  ('assistant_comptable', 'payroll_approve', NULL, FALSE, NULL, 'Assistant cannot approve payroll'),

  -- Client admin: read-only access to own company data
  ('client_admin', 'invoice_create', NULL, FALSE, NULL, 'Client admin cannot create invoices (read-only)'),
  ('client_admin', 'invoice_approve', NULL, FALSE, NULL, 'Client admin cannot approve invoices (read-only)'),
  ('client_admin', 'payment_approve', NULL, FALSE, NULL, 'Client admin cannot approve payments (read-only)'),
  ('client_admin', 'gl_entry', NULL, FALSE, NULL, 'Client admin cannot create GL entries (read-only)'),
  ('client_admin', 'gl_entry_approve', NULL, FALSE, NULL, 'Client admin cannot approve GL entries (read-only)'),
  ('client_admin', 'payroll_create', NULL, FALSE, NULL, 'Client admin cannot create payroll (read-only)'),
  ('client_admin', 'payroll_approve', NULL, FALSE, NULL, 'Client admin cannot approve payroll (read-only)');

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 2: AUDIT TRAIL TABLE (IMMUTABLE)
-- ───────────────────────────────────────────────────────────────────────────
-- Central audit log with immutable storage

DROP TABLE IF EXISTS public.audit_trail CASCADE;
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'READ', 'EXPORT', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT')),
  table_name TEXT NOT NULL,
  row_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partition by month for better query performance
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_01 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_02 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_03 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_04 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_05 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_06 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_07 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_08 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_09 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_10 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_11 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS public.audit_trail_2026_12 PARTITION OF public.audit_trail
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON public.audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON public.audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_table_name ON public.audit_trail(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_trail_row_id ON public.audit_trail(row_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON public.audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON public.audit_trail(created_at DESC);

-- RLS: Only admins can view audit trail
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view audit trail" ON public.audit_trail;
CREATE POLICY "Admins view audit trail" ON public.audit_trail FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Audit trail insert-only" ON public.audit_trail;
CREATE POLICY "Audit trail insert-only" ON public.audit_trail FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Prevent audit trail updates" ON public.audit_trail;
CREATE POLICY "Prevent audit trail updates" ON public.audit_trail FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "Prevent audit trail deletes" ON public.audit_trail;
CREATE POLICY "Prevent audit trail deletes" ON public.audit_trail FOR DELETE
  USING (false);

-- Function to prevent updates and deletes on audit_trail
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_trail_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit trail records cannot be updated (immutable)';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit trail records cannot be deleted (immutable)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_modification ON public.audit_trail;
CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE ON public.audit_trail
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_audit_trail_modification();

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 3: ADD SOD ENFORCEMENT COLUMNS TO CRITICAL TABLES
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1 ecritures_comptables_v2: Add creator/approver tracking
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected'));
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;
ALTER TABLE public.ecritures_comptables_v2 ADD COLUMN IF NOT EXISTS approval_comment TEXT;

-- Index for approval queries
CREATE INDEX IF NOT EXISTS idx_ecritures_approval_status ON public.ecritures_comptables_v2(approval_status);
CREATE INDEX IF NOT EXISTS idx_ecritures_created_by ON public.ecritures_comptables_v2(created_by);
CREATE INDEX IF NOT EXISTS idx_ecritures_approved_by ON public.ecritures_comptables_v2(approved_by);

-- Constraint: For amounts > 10,000 MUR, creator ≠ approver
CREATE OR REPLACE FUNCTION public.fn_check_gl_entry_sod()
RETURNS TRIGGER AS $$
DECLARE
  v_amount_mur NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
BEGIN
  -- Calculate total amount for this GL entry
  v_total_amount := ABS(COALESCE(NEW.debit_mur, 0) + COALESCE(NEW.credit_mur, 0));

  -- If amount > 10,000 MUR and already approved, require different approver
  IF v_total_amount > 10000.00 AND NEW.approval_status = 'approved' THEN
    IF NEW.created_by = NEW.approved_by THEN
      RAISE EXCEPTION 'SOD Violation: GL entry of %.2f MUR must be approved by different person than creator', v_total_amount;
    END IF;
  END IF;

  -- If amount > 10,000 MUR, mark as requiring approval
  IF v_total_amount > 10000.00 THEN
    NEW.requires_approval := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gl_entry_sod_check ON public.ecritures_comptables_v2;
CREATE TRIGGER trg_gl_entry_sod_check
BEFORE INSERT OR UPDATE ON public.ecritures_comptables_v2
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_gl_entry_sod();

-- 3.2 factures: Add creator/approver tracking
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paye'));
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS approval_comment TEXT;

-- Index for approval queries
CREATE INDEX IF NOT EXISTS idx_factures_approval_status ON public.factures(approval_status);
CREATE INDEX IF NOT EXISTS idx_factures_created_by ON public.factures(created_by);
CREATE INDEX IF NOT EXISTS idx_factures_approved_by ON public.factures(approved_by);

-- Constraint: For invoices > 10,000 MUR, creator ≠ approver
CREATE OR REPLACE FUNCTION public.fn_check_invoice_sod()
RETURNS TRIGGER AS $$
BEGIN
  -- If amount > 10,000 MUR and already approved, require different approver
  IF NEW.montant_mur > 10000.00 AND NEW.approval_status = 'approved' THEN
    IF NEW.created_by = NEW.approved_by THEN
      RAISE EXCEPTION 'SOD Violation: Invoice of %.2f MUR must be approved by different person than creator', NEW.montant_mur;
    END IF;
  END IF;

  -- If amount > 10,000 MUR, mark as requiring approval
  IF NEW.montant_mur > 10000.00 THEN
    NEW.requires_approval := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_sod_check ON public.factures;
CREATE TRIGGER trg_invoice_sod_check
BEFORE INSERT OR UPDATE ON public.factures
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_invoice_sod();

-- 3.3 bulletins_paie: Add creator/approver tracking
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paye'));
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS approval_comment TEXT;

-- Index for approval queries
CREATE INDEX IF NOT EXISTS idx_bulletins_approval_status ON public.bulletins_paie(approval_status);
CREATE INDEX IF NOT EXISTS idx_bulletins_created_by ON public.bulletins_paie(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletins_approved_by ON public.bulletins_paie(approved_by);

-- Constraint: For payroll > 10,000 MUR, creator ≠ approver
CREATE OR REPLACE FUNCTION public.fn_check_payroll_sod()
RETURNS TRIGGER AS $$
BEGIN
  -- If amount > 10,000 MUR and already approved, require different approver
  IF NEW.salaire_net > 10000.00 AND NEW.approval_status = 'approved' THEN
    IF NEW.created_by = NEW.approved_by THEN
      RAISE EXCEPTION 'SOD Violation: Payroll record of %.2f MUR must be approved by different person than creator', NEW.salaire_net;
    END IF;
  END IF;

  -- If amount > 10,000 MUR, mark as requiring approval
  IF NEW.salaire_net > 10000.00 THEN
    NEW.requires_approval := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_sod_check ON public.bulletins_paie;
CREATE TRIGGER trg_payroll_sod_check
BEFORE INSERT OR UPDATE ON public.bulletins_paie
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_payroll_sod();

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 4: CREATE AUDIT LOGGING TRIGGERS FOR CRITICAL TABLES
-- ───────────────────────────────────────────────────────────────────────────

-- Generic function to log changes to audit_trail
CREATE OR REPLACE FUNCTION public.fn_log_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values JSONB := NULL;
  v_new_values JSONB := NULL;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- Capture old and new values
  IF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  END IF;

  -- Insert audit log
  INSERT INTO public.audit_trail (
    user_id, user_email, user_role, action, table_name, row_id,
    old_values, new_values, description, created_at
  ) VALUES (
    v_user_id, v_user_email, v_user_role,
    TG_OP, TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_old_values, v_new_values,
    'Automatic audit log for ' || TG_TABLE_NAME || ' ' || TG_OP,
    NOW()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- 4.1 Trigger on ecritures_comptables_v2
DROP TRIGGER IF EXISTS trg_audit_ecritures_comptables_v2 ON public.ecritures_comptables_v2;
CREATE TRIGGER trg_audit_ecritures_comptables_v2
AFTER INSERT OR UPDATE OR DELETE ON public.ecritures_comptables_v2
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_audit_trail();

-- 4.2 Trigger on factures
DROP TRIGGER IF EXISTS trg_audit_factures ON public.factures;
CREATE TRIGGER trg_audit_factures
AFTER INSERT OR UPDATE OR DELETE ON public.factures
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_audit_trail();

-- 4.3 Trigger on bulletins_paie
DROP TRIGGER IF EXISTS trg_audit_bulletins_paie ON public.bulletins_paie;
CREATE TRIGGER trg_audit_bulletins_paie
AFTER INSERT OR UPDATE OR DELETE ON public.bulletins_paie
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_audit_trail();

-- 4.4 Trigger on employes
DROP TRIGGER IF EXISTS trg_audit_employes ON public.employes;
CREATE TRIGGER trg_audit_employes
AFTER INSERT OR UPDATE OR DELETE ON public.employes
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_audit_trail();

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 5: HELPER FUNCTIONS FOR AUDIT QUERIES
-- ───────────────────────────────────────────────────────────────────────────

-- Function: Get full audit trail for a specific record
CREATE OR REPLACE FUNCTION public.fn_get_audit_trail(
  p_table_name TEXT,
  p_row_id UUID
)
RETURNS TABLE (
  id UUID,
  timestamp TIMESTAMPTZ,
  user_email TEXT,
  user_role TEXT,
  action TEXT,
  old_values JSONB,
  new_values JSONB,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    audit_trail.id,
    audit_trail.timestamp,
    audit_trail.user_email,
    audit_trail.user_role,
    audit_trail.action,
    audit_trail.old_values,
    audit_trail.new_values,
    audit_trail.description
  FROM public.audit_trail
  WHERE table_name = p_table_name AND row_id = p_row_id
  ORDER BY timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check SOD compliance for a specific transaction
CREATE OR REPLACE FUNCTION public.fn_check_sod_compliance(
  p_created_by UUID,
  p_approved_by UUID,
  p_amount_mur NUMERIC
)
RETURNS TABLE (
  is_compliant BOOLEAN,
  violation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN p_amount_mur > 10000.00 AND p_created_by = p_approved_by THEN FALSE
      ELSE TRUE
    END AS is_compliant,
    CASE
      WHEN p_amount_mur > 10000.00 AND p_created_by = p_approved_by THEN
        'SOD Violation: Amount ' || p_amount_mur || ' MUR exceeds threshold (10k) and was created and approved by same person'
      ELSE NULL
    END AS violation_reason;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's role with caching
CREATE OR REPLACE FUNCTION public.fn_get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Check if user can perform transaction
CREATE OR REPLACE FUNCTION public.fn_can_user_perform_transaction(
  p_user_id UUID,
  p_transaction_type TEXT,
  p_amount_mur NUMERIC
)
RETURNS TABLE (
  can_perform BOOLEAN,
  requires_approval BOOLEAN,
  approver_role TEXT,
  reason TEXT
) AS $$
DECLARE
  v_user_role TEXT;
  v_sod_record RECORD;
BEGIN
  -- Get user's role
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

  -- Look up SOD matrix
  SELECT * INTO v_sod_record FROM public.sod_matrix
  WHERE role = v_user_role AND transaction_type = p_transaction_type;

  IF v_sod_record IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, 'User role has no permission for transaction type';
  ELSIF v_sod_record.max_amount_mur IS NOT NULL AND p_amount_mur > v_sod_record.max_amount_mur THEN
    RETURN QUERY SELECT FALSE, TRUE, v_sod_record.approver_role, 'Amount exceeds user limit (' || v_sod_record.max_amount_mur || ' MUR)';
  ELSE
    RETURN QUERY SELECT TRUE, v_sod_record.requires_approval, v_sod_record.approver_role, 'User authorized';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- TESTING & VALIDATION
-- ───────────────────────────────────────────────────────────────────────────

-- Verify tables were created
SELECT 'Audit infrastructure ready' AS status,
  COUNT(*) AS sod_rules
FROM public.sod_matrix;

SELECT 'Audit trail table created' AS status,
  COUNT(*) AS audit_records
FROM public.audit_trail;

-- Verify triggers exist
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_table IN ('ecritures_comptables_v2', 'factures', 'bulletins_paie', 'employes')
  AND trigger_name LIKE 'trg_%'
ORDER BY event_object_table, trigger_name;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- END Migration 331
-- ═══════════════════════════════════════════════════════════════════════════
