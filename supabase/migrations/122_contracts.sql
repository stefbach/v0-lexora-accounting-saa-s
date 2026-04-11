-- ═══════════════════════════════════════════════════════════════════
-- Migration 122: Contract Generator module
-- Stores AI-generated contracts (employment, prestataire, NDA, SaaS...)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  -- Contract metadata
  contract_type TEXT NOT NULL,  -- 'CDI' | 'CDD' | 'CDD_partiel' | 'prestataire' | 'client_saas' | 'client_service' | 'nda'
  language TEXT NOT NULL DEFAULT 'fr',   -- 'fr' | 'en' | 'fr_en'
  jurisdiction TEXT NOT NULL DEFAULT 'mu', -- 'mu' | 'mu_fr' | 'cv'
  status TEXT DEFAULT 'draft',            -- 'draft' | 'sent' | 'signed' | 'archived'

  -- Parties (flexible JSONB)
  party_employer JSONB,   -- { name, brn, addr, rep, rep_title }
  party_employee JSONB,   -- { name, nic, addr, email, phone }

  -- Conditions
  conditions JSONB,       -- { job_title, dept, start_date, end_date, salary, ... }

  -- Clauses
  clauses_active TEXT[],
  custom_clause TEXT,

  -- Generated content
  generated_text TEXT,
  pdf_url TEXT,

  -- Signature
  signed_at TIMESTAMPTZ,
  signed_by TEXT,

  -- Extension
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contracts_societe ON public.contracts(societe_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_type ON public.contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_created ON public.contracts(created_at DESC);

-- RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contracts_auth_all" ON public.contracts
    FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.contracts IS 'AI-generated contracts (employment, freelance, NDA, SaaS) for Mauritius jurisdiction';
