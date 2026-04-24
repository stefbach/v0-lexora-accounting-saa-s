import { NextResponse } from 'next/server'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

/**
 * Context provided to the wrapped handler: already-authenticated user,
 * a service-role admin client (RLS bypassed), and the validated société id.
 */
export type SocieteAccessContext = {
  user: User
  admin: SupabaseClient
  societeId: string
}

function getAdminClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Pattern de référence pour toute route API tenantée (multi-société).
 *
 * Enchaîne, en une seule unité :
 *   1. Authentification via le cookie Supabase (`auth.getUser()`)
 *      → 401 `{ error: 'Unauthorized' }` si pas de session
 *   2. Extraction du `societe_id` via la fonction fournie (query-string,
 *      body JSON, route param, header…)
 *      → 400 `{ error: 'societe_id requis' }` si absent
 *   3. Vérification d'accès via `assertSocieteAccess` (user_societes,
 *      dossiers.client_id, societes.created_by, ou rôle admin/super_admin)
 *      → 403 `{ error: 'Accès refusé à cette société' }` si refusé
 *   4. Exécution du `handler` avec un contexte pré-validé.
 *
 * Le handler peut soit retourner une `NextResponse` (cas normal), soit
 * renvoyer n'importe quelle valeur — `withSocieteAccess` la propage telle
 * quelle au caller.
 *
 * @example
 * // GET /api/mon-endpoint?societe_id=...
 * export async function GET(request: Request) {
 *   return withSocieteAccess(
 *     request,
 *     (req) => new URL(req.url).searchParams.get('societe_id'),
 *     async ({ admin, societeId }) => {
 *       const { data } = await admin
 *         .from('ma_table')
 *         .select('*')
 *         .eq('societe_id', societeId)
 *       return NextResponse.json({ data })
 *     },
 *   )
 * }
 *
 * @example
 * // POST /api/mon-endpoint  avec { societe_id, ... } dans le body
 * export async function POST(request: Request) {
 *   const body = await request.json()
 *   return withSocieteAccess(
 *     request,
 *     () => body?.societe_id ?? null,
 *     async ({ user, admin, societeId }) => {
 *       // … logique métier avec tenant garanti …
 *       return NextResponse.json({ ok: true })
 *     },
 *   )
 * }
 */
export async function withSocieteAccess<T>(
  request: Request,
  societeIdGetter: (req: Request) => Promise<string | null> | (string | null),
  handler: (ctx: SocieteAccessContext) => Promise<T>,
): Promise<T | NextResponse> {
  // 1. Authentification
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Extraction du societe_id
  const societeId = await Promise.resolve(societeIdGetter(request))
  if (!societeId) {
    return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  }

  // 3. Vérification d'accès multi-tenant
  const admin = getAdminClient()
  try {
    await assertSocieteAccess(admin, user.id, societeId)
  } catch (err) {
    if (err instanceof SocieteAccessError) {
      return NextResponse.json(
        { error: 'Accès refusé à cette société' },
        { status: 403 },
      )
    }
    throw err
  }

  // 4. Délégation au handler avec contexte pré-validé
  return handler({ user, admin, societeId })
}
