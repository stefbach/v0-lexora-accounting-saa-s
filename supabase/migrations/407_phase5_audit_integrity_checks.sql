-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 333 — PHASE 5 TASK 5A: PRE-AUDIT DATA INTEGRITY VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MISSION: Final verification of data integrity before Big 4 audit kickoff
-- Timeline: Weeks 9-10
-- Deliverables: 5 comprehensive audit reports for auditor handoff
--
-- AUDIT TABLES (READ-ONLY, NON-DESTRUCTIVE):
-- 1. audit_gl_balance_verification — GL balance check
-- 2. audit_data_completeness — Missing field detection
-- 3. audit_data_accuracy — Duplicate/orphaned record detection
-- 4. audit_anomalies — Unusual transaction flagging
-- 5. audit_data_retention — Date range compliance
--
-- SUCCESS CRITERIA:
-- ✓ GL balanced to ±0.01 MUR (zero tolerance unless explained)
-- ✓ 100% data completeness in all required fields
-- ✓ 0 orphaned records or integrity violations
-- ✓ All anomalies documented and justified
-- ✓ Data ready for auditor CAAT import
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 1: GL BALANCE VERIFICATION TABLE
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.audit_gl_balance_verification CASCADE;
CREATE TABLE public.audit_gl_balance_verification (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  audit_date TIMESTAMPTZ DEFAULT NOW(),

  -- Balance totals
  total_debits_mur NUMERIC(15,2),
  total_credits_mur NUMERIC(15,2),
  difference_mur NUMERIC(15,2),
  is_balanced BOOLEAN,
  tolerance_exceeded BOOLEAN,

  -- Account-level analysis
  imbalanced_accounts JSONB, -- Array of {account, debits, credits, diff}

  -- Reconciliation details
  record_count BIGINT,
  last_entry_date DATE,
  first_entry_date DATE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_review','approved','failed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  comments TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_gl_balance_societe ON public.audit_gl_balance_verification(societe_id);
CREATE INDEX idx_audit_gl_balance_date ON public.audit_gl_balance_verification(audit_date DESC);
CREATE INDEX idx_audit_gl_balance_status ON public.audit_gl_balance_verification(status);

ALTER TABLE public.audit_gl_balance_verification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditors and admins can view GL balance" ON public.audit_gl_balance_verification;
CREATE POLICY "Auditors and admins can view GL balance" ON public.audit_gl_balance_verification
  FOR SELECT USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie', 'auditeur'));

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 2: DATA COMPLETENESS TABLE
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.audit_data_completeness CASCADE;
CREATE TABLE public.audit_data_completeness (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  audit_date TIMESTAMPTZ DEFAULT NOW(),

  -- Table-level completeness
  table_name TEXT NOT NULL,
  total_records BIGINT,
  complete_records BIGINT,
  incomplete_records BIGINT,
  completeness_percentage NUMERIC(5,2),

  -- Field-level analysis
  missing_by_field JSONB, -- {field_name: count_missing}
  required_fields TEXT[], -- List of required fields that were checked

  -- Details
  incomplete_record_ids UUID[] DEFAULT '{}',
  sample_incomplete_records JSONB, -- First 5 incomplete records

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','failed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  remediation_plan TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_completeness_table ON public.audit_data_completeness(table_name);
CREATE INDEX idx_audit_completeness_societe ON public.audit_data_completeness(societe_id);
CREATE INDEX idx_audit_completeness_status ON public.audit_data_completeness(status);

ALTER TABLE public.audit_data_completeness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditors and admins can view completeness" ON public.audit_data_completeness;
CREATE POLICY "Auditors and admins can view completeness" ON public.audit_data_completeness
  FOR SELECT USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie', 'auditeur'));

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 3: DATA ACCURACY TABLE
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.audit_data_accuracy CASCADE;
CREATE TABLE public.audit_data_accuracy (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  audit_date TIMESTAMPTZ DEFAULT NOW(),

  -- Duplicate detection
  duplicate_gl_entries BIGINT DEFAULT 0,
  duplicate_invoice_numbers BIGINT DEFAULT 0,
  duplicate_payroll_entries BIGINT DEFAULT 0,
  duplicate_bank_transactions BIGINT DEFAULT 0,

  -- Orphaned records
  orphaned_gl_entries BIGINT DEFAULT 0,
  orphaned_invoice_lines BIGINT DEFAULT 0,
  orphaned_payment_records BIGINT DEFAULT 0,
  orphaned_documents BIGINT DEFAULT 0,

  -- Foreign key violations
  fk_violations JSONB, -- {table: {column: count}}

  -- Account balance reconciliation
  account_balance_discrepancies JSONB, -- {account: {gl_balance, expected, diff}}
  accounts_with_issues INTEGER,

  -- Invoice to GL matching
  invoices_unmatched_to_gl BIGINT DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','failed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  corrections_applied JSONB, -- Log of corrections made

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_accuracy_societe ON public.audit_data_accuracy(societe_id);
CREATE INDEX idx_audit_accuracy_date ON public.audit_data_accuracy(audit_date DESC);
CREATE INDEX idx_audit_accuracy_status ON public.audit_data_accuracy(status);

ALTER TABLE public.audit_data_accuracy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditors and admins can view accuracy" ON public.audit_data_accuracy;
CREATE POLICY "Auditors and admins can view accuracy" ON public.audit_data_accuracy
  FOR SELECT USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie', 'auditeur'));

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 4: ANOMALY DETECTION TABLE
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.audit_anomalies CASCADE;
CREATE TABLE public.audit_anomalies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  audit_date TIMESTAMPTZ DEFAULT NOW(),

  -- Anomaly classification
  table_name TEXT NOT NULL,
  record_id UUID,
  anomaly_type TEXT NOT NULL, -- 'high_value', 'missing_description', 'unusual_user', 'unusual_time', 'manual_correction'
  severity TEXT CHECK (severity IN ('critical','high','medium','low')),

  -- Amount/value details
  amount_mur NUMERIC(15,2),
  threshold_mur NUMERIC(15,2), -- For context

  -- Details
  transaction_date DATE,
  created_by UUID REFERENCES public.profiles(id),
  description TEXT,

  -- Justification
  requires_justification BOOLEAN DEFAULT TRUE,
  justification TEXT,
  justification_required_by DATE,
  justification_provided_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','justified','approved','pending_review')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_anomalies_societe ON public.audit_anomalies(societe_id);
CREATE INDEX idx_audit_anomalies_type ON public.audit_anomalies(anomaly_type);
CREATE INDEX idx_audit_anomalies_severity ON public.audit_anomalies(severity);
CREATE INDEX idx_audit_anomalies_status ON public.audit_anomalies(status);
CREATE INDEX idx_audit_anomalies_record ON public.audit_anomalies(table_name, record_id);

ALTER TABLE public.audit_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditors and admins can view anomalies" ON public.audit_anomalies;
CREATE POLICY "Auditors and admins can view anomalies" ON public.audit_anomalies
  FOR SELECT USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie', 'auditeur'));

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 5: DATA RETENTION COMPLIANCE TABLE
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.audit_data_retention CASCADE;
CREATE TABLE public.audit_data_retention (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id),
  audit_date TIMESTAMPTZ DEFAULT NOW(),

  -- GL Data (12 months required)
  gl_first_entry_date DATE,
  gl_last_entry_date DATE,
  gl_months_complete INTEGER,
  gl_compliant BOOLEAN, -- TRUE if 12+ months present
  gl_gaps JSONB, -- Array of missing date ranges

  -- Payroll Data (24 months required)
  payroll_first_entry_date DATE,
  payroll_last_entry_date DATE,
  payroll_months_complete INTEGER,
  payroll_compliant BOOLEAN, -- TRUE if 24+ months present
  payroll_gaps JSONB,

  -- Invoice Data (12 months required)
  invoice_first_date DATE,
  invoice_last_date DATE,
  invoice_months_complete INTEGER,
  invoice_compliant BOOLEAN,
  invoice_gaps JSONB,

  -- Bank Statement Data (12 months required)
  bank_first_statement_date DATE,
  bank_last_statement_date DATE,
  bank_months_complete INTEGER,
  bank_compliant BOOLEAN,
  bank_gaps JSONB,

  -- Overall compliance
  all_data_compliant BOOLEAN, -- TRUE only if all retention requirements met

  -- Issues
  missing_periods JSONB, -- {data_type: [date_ranges]}
  remediation_required BOOLEAN,
  remediation_plan TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','non_compliant')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_retention_societe ON public.audit_data_retention(societe_id);
CREATE INDEX idx_audit_retention_compliant ON public.audit_data_retention(all_data_compliant);

ALTER TABLE public.audit_data_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auditors and admins can view retention" ON public.audit_data_retention;
CREATE POLICY "Auditors and admins can view retention" ON public.audit_data_retention
  FOR SELECT USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie', 'auditeur'));

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 6: HELPER FUNCTIONS FOR AUDIT VERIFICATION
-- ───────────────────────────────────────────────────────────────────────────

-- Function to run GL balance verification
CREATE OR REPLACE FUNCTION public.audit_verify_gl_balance(p_societe_id UUID)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
  v_total_debits NUMERIC(15,2);
  v_total_credits NUMERIC(15,2);
  v_difference NUMERIC(15,2);
  v_is_balanced BOOLEAN;
  v_imbalanced_accounts JSONB;
BEGIN
  -- Insert audit record
  INSERT INTO public.audit_gl_balance_verification (
    societe_id, total_debits_mur, total_credits_mur,
    difference_mur, is_balanced, tolerance_exceeded,
    imbalanced_accounts, record_count, first_entry_date, last_entry_date
  )
  SELECT
    p_societe_id,
    SUM(COALESCE(debit_mur, 0)),
    SUM(COALESCE(credit_mur, 0)),
    ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))),
    ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) <= 0.01,
    ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01,
    (
      SELECT json_agg(row_to_json(imbalance_details))
      FROM (
        SELECT
          numero_compte AS account,
          SUM(COALESCE(debit_mur, 0)) AS debits,
          SUM(COALESCE(credit_mur, 0)) AS credits,
          ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) AS diff
        FROM public.ecritures_comptables_v2
        WHERE societe_id = p_societe_id
        GROUP BY numero_compte
        HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
      ) imbalance_details
    ),
    COUNT(*),
    MIN(date_ecriture),
    MAX(date_ecriture)
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check data completeness
CREATE OR REPLACE FUNCTION public.audit_check_completeness(p_societe_id UUID)
RETURNS TABLE (
  table_name TEXT,
  completeness_percentage NUMERIC,
  total_records BIGINT,
  incomplete_records BIGINT
) AS $$
BEGIN
  -- ecritures_comptables_v2 completeness
  RETURN QUERY
  SELECT
    'ecritures_comptables_v2'::TEXT,
    ROUND(100.0 * COUNT(CASE WHEN date_ecriture IS NOT NULL AND numero_compte IS NOT NULL AND
                              journal IS NOT NULL AND (debit_mur > 0 OR credit_mur > 0) THEN 1 END) /
                  NULLIF(COUNT(*), 0), 2),
    COUNT(*)::BIGINT,
    COUNT(CASE WHEN date_ecriture IS NULL OR numero_compte IS NULL OR
                    journal IS NULL OR (debit_mur = 0 AND credit_mur = 0) THEN 1 END)::BIGINT
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id;

  -- factures completeness
  RETURN QUERY
  SELECT
    'factures'::TEXT,
    ROUND(100.0 * COUNT(CASE WHEN numero IS NOT NULL AND date IS NOT NULL AND
                              tiers_id IS NOT NULL AND montant_ht > 0 AND
                              statut IS NOT NULL THEN 1 END) /
                  NULLIF(COUNT(*), 0), 2),
    COUNT(*)::BIGINT,
    COUNT(CASE WHEN numero IS NULL OR date IS NULL OR
                    tiers_id IS NULL OR montant_ht <= 0 OR
                    statut IS NULL THEN 1 END)::BIGINT
  FROM public.factures
  WHERE societe_id = p_societe_id;

  -- bulletins_paie completeness
  RETURN QUERY
  SELECT
    'bulletins_paie'::TEXT,
    ROUND(100.0 * COUNT(CASE WHEN employe_id IS NOT NULL AND mois IS NOT NULL AND
                              salaire_brut > 0 AND salaire_net > 0 THEN 1 END) /
                  NULLIF(COUNT(*), 0), 2),
    COUNT(*)::BIGINT,
    COUNT(CASE WHEN employe_id IS NULL OR mois IS NULL OR
                    salaire_brut <= 0 OR salaire_net <= 0 THEN 1 END)::BIGINT
  FROM public.bulletins_paie
  WHERE societe_id = p_societe_id;

  -- comptes_bancaires completeness
  RETURN QUERY
  SELECT
    'comptes_bancaires'::TEXT,
    ROUND(100.0 * COUNT(CASE WHEN numero_compte IS NOT NULL AND compte_comptable IS NOT NULL AND
                              banque IS NOT NULL THEN 1 END) /
                  NULLIF(COUNT(*), 0), 2),
    COUNT(*)::BIGINT,
    COUNT(CASE WHEN numero_compte IS NULL OR compte_comptable IS NULL OR
                    banque IS NULL THEN 1 END)::BIGINT
  FROM public.comptes_bancaires
  WHERE societe_id = p_societe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect GL entry duplicates
