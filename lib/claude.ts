import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'

/**
 * Appel Claude API — retourne le texte brut
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `${systemPrompt}\n\n${userPrompt}`,
    }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Réponse Claude inattendue (pas de texte)')
  }
  return content.text
}

/**
 * Appel Claude API — retourne un objet JSON parsé
 */
export async function callClaudeJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<T> {
  const text = await callClaude(systemPrompt, userPrompt, maxTokens)
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean) as T
}

/**
 * Vérifie le secret Vercel Cron dans l'Authorization header
 */
export function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
