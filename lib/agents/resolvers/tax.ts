import { readFileSync } from 'fs'
import { join } from 'path'
import { runAgent } from '@/lib/agents/core/agent-runner'
import { TAX_TOOLS } from '@/lib/agents/tools/schemas'
import { getHistoricalPatterns } from '@/lib/agents/tools/patterns'
import { getExchangeRate } from '@/lib/agents/tools/rates'
import { createAllocations, proposeAllocations, flagForReview } from '@/lib/agents/tools/writes'
import type { AllocationResult, ClassificationResult } from '@/lib/types/reconciliation'

let PROMPT: string | null = null
function getPrompt(): string {
  if (!PROMPT) { try { PROMPT = readFileSync(join(process.cwd(), 'lib/agents/prompts/resolvers/tax.md'), 'utf-8') } catch { PROMPT = 'Résolveur paiements fiscaux.' } }
  return PROMPT
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_historical_patterns': return getHistoricalPatterns(input.societe_id as string, input.fingerprint as string)
    case 'get_exchange_rate': return getExchangeRate(input.date as string, input.currency_from as string, input.currency_to as string)
    case 'create_allocations':
      return createAllocations({ transactionId: input.transaction_id as string, societeId: input.societe_id as string, agentName: 'tax', confidence: input.confidence as number, rationale: input.rationale as string, allocations: input.allocations as any[] })
    case 'propose_allocations':
      return proposeAllocations({ transactionId: input.transaction_id as string, societeId: input.societe_id as string, agentName: 'tax', confidence: input.confidence as number, rationale: input.rationale as string, allocations: input.allocations as any[] })
    case 'flag_for_review':
      return flagForReview(input.transaction_id as string, input.societe_id as string || '', 'tax', input.reason as string, input.candidates as any[] || [])
    default: return { error: `Outil inconnu: ${toolName}` }
  }
}

export async function resolveTax(transactionId: string, societeId: string, classification: ClassificationResult, options?: { mode?: 'auto' | 'propose_only' }): Promise<AllocationResult> {
  const mode = options?.mode || (classification.confidence >= 85 ? 'auto' : 'propose_only')
  const result = await runAgent({
    agent_name: 'tax', system_prompt: getPrompt() + (mode === 'propose_only' ? '\n\n# MODE PROPOSE ONLY\nJAMAIS create_allocations.' : ''),
    tools: mode === 'propose_only' ? TAX_TOOLS.filter(t => t.name !== 'create_allocations') : TAX_TOOLS,
    user_message: `Résous le paiement fiscal pour la transaction ${transactionId} (société ${societeId}). ${classification.rationale}`,
    max_iterations: 6, timeout_ms: 20_000, terminal_tool_names: ['create_allocations', 'propose_allocations', 'flag_for_review'],
  }, executeTool, { societeId, transactionId })
  const r = result.final_result || {}
  return { transaction_id: transactionId, status: r.allocation_ids ? 'allocated' : r.flagged ? 'flagged' : 'proposed', allocations: (r as any).allocations || [], typology: null, confidence: (r as any).confidence || classification.confidence, rationale: (r as any).rationale || classification.rationale, agent_name: 'tax' }
}