CREATE OR REPLACE FUNCTION public.audit_detect_gl_duplicates(p_societe_id UUID)
RETURNS TABLE (
  date_ecriture DATE,
  numero_compte TEXT,
  debit_mur NUMERIC,
  credit_mur NUMERIC,
  duplicate_count BIGINT,
  record_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e1.date_ecriture,
    e1.numero_compte,
    e1.debit_mur,
    e1.credit_mur,
    COUNT(*)::BIGINT,
    array_agg(e1.id)
  FROM public.ecritures_comptables_v2 e1
  WHERE e1.societe_id = p_societe_id
  GROUP BY e1.date_ecriture, e1.numero_compte, e1.debit_mur, e1.credit_mur
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect orphaned records
CREATE OR REPLACE FUNCTION public.audit_detect_orphans(p_societe_id UUID)
RETURNS TABLE (
  orphan_type TEXT,
  record_id UUID,
  details JSONB
) AS $$
BEGIN
  -- GL entries with missing document references (that should have them)
  RETURN QUERY
  SELECT
    'gl_missing_document'::TEXT,
    id,
    to_jsonb(row(date_ecriture, numero_compte, journal, debit_mur, credit_mur))
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND document_id IS NULL
    AND journal NOT IN ('OD', 'SAL')  -- These journals may not always have documents
  LIMIT 100;

  -- Invoice lines without matching GL entries
  RETURN QUERY
  SELECT
    'facture_unmatched'::TEXT,
    fl.id,
    to_jsonb(row(f.numero, fl.montant_ht, f.date))
  FROM public.factures f
  JOIN public.factures_lignes fl ON f.id = fl.facture_id
  WHERE f.societe_id = p_societe_id
    AND NOT EXISTS (
      SELECT 1 FROM public.ecritures_comptables_v2 e
      WHERE e.document_id = f.id
        AND ABS(e.debit_mur + e.credit_mur - fl.montant_ht) < 0.01
    )
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect high-value transactions
CREATE OR REPLACE FUNCTION public.audit_detect_anomalies(
  p_societe_id UUID,
  p_amount_threshold NUMERIC DEFAULT 1000000
)
RETURNS TABLE (
  record_id UUID,
  anomaly_type TEXT,
  amount_mur NUMERIC,
  transaction_date DATE,
  created_by UUID,
  severity TEXT
) AS $$
BEGIN
  -- High-value GL entries
  RETURN QUERY
  SELECT
    id,
    'high_value_gl_entry'::TEXT,
    (debit_mur + credit_mur),
    date_ecriture,
    (SELECT created_by FROM public.audit_trail WHERE resource_id = id LIMIT 1),
    'high'::TEXT
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND (debit_mur > p_amount_threshold OR credit_mur > p_amount_threshold);

  -- GL entries with missing descriptions
  RETURN QUERY
  SELECT
    id,
    'missing_description'::TEXT,
    (debit_mur + credit_mur),
    date_ecriture,
    (SELECT created_by FROM public.audit_trail WHERE resource_id = id LIMIT 1),
    'medium'::TEXT
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND (description IS NULL OR description = '');

  -- Invoices with missing descriptions
  RETURN QUERY
  SELECT
    id,
    'invoice_missing_description'::TEXT,
    (montant_ht + montant_tva),
    date,
    (SELECT created_by FROM public.audit_trail WHERE resource_id = id LIMIT 1),
    'medium'::TEXT
  FROM public.factures
  WHERE societe_id = p_societe_id
    AND (description IS NULL OR description = '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
