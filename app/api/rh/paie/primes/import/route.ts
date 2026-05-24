import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getActiveSocieteIdFromCookies } from '@/lib/client/active-societe'
import {
  importPrimes,
  type LigneFront,
} from '@/lib/rh/import-primes'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/paie/primes/import
 *
 * Body :
 *   {
 *     societe_id?: string,       // UUID, optionnel — fallback cookie
 *     periode: 'YYYY-MM-01',
 *     lignes: Array<{
 *       employe_id: string,      // UUID employé déjà résolu côté UI
 *       montant: number,         // > 0, en MUR
 *     }>,
 *   }
 *
 * Auth :
 *   1. user connecté (sinon 401)
 *   2. societe_id : body prioritaire, fallback cookie active_societe_id
 *      (mêmes règles que /api/rh/paie/ot/save)
 *   3. user_societes.role IN ('rh','manager','client_admin') sur ce
 *      societe_id (sinon 403). Pas d'admin Lexora — décision métier
 *      cohérente avec OT (data métier client).
 *
 * Sécurité :
 *   - La lib (importPrimes) revérifie que tous les employes_id de
 *     lignes appartiennent à societe_id → filet anti-tampering.
 *   - Validation montant > 0 et < 1M MUR au niveau lib.
 *   - Bulletins verrouillés ou validés sur la période → ces employés
 *     sont retirés du batch et listés dans bulletins_bloques (le reste
 *     du batch passe).
 */

const ALLOWED_ROLES = ['rh', 'manager', 'team_leader', 'client_admin'] as const
const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-01$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface BodyValidationError {
  path: string                    // ex: "lignes[0].employe_id"
  error: string
}

/**
 * Valide la forme de body.lignes — pas la sémantique métier (l'employé
 * existe-t-il, le montant est-il dans la limite raisonnable, etc.,
 * c'est importPrimes côté lib).
 *
 * Règles :
 *   - chaque ligne est un objet
 *   - employe_id : UUID valide (regex)
 *   - montant : number fini > 0
 *
 * Collecte toutes les erreurs avec leur path précis.
 */
function validateBodyLignes(
  raw: unknown,
): { ok: true; lignes: LigneFront[] } | { ok: false; errors: BodyValidationError[] } {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [{ path: 'lignes', error: 'array attendu' }] }
  }
  // Array vide accepté : l'utilisateur peut avoir mis tous les Selects
  // sur "-- ignorer --" dans l'UI. La lib gère le no-op.
  const errors: BodyValidationError[] = []
  const lignes: LigneFront[] = []

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      errors.push({ path: `lignes[${i}]`, error: 'objet attendu' })
      continue
    }
    const obj = item as Record<string, unknown>
    let lineHasError = false

    if (typeof obj.employe_id !== 'string' || !UUID_REGEX.test(obj.employe_id)) {
      errors.push({
        path: `lignes[${i}].employe_id`,
        error: 'UUID valide requis',
      })
      lineHasError = true
    }

    const montant = Number(obj.montant)
    if (!Number.isFinite(montant) || montant <= 0) {
      errors.push({
        path: `lignes[${i}].montant`,
        error: 'numérique > 0 attendu',
      })
      lineHasError = true
    }

    if (lineHasError) continue
    lignes.push({
      employe_id: obj.employe_id as string,
      montant,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, lignes }
}

export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Parse body — fait avant le role check pour pouvoir extraire le
    //    societe_id éventuellement passé en body (pattern /rh).
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })
    }
    const { periode, lignes: rawLignes, societe_id: societeIdFromBody } = body as {
      periode?: unknown
      lignes?: unknown
      societe_id?: unknown
    }

    // 3. Société active : body.societe_id prioritaire (pattern /rh),
    //    fallback cookie active_societe_id (pattern /client).
    const explicitSocieteId =
      typeof societeIdFromBody === 'string' && societeIdFromBody.length > 0
        ? societeIdFromBody
        : null
    if (explicitSocieteId && !UUID_REGEX.test(explicitSocieteId)) {
      return NextResponse.json({ error: 'societe_id invalide' }, { status: 400 })
    }
    const societeId = explicitSocieteId ?? await getActiveSocieteIdFromCookies()
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société sélectionnée' }, { status: 400 })
    }

    // 4. Vérification rôle sur user_societes (couvre AUSSI le check
    //    d'accès : si l'user n'a pas de ligne pour ce societe_id, link
    //    est null et on retourne 403).
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

    // 5. Validation forme du body (periode + lignes).
    if (typeof periode !== 'string' || !PERIODE_REGEX.test(periode)) {
      return NextResponse.json(
        { error: 'Période invalide (format attendu: YYYY-MM-01)' },
        { status: 400 },
      )
    }
    const validation = validateBodyLignes(rawLignes)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'Format de la requête invalide', details: validation.errors },
        { status: 400 },
      )
    }

    // 6. Délégation à la lib (validation métier serveur + UPSERT +
    //    audit log).
    const result = await importPrimes(
      supabase,
      societeId,
      periode,
      validation.lignes,
      { id: user.id, email: user.email ?? user.id },
    )

    return NextResponse.json(result)
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : ''
    // Stack et détail DB restent côté serveur (Vercel logs).
    console.error('[primes/import] CRASH:', msg, stack)
    return NextResponse.json(
      { error: "Erreur lors de l'import des primes" },
      { status: 500 },
    )
  }
}
