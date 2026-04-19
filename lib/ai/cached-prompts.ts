import Anthropic from '@anthropic-ai/sdk'

export type CachedBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface CachedMessageParams {
  model?: string
  max_tokens: number
  system: CachedBlock[]
  messages: Anthropic.Messages.MessageParam[]
  temperature?: number
}

export interface CachedCallResult {
  content: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_tokens: number
    cache_read_tokens: number
  }
  model: string
  cached: boolean
}

interface ExtendedUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function assertAnthropicKey(): string {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new Error('[cached-prompts] ANTHROPIC_API_KEY missing')
  return k
}

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: assertAnthropicKey() })
  }
  return _anthropic
}

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'

export async function callClaudeCached(params: CachedMessageParams): Promise<CachedCallResult> {
  const model = params.model || DEFAULT_MODEL
  const temperature = params.temperature ?? 0

  try {
    const response = await getAnthropic().messages.create({
      model,
      max_tokens: params.max_tokens,
      temperature,
      system: params.system as unknown as Anthropic.Messages.TextBlockParam[],
      messages: params.messages,
    })

    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    )
    const content = textBlocks.map((b) => b.text).join('')

    const usage = response.usage as ExtendedUsage
    const cacheCreation = usage.cache_creation_input_tokens ?? 0
    const cacheRead = usage.cache_read_input_tokens ?? 0
    const totalInput = usage.input_tokens + cacheCreation + cacheRead
    const hitRate = totalInput > 0 ? (cacheRead / totalInput) * 100 : 0

    console.debug(
      `[cached-prompts] model=${model} input=${usage.input_tokens} cache_create=${cacheCreation} cache_read=${cacheRead} hit_rate=${hitRate.toFixed(1)}%`
    )

    return {
      content,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_tokens: cacheCreation,
        cache_read_tokens: cacheRead,
      },
      model: response.model,
      cached: cacheRead > 0,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cached-prompts] Claude API error: ${message}`)
    throw err
  }
}

export function buildOcrSystemBlocks(opts: {
  staticRules: string
  businessRules: string
  dynamicContext: string
  documentType?: 'facture_fournisseur' | 'facture_client' | 'releve_bancaire' | 'autre'
}): CachedBlock[] {
  const blocks: CachedBlock[] = []

  const staticText = opts.documentType
    ? `[DOC_TYPE=${opts.documentType}]\n${opts.staticRules}`
    : opts.staticRules

  blocks.push({
    type: 'text',
    text: staticText,
    cache_control: { type: 'ephemeral' },
  })

  blocks.push({
    type: 'text',
    text: opts.businessRules,
    cache_control: { type: 'ephemeral' },
  })

  if (opts.dynamicContext && opts.dynamicContext.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: opts.dynamicContext,
    })
  }

  return blocks
}
