-- ============================================================================
-- Migration 146 — Système d'agents IA de rapprochement bancaire
-- ============================================================================
-- Crée le socle de données pour les agents : enums, extension de
-- transactions_bancaires, tables d'allocations, logs, apprentissage, taux.
--
-- Principe : la table transactions_bancaires (migration 010) existe mais
-- est vide — l'app stockait les tx dans releves_bancaires.transactions_json.
-- Cette migration étend la table existante avec les champs classification +
-- ajoute un trigger d'extraction JSONB → table pour le peuplement initial.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE transaction_class AS ENUM (
    'customer_payment',
    'supplier_payment',
    'payroll',
    'tax_payment',
    'shareholder_loan',
    'internal_transfer',
    'expense_reimbursement',
    'bank_fee',
    'rent',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE allocation_type AS ENUM (
    'customer_invoice',
    'supplier_invoice',
    'payroll',
    'tax',
    'shareholder_loan',
    'internal_transfer',
    'expense_reimbursement',
    'generic_account'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE allocation_status AS ENUM (
    'auto_validated',
    'proposed',
    'user_validated',
    'user_rejected',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Étendre transactions_bancaires avec les champs classification
-- ────────────────────────────────────────────────────────────────────────────

-- Colonnes agent IA
ALTER TABLE public.transactions_bancaires
  ADD COLUMN IF NOT EXISTS classified_type transaction_class,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS classification_rationale TEXT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_run_id UUID,
  ADD COLUMN IF NOT EXISTS counterparty_iban TEXT,
  ADD COLUMN IF NOT EXISTS counterparty_name TEXT,
  ADD COLUMN IF NOT EXISTS amount_mur NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'MUR',
  ADD COLUMN IF NOT EXISTS transaction_idx INTEGER,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Index pour les agents
CREATE INDEX IF NOT EXISTS idx_tx_bancaires_societe_status
  ON public.transactions_bancaires(societe_id, statut_lettrage);
CREATE INDEX IF NOT EXISTS idx_tx_bancaires_classified
  ON public.transactions_bancaires(societe_id, classified_type);
CREATE INDEX IF NOT EXISTS idx_tx_bancaires_fingerprint
  ON public.transactions_bancaires(fingerprint);
CREATE INDEX IF NOT EXISTS idx_tx_bancaires_date
  ON public.transactions_bancaires(societe_id, date_transaction DESC);
CREATE INDEX IF NOT EXISTS idx_tx_bancaires_counterparty
  ON public.transactions_bancaires(counterparty_iban);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Table transaction_allocations — résultat du rapprochement
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transaction_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions_bancaires(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Type d'allocation
  allocation_type allocation_type NOT NULL,
  status allocation_status NOT NULL DEFAULT 'proposed',

  -- Références (un seul rempli selon allocation_type)
  facture_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  employee_id UUID,
  payroll_period TEXT,
  tax_type TEXT,
  destination_account_id UUID REFERENCES public.comptes_bancaires(id),
  mirror_transaction_id UUID REFERENCES public.transactions_bancaires(id),

  -- Imputation comptable
  account_code TEXT,
  third_party_id UUID,
  third_party_type TEXT,
  third_party_name TEXT,

  -- Montants
  allocated_amount NUMERIC(15,2) NOT NULL,
  allocated_amount_mur NUMERIC(15,2),
  exchange_rate NUMERIC(10,6),
  exchange_rate_date DATE,
  is_partial BOOLEAN DEFAULT FALSE,

  -- Agent
  agent_name TEXT NOT NULL,
  agent_confidence NUMERIC(5,2),
  agent_rationale TEXT,
  typology TEXT CHECK (typology IN ('A', 'B', 'C', 'P1', 'P2', 'P3')),

  -- Validation
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID,
  reversal_reason TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contraintes
  CONSTRAINT chk_allocated_positive CHECK (allocated_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_allocations_transaction
  ON public.transaction_allocations(transaction_id);
CREATE INDEX IF NOT EXISTS idx_allocations_societe
  ON public.transaction_allocations(societe_id, status);
CREATE INDEX IF NOT EXISTS idx_allocations_facture
  ON public.transaction_allocations(facture_id) WHERE facture_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Table agent_execution_logs — traçabilité complète
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_execution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions_bancaires(id) ON DELETE SET NULL,

  -- Agent
  agent_name TEXT NOT NULL,
  iteration SMALLINT NOT NULL DEFAULT 0,

  -- Tool call
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,

  -- Performance
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(8,6),

  -- Résultat
  classification_result JSONB,
  allocation_result JSONB,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_societe_date
  ON public.agent_execution_logs(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_transaction
  ON public.agent_execution_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent
  ON public.agent_execution_logs(agent_name, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Table tenant_learning_patterns — patterns niveau cabinet
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_learning_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,

  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'iban_class', 'label_class', 'amount_range_class', 'combined'
  )),

  -- Critères de matching
  label_pattern TEXT,
  counterparty_iban TEXT,
  counterparty_name_pattern TEXT,
  amount_range_min NUMERIC(15,2),
  amount_range_max NUMERIC(15,2),

  -- Prédiction
  predicted_class transaction_class NOT NULL,
  predicted_account_code TEXT,
  predicted_third_party_type TEXT,

  -- Stats
  occurrence_count INTEGER DEFAULT 1,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_curated BOOLEAN DEFAULT FALSE,
  created_by UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, pattern_type, counterparty_iban, label_pattern)
);

CREATE INDEX IF NOT EXISTS idx_tenant_patterns_lookup
  ON public.tenant_learning_patterns(tenant_id, pattern_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Table client_learning_patterns — patterns niveau client (PME)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_learning_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'iban_class', 'label_class', 'amount_range_class',
    'iban_third_party', 'label_third_party', 'combined'
  )),

  -- Critères de matching
  label_pattern TEXT,
  counterparty_iban TEXT,
  counterparty_name_normalized TEXT,
  amount_range_min NUMERIC(15,2),
  amount_range_max NUMERIC(15,2),

  -- Prédiction
  predicted_class transaction_class NOT NULL,
  predicted_third_party_id UUID,
  predicted_third_party_name TEXT,
  predicted_account_code TEXT,

  -- Stats
  occurrence_count INTEGER DEFAULT 1,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'auto_learned',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, pattern_type, counterparty_iban, label_pattern)
);

