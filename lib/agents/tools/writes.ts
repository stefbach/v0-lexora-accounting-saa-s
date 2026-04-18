import { createClient } from '@supabase/supabase-js'
import type { AllocationProposal, AllocationStatus, AllocationType } from '@/lib/types/reconciliation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface CreateAllocationsInput {
  transactionId: string
  societeId: string
  agentName: string
  confidence: number
  rationale: string
  typology?: string
  allocations: AllocationProposal[]
}

async function writeAllocations(input: CreateAllocationsInput, status: AllocationStatus) {
  const supabase = getSupabase()

  // Anti-double : vérifier qu'il n'y a pas déjà des allocations actives
  const { data: existing } = await supabase
    .from('transaction_allocations')
    .select('id')
    .eq('transaction_id', input.transactionId)
    .not('status', 'in', '("reversed","user_rejected")')
  if (existing && existing.length > 0) {
    throw new Error(`Transaction ${input.transactionId} a déjà ${existing.length} allocation(s) active(s)`)
  }

  // Vérifier que la somme ne dépasse pas le montant de la tx
  const { data: tx } = await supabase
    .from('transactions_bancaires')
    .select('debit, credit')
    .eq('id', input.transactionId)
    .single()
  if (!tx) throw new Error(`Transaction ${input.transactionId} introuvable`)

  const txAmount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
  const allocTotal = input.allocations.reduce((s, a) => s + a.allocated_amount, 0)
  if (allocTotal > txAmount * 1.02) {
    throw new Error(`Somme des allocations (${allocTotal}) > montant tx (${txAmount})`)
  }

  // Insérer les allocations
  const rows = input.allocations.map(a => ({
    transaction_id: input.transactionId,
    societe_id: input.societeId,
    allocation_type: guessAllocationType(a),
    status,
    facture_id: a.facture_id || null,
    employee_id: a.employee_id || null,
    payroll_period: a.payroll_period || null,
    tax_type: a.tax_type || null,
    destination_account_id: a.destination_account_id || null,
    account_code: a.account_code,
    third_party_name: a.third_party_name || null,
    allocated_amount: a.allocated_amount,
    exchange_rate: a.exchange_rate || null,
    is_partial: a.is_partial,
    agent_name: input.agentName,
    agent_confidence: input.confidence,
    agent_rationale: input.rationale,
    typology: input.typology || null,
  }))

  const { data: inserted, error } = await supabase
    .from('transaction_allocations')
    .insert(rows)
    .select('id')

  if (error) throw new Error(`Insertion allocations échouée: ${error.message}`)

  // Mettre à jour le statut de la transaction
  const newStatut = status === 'auto_validated' ? 'lettre' : 'a_verifier'
  await supabase
    .from('transactions_bancaires')
    .update({ statut_lettrage: newStatut })
    .eq('id', input.transactionId)

  return { allocation_ids: (inserted || []).map(r => r.id), count: rows.length }
}

function guessAllocationType(a: AllocationProposal): AllocationType {
  if (a.facture_id) return 'customer_invoice'
  if (a.employee_id || a.payroll_period) return 'payroll'
  if (a.tax_type) return 'tax'
  if (a.destination_account_id) return 'internal_transfer'
  return 'generic_account'
}

export async function createAllocations(input: CreateAllocationsInput) {
  return writeAllocations(input, 'auto_validated')
}

export async function proposeAllocations(input: CreateAllocationsInput) {
  return writeAllocations(input, 'proposed')
}

export async function flagForReview(transactionId: string, societeId: string, agentName: string, reason: string, candidates: Array<{ facture_id?: string; description: string }>) {
  const supabase = getSupabase()
  await supabase
    .from('transactions_bancaires')
    .update({
      statut_lettrage: 'a_verifier',
      classification_rationale: `FLAG: ${reason}. Candidats: ${candidates.map(c => c.description).join(', ')}`,
    })
    .eq('id', transactionId)
  return { flagged: true, reason, candidates_count: candidates.length }
}

export async function updateTransactionClass(transactionId: string, classType: string, confidence: number, rationale: string) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('transactions_bancaires')
    .update({
      classified_type: classType,
      classification_confidence: confidence,
      classification_rationale: rationale,
      classified_at: new Date().toISOString(),
    })
    .eq('id', transactionId)
  if (error) throw new Error(`Mise à jour classification échouée: ${error.message}`)
  return { updated: true }
}

export async function reverseAllocation(allocationId: string, userId: string, reason: string) {
  const supabase = getSupabase()
  const { data: alloc } = await supabase
    .from('transaction_allocations')
    .select('id, transaction_id, status')
    .eq('id', allocationId)
    .single()
  if (!alloc) throw new Error('Allocation introuvable')
  if (alloc.status === 'reversed') throw new Error('Allocation déjà annulée')

  await supabase
    .from('transaction_allocations')
    .update({ status: 'reversed', reversed_at: new Date().toISOString(), reversed_by: userId, reversal_reason: reason })
    .eq('id', allocationId)

  // Remettre la tx en a_lettrer si plus aucune allocation active
  const { data: remaining } = await supabase
    .from('transaction_allocations')
    .select('id')
    .eq('transaction_id', alloc.transaction_id)
    .not('status', 'in', '("reversed","user_rejected")')
  if (!remaining || remaining.length === 0) {
    await supabase
      .from('transactions_bancaires')
      .update({ statut_lettrage: 'a_lettrer' })
      .eq('id', alloc.transaction_id)
  }

  return { reversed: true }
}

export async function acceptAllocation(allocationId: string, userId: string) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('transaction_allocations')
    .update({ status: 'user_validated', validated_by: userId, validated_at: new Date().toISOString() })
    .eq('id', allocationId)
  if (error) throw new Error(`Validation échouée: ${error.message}`)

  // Mettre à jour la tx en lettre
  const { data: alloc } = await supabase
    .from('transaction_allocations')
    .select('transaction_id')
    .eq('id', allocationId)
    .single()
  if (alloc) {
    await supabase
      .from('transactions_bancaires')
      .update({ statut_lettrage: 'lettre' })
      .eq('id', alloc.transaction_id)
  }

  return { accepted: true }
}

export async function logAgentExecution(log: {
  societeId?: string
  transactionId?: string
  agentName: string
  iteration: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: Record<string, unknown>
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}) {
  const supabase = getSupabase()
  await supabase.from('agent_execution_logs').insert({
    societe_id: log.societeId || null,
    transaction_id: log.transactionId || null,
    agent_name: log.agentName,
    iteration: log.iteration,
    tool_name: log.toolName || null,
    tool_input: log.toolInput || null,
    tool_output: log.toolOutput || null,
    latency_ms: log.latencyMs || null,
    input_tokens: log.inputTokens || null,
    output_tokens: log.outputTokens || null,
    cost_usd: log.costUsd || null,
    error: log.error || null,
  })
}
