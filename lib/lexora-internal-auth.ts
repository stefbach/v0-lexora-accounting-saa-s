/**
 * Auth interne entre routes API Lexora.
 *
 * Quand le bot Telegram (ou un cron, ou un worker) doit appeler un endpoint
 * Lexora qui était initialement session-based (createServerClient), on passe
 * un header `X-Internal-Token` + un `X-Internal-User-Id` pour usurper l'auth
 * d'un user spécifique (résolu côté caller via withTelegramAuth).
 *
 * USAGE côté route appelée :
 *   const internal = resolveInternalAuth(request)
 *   if (internal) {
 *     // skip getUser, utilise internal.user_id directement
 *     user = { id: internal.user_id, email: internal.user_email || 'system' }
 *   } else {
 *     // path normal session-based
 *   }
 *
 * USAGE côté caller (depuis /api/telegram/internal/*) :
 *   await fetch(`${BASE_URL}/api/rh/paie`, {
 *     method: 'POST',
 *     headers: callLexoraHeaders(ctx.user_id),
 *     body: JSON.stringify({ action: 'verrouiller', ... }),
 *   })
 */

const INTERNAL_HEADER = 'x-internal-token'
const INTERNAL_USER_HEADER = 'x-internal-user-id'
const INTERNAL_EMAIL_HEADER = 'x-internal-user-email'

export type InternalAuthResult = {
  user_id: string
  user_email?: string
}

export function resolveInternalAuth(request: Request): InternalAuthResult | null {
  const token = request.headers.get(INTERNAL_HEADER)
  const expected = process.env.INTERNAL_API_TOKEN
  if (!token || !expected || token !== expected) return null
  const user_id = request.headers.get(INTERNAL_USER_HEADER)
  if (!user_id) return null
  const user_email = request.headers.get(INTERNAL_EMAIL_HEADER) || undefined
  return { user_id, user_email }
}

export function callLexoraHeaders(user_id: string, user_email: string = 'telegram-bot@lexora.io'): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN || ''
  return {
    'Content-Type': 'application/json',
    [INTERNAL_HEADER]: token,
    [INTERNAL_USER_HEADER]: user_id,
    [INTERNAL_EMAIL_HEADER]: user_email,
  }
}

export function getLexoraBaseUrl(): string {
  return (
    process.env.LEXORA_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || `https://${process.env.VERCEL_URL || 'localhost:3000'}`
  )
}
