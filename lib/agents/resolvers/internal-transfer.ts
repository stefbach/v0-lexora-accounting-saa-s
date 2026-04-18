import { readFileSync } from 'fs'
import { join } from 'path'
import { runAgent } from '@/lib/agents/core/agent-runner'
import { INTERNAL_TRANSFER_TOOLS } from '@/lib/agents/tools/schemas'
import { getCompanyBankAccounts } from '@/lib/agents/tools/queries'
import { findMirrorTransaction } from '@/lib/agents/tools/matching'
import { createAllocations, flagForReview } from '@/lib/agents/tools/writes'
import type { AllocationResult, ClassificationResult } from '@/lib/types/reconciliation'

let PROMPT: string | null = null
function getPrompt(): string {
  if (!PROMPT) { try { PROMPT = readFileSync(join(process.cwd(), 'lib/agents/prompts/resolvers/internal-transfer.md'), 'utf-8') } catch { PROMPT = 'Résolveur virements internes.' } }
  return PROMPT
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_company_bank_accounts': return getCompanyBankAccounts(input.societe_id as string)
    case 'find_mirror_transaction':
      return findMirrorTransaction(input.societe_id as string, input.source_tx_id as string, input.amount as number, input.devise as string, input.date as string, input.is_debit as boolean)
    case 'create_allocations':
      return createAllocations({ transactionId: input.transaction_id as string, societeId: input.societe_id as string, agentName: 'internal_transfer', confidence: input.confidence as number, rationale: input.rationale as string, allocations: input.allocations as any[] })
    case 'flag_for_review':
      return flagForReview(input.transaction_id as string, input.societe_id as string || '', 'internal_transfer', input.reason as string, input.candidates as any[] || [])
    default: return { error: `Outil inconnu: ${toolName}` }
  }
}

export async function resolveInternalTransfer(transactionId: string, societeId: string, classification: ClassificationResult, options?: { mode?: 'auto' | 'propose_only' }): Promise<AllocationResult> {
  const result = await runAgent({
    agent_name: 'internal_transfer', system_prompt: getPrompt(),
    tools: INTERNAL_TRANSFER_TOOLS,
    user_message: `Résous le virement interne pour la transaction ${transactionId} (société ${societeId}). ${classification.rationale}`,
    max_iterations: 5, timeout_ms: 15_000, terminal_tool_names: ['create_allocations', 'flag_for_review'],
  }, executeTool, { societeId, transactionId })
  const r = result.final_result || {}
  return { transaction_id: transactionId, status: r.allocation_ids ? 'allocated' : 'flagged', allocations: (r as any).allocations || [], typology: null, confidence: (r as any).confidence || classification.confidence, rationale: (r as any).rationale || classification.rationale, agent_name: 'internal_transfer' }
}
