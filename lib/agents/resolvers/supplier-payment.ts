import { readFileSync } from 'fs'
import { join } from 'path'
import { runAgent } from '@/lib/agents/core/agent-runner'
import { SUPPLIER_PAYMENT_TOOLS } from '@/lib/agents/tools/schemas'
import { getOpenInvoices } from '@/lib/agents/tools/queries'
import { findInvoiceCombinations } from '@/lib/agents/tools/matching'
import { getExchangeRate } from '@/lib/agents/tools/rates'
import { createAllocations, proposeAllocations, flagForReview } from '@/lib/agents/tools/writes'
import type { AllocationResult, ClassificationResult } from '@/lib/types/reconciliation'

let PROMPT: string | null = null
function getPrompt(): string {
  if (!PROMPT) { try { PROMPT = readFileSync(join(process.cwd(), 'lib/agents/prompts/resolvers/supplier-payment.md'), 'utf-8') } catch { PROMPT = 'Résolveur paiements fournisseurs.' } }
  return PROMPT
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_open_invoices':
      return getOpenInvoices(input.societe_id as string, { type: 'fournisseur', supplierId: input.customer_name as string })
    case 'find_invoice_combinations':
      return findInvoiceCombinations(input.societe_id as string, input.target_amount as number, input.target_devise as string, { type: 'fournisseur', customerName: input.customer_name as string }, input.tolerance as number)
    case 'get_exchange_rate':
      return getExchangeRate(input.date as string, input.currency_from as string, input.currency_to as string)
    case 'create_allocations':
      return createAllocations({ transactionId: input.transaction_id as string, societeId: input.societe_id as string, agentName: 'supplier_payment', confidence: input.confidence as number, rationale: input.rationale as string, typology: input.typology as string, allocations: input.allocations as any[] })
    case 'propose_allocations':
      return proposeAllocations({ transactionId: input.transaction_id as string, societeId: input.societe_id as string, agentName: 'supplier_payment', confidence: input.confidence as number, rationale: input.rationale as string, typology: input.typology as string, allocations: input.allocations as any[] })
    case 'flag_for_review':
      return flagForReview(input.transaction_id as string, input.societe_id as string || '', 'supplier_payment', input.reason as string, input.candidates as any[] || [])
    default:
      return { error: `Outil inconnu: ${toolName}` }
  }
}

export async function resolveSupplierPayment(transactionId: string, societeId: string, classification: ClassificationResult, options?: { mode?: 'auto' | 'propose_only' }): Promise<AllocationResult> {
  const mode = options?.mode || (classification.confidence >= 85 ? 'auto' : 'propose_only')
  const result = await runAgent({
    agent_name: 'supplier_payment', system_prompt: getPrompt() + (mode === 'propose_only' ? '\n\n# MODE PROPOSE ONLY\nJAMAIS create_allocations.' : ''),
    tools: mode === 'propose_only' ? SUPPLIER_PAYMENT_TOOLS.filter(t => t.name !== 'create_allocations') : SUPPLIER_PAYMENT_TOOLS,
    user_message: `Résous le paiement fournisseur pour la transaction ${transactionId} (société ${societeId}). ${classification.rationale}`,
    max_iterations: 10, timeout_ms: 30_000, terminal_tool_names: ['create_allocations', 'propose_allocations', 'flag_for_review'],
  }, executeTool, { societeId, transactionId })
  const r = result.final_result || {}
  return { transaction_id: transactionId, status: r.allocation_ids ? 'allocated' : r.flagged ? 'flagged' : 'proposed', allocations: (r as any).allocations || [], typology: (r as any).typology || null, confidence: (r as any).confidence || classification.confidence, rationale: (r as any).rationale || classification.rationale, agent_name: 'supplier_payment' }
}