CREATE INDEX IF NOT EXISTS idx_client_patterns_lookup
  ON public.client_learning_patterns(societe_id, pattern_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Table exchange_rates_cache — taux de change BoM
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exchange_rates_cache (
  date DATE NOT NULL,
  currency_from TEXT NOT NULL DEFAULT 'EUR',
  currency_to TEXT NOT NULL DEFAULT 'MUR',
  rate NUMERIC(12,6) NOT NULL,
  source TEXT DEFAULT 'bom',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, currency_from, currency_to)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Fonction d'extraction JSONB → transactions_bancaires
-- ────────────────────────────────────────────────────────────────────────────
-- Extrait les transactions de releves_bancaires.transactions_json vers la
-- table transactions_bancaires. Appelée par l'orchestrateur avant de lancer
-- les agents sur une société.

CREATE OR REPLACE FUNCTION extract_bank_transactions(p_societe_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_releve RECORD;
  v_tx JSONB;
  v_idx INTEGER;
  v_compte RECORD;
BEGIN
  FOR v_releve IN
    SELECT r.id, r.compte_bancaire_id, r.societe_id, r.transactions_json
    FROM releves_bancaires r
    WHERE r.societe_id = p_societe_id
      AND r.transactions_json IS NOT NULL
      AND jsonb_array_length(r.transactions_json) > 0
  LOOP
    -- Récupérer la devise du compte bancaire
    SELECT devise INTO v_compte FROM comptes_bancaires WHERE id = v_releve.compte_bancaire_id;

    v_idx := 0;
    FOR v_tx IN SELECT jsonb_array_elements(v_releve.transactions_json)
    LOOP
      -- Insérer seulement si pas déjà extrait (idempotent via releve_id + transaction_idx)
      INSERT INTO transactions_bancaires (
        releve_id, compte_bancaire_id, societe_id,
        date_transaction, libelle_banque, reference,
        debit, credit, tiers_identifie,
        devise, transaction_idx, statut_lettrage
      ) VALUES (
        v_releve.id, v_releve.compte_bancaire_id, v_releve.societe_id,
        (v_tx->>'date')::DATE,
        COALESCE(v_tx->>'libelle', ''),
        v_tx->>'reference',
        COALESCE((v_tx->>'debit')::NUMERIC, 0),
        COALESCE((v_tx->>'credit')::NUMERIC, 0),
        COALESCE(v_tx->>'tiers_detecte', v_tx->>'tiers'),
        COALESCE(v_compte.devise, 'MUR'),
        v_idx,
        COALESCE(v_tx->>'statut', 'a_lettrer')
      )
      ON CONFLICT DO NOTHING;

      v_idx := v_idx + 1;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION extract_bank_transactions(UUID) IS
  'Extrait les transactions de releves_bancaires.transactions_json vers '
  'la table transactions_bancaires. Idempotent. Appelé avant le lancement '
  'des agents IA sur une société.';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Contrainte d'unicité pour l'idempotence de l'extraction
-- ────────────────────────────────────────────────────────────────────────────

-- Empêcher les doublons lors de l'extraction JSONB → table
CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_bancaires_releve_idx
  ON public.transactions_bancaires(releve_id, transaction_idx)
  WHERE releve_id IS NOT NULL AND transaction_idx IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. RLS — mêmes règles que le reste de Lexora
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transaction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_learning_patterns ENABLE ROW LEVEL SECURITY;

-- Policies : accès authentifié (le filtrage fin se fait côté API via societe_id)
CREATE POLICY "allocations_auth" ON public.transaction_allocations
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "agent_logs_auth" ON public.agent_execution_logs
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "tenant_patterns_auth" ON public.tenant_learning_patterns
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "client_patterns_auth" ON public.client_learning_patterns
  FOR ALL USING (auth.uid() IS NOT NULL);

-- exchange_rates_cache : lecture publique (pas de données sensibles)
-- Pas de RLS nécessaire

-- ────────────────────────────────────────────────────────────────────────────
-- 11. Seed — IBANs gouvernementaux mauriciens (curated patterns)
-- ────────────────────────────────────────────────────────────────────────────
-- Ces patterns sont partagés entre tous les tenants (is_curated = true).
-- Ils permettent au classificateur de reconnaître les paiements fiscaux
-- dès le premier jour, sans apprentissage.

-- Note : les IBANs officiels MRA/CSG/NSF ne sont pas documentés publiquement.
-- On utilise des patterns de libellé à la place (plus fiables car visibles
-- sur tous les relevés MCB/SBM).

INSERT INTO public.tenant_learning_patterns
  (tenant_id, pattern_type, label_pattern, predicted_class, predicted_account_code, is_curated)
VALUES
  -- Tenant ID '00000000-0000-0000-0000-000000000000' = patterns globaux
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'MRA', 'tax_payment', '447', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'MAURITIUS REVENUE', 'tax_payment', '447', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'PAYE', 'tax_payment', '4330', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'VAT', 'tax_payment', '4457', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'TVA', 'tax_payment', '4457', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'CSG', 'tax_payment', '4311', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'NSF', 'tax_payment', '4312', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'CORPORATE TAX', 'tax_payment', '444', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'TRAINING LEVY', 'tax_payment', '4324', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'HRDC', 'tax_payment', '4324', TRUE),
  -- Frais bancaires
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'BANK FEE', 'bank_fee', '627', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'FRAIS DE TENUE', 'bank_fee', '627', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'COMMISSION', 'bank_fee', '627', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'SERVICE CHARGE', 'bank_fee', '627', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'AGIOS', 'bank_fee', '627', TRUE),
  -- Salaires
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'SALARY', 'payroll', '4210', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'SALAIRE', 'payroll', '4210', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'SAL ', 'payroll', '4210', TRUE),
  -- Virements internes
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'OWN ACCOUNT TRANSFER', 'internal_transfer', '580', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'VIREMENT INTERNE', 'internal_transfer', '580', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'TRESORERIE', 'internal_transfer', '580', TRUE),
  -- Loyers
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'LOYER', 'rent', '613', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'RENT', 'rent', '613', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'BAIL', 'rent', '613', TRUE),
  ('00000000-0000-0000-0000-000000000000', 'label_class', 'LEASE', 'rent', '613', TRUE)
ON CONFLICT DO NOTHING;
