import Anthropic from '@anthropic-ai/sdk'

// Instance paresseuse — ne JAMAIS instancier au niveau module, sinon tout
// import (même un simple `CLAUDE_MODEL` ou `verifyCronSecret`) depuis un
// composant client tire le SDK Anthropic dans le bundle browser et crashe
// avec « dangerouslyAllowBrowser ».
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return _anthropic
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

/**
 * Appel Claude API — retourne le texte brut
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const message = await getAnthropic().messages.create({
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
