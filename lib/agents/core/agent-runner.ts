import Anthropic from '@anthropic-ai/sdk'
import type { AgentRunConfig, AgentRunResult, AgentToolDefinition } from '@/lib/types/reconciliation'
import { logAgentExecution } from '@/lib/agents/tools/writes'

const client = new Anthropic()

const SONNET_INPUT_COST = 3.0 / 1_000_000
const SONNET_OUTPUT_COST = 15.0 / 1_000_000

export class AgentError extends Error {
  code: string
  context?: Record<string, unknown>
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'AgentError'
    this.code = code
    this.context = context
  }
}

export async function runAgent(
  config: AgentRunConfig,
  executeToolFn: (toolName: string, input: Record<string, unknown>) => Promise<unknown>,
  meta?: { societeId?: string; transactionId?: string }
): Promise<AgentRunResult> {
  const startTime = Date.now()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: config.user_message }
  ]

  let finalResult: Record<string, unknown> | null = null
  let iterations = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolCalls: Array<{ tool_name: string; latency_ms: number }> = []
  const maxIterations = config.max_iterations || 10
  const timeoutMs = config.timeout_ms || 30_000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    while (iterations < maxIterations) {
      const iterStart = Date.now()

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 2000,
        system: [{
          type: 'text',
          text: config.system_prompt,
          cache_control: { type: 'ephemeral' },
        }],
        tools: config.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        })),
        messages,
      })

      totalInputTokens += response.usage?.input_tokens || 0
      totalOutputTokens += response.usage?.output_tokens || 0

      if (response.stop_reason === 'end_turn') {
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b: any) => b.type === 'tool_use'
        ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const call of toolUseBlocks) {
          const toolStart = Date.now()
          let result: unknown
          let error: string | undefined

          try {
            result = await executeToolFn(call.name, call.input as Record<string, unknown>)
          } catch (e: any) {
            error = e.message || String(e)
            result = { error }
          }

          const toolLatency = Date.now() - toolStart
          toolCalls.push({ tool_name: call.name, latency_ms: toolLatency })

          // Log
          await logAgentExecution({
            societeId: meta?.societeId,
            transactionId: meta?.transactionId,
            agentName: config.agent_name,
            iteration: iterations,
            toolName: call.name,
            toolInput: call.input as Record<string, unknown>,
            toolOutput: typeof result === 'object' ? result as Record<string, unknown> : { value: result },
            latencyMs: toolLatency,
            error,
          }).catch(() => {})

          // Terminal tool
          if (config.terminal_tool_names.includes(call.name)) {
            finalResult = typeof result === 'object' ? result as Record<string, unknown> : { value: result }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(result),
          })
        }

        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })

        if (finalResult) break
      }

      iterations++
    }
  } finally {
    clearTimeout(timer)
  }

  const totalCost = totalInputTokens * SONNET_INPUT_COST + totalOutputTokens * SONNET_OUTPUT_COST

  // Log final
  await logAgentExecution({
    societeId: meta?.societeId,
    transactionId: meta?.transactionId,
    agentName: config.agent_name,
    iteration: iterations,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd: totalCost,
    latencyMs: Date.now() - startTime,
  }).catch(() => {})

  if (!finalResult && iterations >= maxIterations) {
    throw new AgentError(
      `Agent ${config.agent_name} n'a pas atteint de tool terminal en ${maxIterations} itérations`,
      'max_iterations_exceeded'
    )
  }

  return {
    final_result: finalResult,
    iterations,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cost_usd: totalCost,
    duration_ms: Date.now() - startTime,
    tool_calls: toolCalls,
  }
}
