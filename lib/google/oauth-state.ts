/**
 * État OAuth signé HMAC-SHA256 pour CSRF protection.
 *
 * Format : `${payloadB64Url}.${sigB64Url}`
 * Payload : JSON { user_id, return_to, iat, exp }
 *
 * Clé HMAC : env TELEGRAM_WEBHOOK_SECRET (fallback : CRYPT_KEY).
 */
import { createHmac } from 'crypto'

const STATE_TTL_SECONDS = 600 // 10 minutes

function getHmacKey(): Buffer {
  const key = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRYPT_KEY
  if (!key) throw new Error('TELEGRAM_WEBHOOK_SECRET ou CRYPT_KEY requis pour signer le state OAuth')
  return Buffer.from(key, 'utf8')
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64urlDecode(s: string): Buffer {
  let str = s.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}

export type OAuthStatePayload = {
  user_id: string
  return_to?: string
  iat: number
  exp: number
}

export function signOAuthState(user_id: string, return_to?: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: OAuthStatePayload = {
    user_id,
    return_to: return_to || undefined,
    iat: now,
    exp: now + STATE_TTL_SECONDS,
  }
  const payloadStr = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', getHmacKey()).update(payloadStr).digest()
  return `${payloadStr}.${b64url(sig)}`
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const parts = state.split('.')
  if (parts.length !== 2) throw new Error('State invalide (format)')
  const [payloadStr, sigStr] = parts
  const expected = createHmac('sha256', getHmacKey()).update(payloadStr).digest()
  const actual = b64urlDecode(sigStr)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('State invalide (signature)')
  }
  const payload = JSON.parse(b64urlDecode(payloadStr).toString('utf8')) as OAuthStatePayload
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw new Error('State expiré')
  return payload
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]
  return r === 0
}
