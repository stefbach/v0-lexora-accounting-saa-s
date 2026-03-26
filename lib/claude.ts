import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20250514',
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${systemPrompt}\n\n${userPrompt}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    return JSON.parse(text)
  } catch {
    return { raw_text: text, parse_error: true }
  }
}

export function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET) return true // Allow if no secret configured
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}
