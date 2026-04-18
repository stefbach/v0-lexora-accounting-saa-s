// =============================================================================
// Types pour le système d'agents IA de rapprochement bancaire
// Synchronisés avec migration 146_reconciliation_agents.sql
// =============================================================================

// ── Enums ────────────────────────────────────────────────────────────────────

export type TransactionClass =
  | 'customer_payment'
  | 'supplier_payment'
  | 'payroll'
  | 'tax_payment'
  | 'shareholder_loan'
  | 'internal_transfer'
  | 'expense_reimbursement'
  | 'bank_fee'
  | 'rent'
  | 'unknown'

export type AllocationType =
  | 'customer_invoice'
  | 'supplier_invoice'
  | 'payroll'
  | 'tax'
  | 'shareholder_loan'
  | 'internal_transfer'
  | 'expense_reimbursement'
  | 'generic_account'

export type AllocationStatus =
  | 'auto_validated'
  | 'proposed'
  | 'user_validated'
  | 'user_rejected'
  | 'reversed'

export type Typology = 'A' | 'B' | 'C' | 'P1' | 'P2' | 'P3'

// ── Rows (tables SQL) ────────────────────────────────────────────────────────

export interface BankTransactionRow {
  id: string
  releve_id: string | null
  compte_bancaire_id: string
  societe_id: string
  date_transaction: string
  date_valeur: string | null
  libelle_banque: string
  reference: string | null
  debit: number
  credit: number
  solde_apres: number | null
  tiers_identifie: string | null
  compte_comptable: string | null
  devise: string
  transaction_idx: number | null
  counterparty_iban: string | null
  counterparty_name: string | null
  amount_mur: number | null
  exchange_rate: number | null
  fingerprint: string | null
  classified_type: TransactionClass | null
  classification_confidence: number | null
  classification_rationale: string | null
  classified_at: string | null
  statut_lettrage: 'a_lettrer' | 'lettre' | 'justifie' | 'a_verifier'
  created_at: string
}

export interface TransactionAllocationRow {
  id: string
  transaction_id: string
  societe_id: string
  allocation_type: AllocationType
  status: AllocationStatus
  facture_id: string | null
  employee_id: string | null
  payroll_period: string | null
  tax_type: string | null
  destination_account_id: string | null
  mirror_transaction_id: string | null
  account_code: string | null
  third_party_id: string | null
  third_party_type: string | null
  third_party_name: string | null
  allocated_amount: number
  allocated_amount_mur: number | null
  exchange_rate: number | null
  exchange_rate_date: string | null
  is_partial: boolean
  agent_name: string
  agent_confidence: number | null
  agent_rationale: string | null
  typology: Typology | null
  validated_by: string | null
  validated_at: string | null
  reversed_at: string | null
  reversed_by: string | null
  reversal_reason: string | null
  created_at: string
}

export interface AgentExecutionLogRow {
  id: string
  societe_id: string | null
  transaction_id: string | null
  agent_name: string
  iteration: number
  tool_name: string | null
  tool_input: Record<string, unknown> | null
  tool_output: Record<string, unknown> | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  classification_result: Record<string, unknown> | null
  allocation_result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

export interface TenantLearningPatternRow {
  id: string
  tenant_id: string
  pattern_type: 'iban_class' | 'label_class' | 'amount_range_class' | 'combined'
  label_pattern: string | null
  counterparty_iban: string | null
  counterparty_name_pattern: string | null
  amount_range_min: number | null
  amount_range_max: number | null
  predicted_class: TransactionClass
  predicted_account_code: string | null
  predicted_third_party_type: string | null
  occurrence_count: number
  last_seen: string
  is_curated: boolean
  created_at: string
}

export interface ClientLearningPatternRow {
  id: string
  societe_id: string
  pattern_type: 'iban_class' | 'label_class' | 'amount_range_class' | 'iban_third_party' | 'label_third_party' | 'combined'
  label_pattern: string | null
  counterparty_iban: string | null
  counterparty_name_normalized: string | null
  amount_range_min: number | null
  amount_range_max: number | null
  predicted_class: TransactionClass
  predicted_third_party_id: string | null
  predicted_third_party_name: string | null
  predicted_account_code: string | null
  occurrence_count: number
  last_seen: string
  source: string
  created_at: string
}

export interface ExchangeRateCacheRow {
  date: string
  currency_from: string
  currency_to: string
  rate: number
  source: string
  fetched_at: string
}

// ── Payloads agents (input/output) ───────────────────────────────────────────

export interface ClassificationResult {
  transaction_id: string
  class: TransactionClass
  confidence: number
  rationale: string
  needs_review: boolean
}

export interface AllocationProposal {
  facture_id?: string
  employee_id?: string
  payroll_period?: string
  tax_type?: string
  destination_account_id?: string
  account_code: string
  allocated_amount: number
  exchange_rate?: number
  is_partial: boolean
  third_party_name?: string
}

export interface AllocationResult {
  transaction_id: string
  status: 'allocated' | 'proposed' | 'flagged'
  allocations: AllocationProposal[]
  typology: Typology | null
  confidence: number
  rationale: string
  agent_name: string
}

export interface ReconciliationResponse {
  transaction_id: string
  classification: ClassificationResult
  resolution: AllocationResult
  duration_ms: number
  cost_usd: number
}

export interface BatchReconciliationResponse {
  processed: number
  allocated: number
  proposed: number
  flagged: number
  failed: number
  duration_ms: number
  total_cost_usd: number
  details: ReconciliationResponse[]
}

// ── Agent runner types ──────────────────────────────────────────────────────

export interface AgentToolCall {
  name: string
  input: Record<string, unknown>
}

export interface AgentToolResult {
  tool_use_id: string
  content: string
}

export interface AgentRunConfig {
  agent_name: string
  system_prompt: string
  tools: AgentToolDefinition[]
  user_message: string
  model?: string
  max_iterations?: number
  timeout_ms?: number
  terminal_tool_names: string[]
}

export interface AgentToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AgentRunResult {
  final_result: Record<string, unknown> | null
  iterations: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  duration_ms: number
  tool_calls: Array<{
    tool_name: string
    latency_ms: number
  }>
}
