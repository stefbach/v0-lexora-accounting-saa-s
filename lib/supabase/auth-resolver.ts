/**
 * Auth bi-mode pour endpoints API Lexora — session web OU token interne.
 *
 * Beaucoup d'endpoints client/* sont initialement protégés par session
 * Supabase (cookie). Pour permettre l'accès depuis :
 *   - Le bot Telegram (lib/lexora-internal-auth)
 *   - Le serveur MCP Lexora (Claude Desktop, n8n, scripts ops)
 *   - Les CRON jobs en mode supabase-admin
 *
 * On accepte aussi les headers `X-Internal-Token` + `X-Internal-User-Id`.
 * Le token est validé contre `process.env.INTERNAL_API_TOKEN` (secret partagé
 * entre Lexora et les clients internes autorisés). Le user_id permet
 * d'usurper un utilisateur précis pour conserver le tenant isolation.
 *
 * Usage type :
 *   export async function GET(request: Request) {
 *     const user = await resolveUserAuth(request)
 *     if (!user) return NextResponse.json({ error: 'Non auth' }, { status: 401 })
 *     // ... user.id est valide, peu importe la source (session OU token)
 *   }
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'

export interface ResolvedUser {
  id: string
  email: string
  /** Source d'authentification — utile pour audit/log */
  source: 'session' | 'internal_token'
}

export async function resolveUserAuth(request: Request): Promise<ResolvedUser | null> {
  // 1. Tente le token interne (rapide, headers)
  const internal = resolveInternalAuth(request)
  if (internal) {
    return {
      id: internal.user_id,
      email: internal.user_email || 'system',
      source: 'internal_token',
    }
  }

  // 2. Sinon, session web Supabase (cookie)
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
    // Cookie absent ou invalide — pas grave, on tombe sur null
  }

  return null
}
