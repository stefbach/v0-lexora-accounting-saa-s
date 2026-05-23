/**
 * Auth multi-mode pour endpoints API Lexora.
 *
 * Trois sources d'authentification supportées, par ordre de priorité :
 *
 *   1. **X-Lexora-Api-Key** (header) — clé personnelle utilisateur, mig 308.
 *      Format `lex_<32 chars>`. Hashée en DB. Révocable individuellement.
 *      Utilisée par : MCP Lexora (Claude Desktop), n8n d'un utilisateur,
 *      scripts personnels.
 *
 *   2. **X-Internal-Token + X-Internal-User-Id** (headers) — secret partagé
 *      INTERNAL_API_TOKEN. Permet à un service interne (cron, bot Telegram)
 *      d'usurper n'importe quel utilisateur. À éviter pour des MCP clients
 *      finaux — préférer X-Lexora-Api-Key.
 *
 *   3. **Session Supabase** (cookie) — utilisateur connecté via le site web.
 *
 * Usage type :
 *   const user = await resolveUserAuth(request)
 *   if (!user) return NextResponse.json({ error: 'Non auth' }, { status: 401 })
 *   // user.id, user.email, user.source sont garantis
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'
import { resolveApiToken } from '@/lib/supabase/api-keys'

export interface ResolvedUser {
  id: string
  email: string
  /** Pour audit/log — quelle voie d'auth a été empruntée */
  source: 'session' | 'internal_token' | 'api_key'
  /** Si source='api_key', l'ID de la clé utilisée (utile pour révoquer en cas d'abus) */
  api_key_id?: string
}

const API_KEY_HEADER = 'x-lexora-api-key'

export async function resolveUserAuth(request: Request): Promise<ResolvedUser | null> {
  // 1. Clé API personnelle — priorité car la plus granulaire et révocable
  const apiKey = request.headers.get(API_KEY_HEADER)
  if (apiKey) {
    const resolved = await resolveApiToken(apiKey)
    if (resolved) {
      // On récupère l'email depuis profiles pour la cohérence des logs
      const supabase = await createServerClient()
      const { data } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', resolved.user_id)
        .maybeSingle()
      return {
        id: resolved.user_id,
        email: (data as { email?: string } | null)?.email || 'api-key-user',
        source: 'api_key',
        api_key_id: resolved.key_id,
      }
    }
    // Header présent mais clé invalide → rejet explicite plutôt que fallback session
    return null
  }

  // 2. Token interne service-à-service
  const internal = resolveInternalAuth(request)
  if (internal) {
    return {
      id: internal.user_id,
      email: internal.user_email || 'system',
      source: 'internal_token',
    }
  }

  // 3. Session web Supabase
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      return {
        id: user.id,
        email: user.email || '',
        source: 'session',
      }
    }
  } catch {
    // Pas de cookie / cookie invalide — fallback null
  }

  return null
}
