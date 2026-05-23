/**
 * Helpers pour les clés API personnelles (mig 308 — user_api_keys).
 *
 * Format token côté client : `lex_<32 caractères base62>`
 *   - Préfixe stable `lex_` pour identification visuelle
 *   - 32 chars base62 = ~190 bits d'entropie (plus que suffisant)
 *
 * Stockage en DB : SHA-256 hex du token complet (`lex_...`). Le token
 * en clair n'est JAMAIS persisté — il est uniquement renvoyé une fois
 * lors de la création, l'utilisateur doit le copier immédiatement.
 *
 * Préfixe visible : 12 premiers caractères du token (`lex_abcd1234`).
 * Affichable dans l'UI pour identifier une clé sans la révéler.
 */
import { createHash, randomBytes } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'

const TOKEN_PREFIX = 'lex_'
const TOKEN_LENGTH = 32
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Génère un nouveau token API + son hash + son préfixe visible.
 * À appeler côté serveur uniquement (utilise crypto.randomBytes).
 */
export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const bytes = randomBytes(TOKEN_LENGTH)
  let body = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    body += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]
  }
  const token = `${TOKEN_PREFIX}${body}`
  const hash = hashToken(token)
  const prefix = token.slice(0, 12)  // "lex_" + 8 chars
  return { token, hash, prefix }
}

/** SHA-256 hex du token complet. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Résout un token en utilisateur. Renvoie null si :
 *   - Token mal formé (n'a pas le préfixe `lex_`)
 *   - Aucune ligne user_api_keys avec ce hash
 *   - La clé est révoquée (revoked_at non null)
 *
 * Met à jour `last_used_at` au passage (fire-and-forget — pas de await
 * pour ne pas ralentir l'auth).
 */
export async function resolveApiToken(
  token: string,
): Promise<{ user_id: string; key_id: string } | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null

  const hash = hashToken(token)
  const admin = getAdminClient()
  const { data } = await admin
    .from('user_api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()

  if (!data || data.revoked_at) return null

  // Fire-and-forget — un échec ici ne doit pas casser la requête.
  admin
    .from('user_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {})

  return { user_id: data.user_id, key_id: data.id }
}
