import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getActiveSocieteIdFromCookies } from '@/lib/client/active-societe'
import { previewOvertimeMois } from '@/lib/rh/overtime'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rh/paie/ot/preview?periode=YYYY-MM-01
 *
 * Calcule en lecture seule les heures supplémentaires (OT) du mois pour la
 * société active de l'utilisateur. Aucune écriture DB.
 *
 * Auth :
 *   1. User connecté
 *   2. Société active : query param `societe_id` prioritaire (pattern
 *      legacy /rh/...), sinon fallback cookie active_societe_id (pattern
 *      /client/... via SocieteActiveProvider)
 *   3. Rôle ∈ {rh, manager, client_admin} sur cette société dans
 *      user_societes (PAS profiles.role — décision métier : les admins
 *      Lexora gèrent la plateforme, pas les chiffres métier des clients).
 *      Defense-in-depth alignée avec la RLS posée en migration 209. Le
 *      check user_societes vérifie d'un coup (a) accès et (b) rôle, donc
 *      un user qui passerait un societe_id auquel il n'a pas accès se
 *      verra retourner 403.
 */

const ALLOWED_ROLES = ['rh', 'manager', 'client_admin'] as const
const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-01$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  try {
    // 1. Auth
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Société active : query param `societe_id` prioritaire, fallback
    //    cookie active_societe_id. Le query param sert au pattern /rh
    //    (Select explicite, cf. legacy /rh/paie/primes), le cookie sert au
    //    pattern /client (SocieteActiveProvider).
    const { searchParams } = new URL(request.url)
    const societeIdFromQuery = searchParams.get('societe_id')
    if (societeIdFromQuery && !UUID_REGEX.test(societeIdFromQuery)) {
      return NextResponse.json({ error: 'societe_id invalide' }, { status: 400 })
    }
    const societeId = societeIdFromQuery ?? await getActiveSocieteIdFromCookies()
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société sélectionnée' }, { status: 400 })
    }

    // 3. Vérification rôle sur user_societes (admin client pour bypass RLS,
    //    le gate applicatif est explicite ici).
    const supabase = getAdminClient()
    const { data: link } = await supabase
      .from('user_societes')
      .select('role')
      .eq('user_id', user.id)
      .eq('societe_id', societeId)
      .maybeSingle()

    const role = (link?.role ?? '') as string
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // 4. Validation periode (searchParams déjà parsé en étape 2)
    const periode = searchParams.get('periode') ?? ''
    if (!PERIODE_REGEX.test(periode)) {
      return NextResponse.json(
        { error: 'Période invalide (format attendu: YYYY-MM-01)' },
        { status: 400 },
      )
    }

    // 5. Preview OT (read-only). RLS bypassée volontairement, l'access
    //    control est posé à l'étape 3 + miroir RLS migration 209.
    const lignes = await previewOvertimeMois(supabase, societeId, periode)

    return NextResponse.json({ lignes })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : ''
    // Stack et détail DB restent côté serveur (Vercel logs) — jamais
    // renvoyés au client pour ne pas leak d'info structurelle.
    console.error('[ot/preview] CRASH:', msg, stack)
    return NextResponse.json(
      { error: 'Erreur lors du calcul des heures supplémentaires' },
      { status: 500 },
    )
  }
}
