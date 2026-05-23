/**
 * GET /api/comptable/sante-pcm
 *
 * Endpoint de surveillance temps réel de la santé comptable.
 * Cible : déséquilibres invisibles dans ecritures_comptables_v2.
 *
 * Query params :
 *   - societe_id (optionnel) : si fourni, retourne le détail pour CETTE société.
 *     Sinon, retourne la liste des sociétés accessibles + leur état de santé
 *     (utilisé par le badge global du dashboard).
 *
 * Retourne :
 *   - mode = 'detail'    → { synthese, journaux, folios, orphelines, comptes_invalides }
 *   - mode = 'overview'  → { societes: [{ societe_id, nom, sante_couleur, sante_score, ... }], pire }
 *
 * Auth : vérifie session + accès à la société via lib/rh/access.ts.
 * Cache : 60s (Cache-Control: max-age=60, stale-while-revalidate=120).
 *
 * Voir migration 303_view_sante_pcm.sql.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds, userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cache 60s côté CDN/navigateur ; les écritures changent rarement à la minute
// près et un re-fetch manuel reste possible via le bouton "Recharger".
const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')

    const admin = getAdminClient()

    // ─── Mode "detail" : une société ciblée ────────────────────────────────
    if (societeId) {
      const hasAccess = await userHasAccessToSociete(user.id, societeId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }

      const { data, error } = await admin.rpc('check_sante_pcm', {
        p_societe_id: societeId,
      })

      if (error) {
        console.error('[sante-pcm] rpc check_sante_pcm:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(
        { mode: 'detail', societe_id: societeId, ...data },
        { headers: CACHE_HEADERS }
      )
    }

    // ─── Mode "overview" : toutes les sociétés accessibles ─────────────────
    const societeIds = await getUserSocieteIds(user.id)
    if (societeIds.length === 0) {
      return NextResponse.json(
        { mode: 'overview', societes: [], pire: null },
        { headers: CACHE_HEADERS }
      )
    }

    // Vue v_sante_pcm scopée aux sociétés accessibles
    const { data: scores, error: scoresErr } = await admin
      .from('v_sante_pcm')
      .select('*')
      .in('societe_id', societeIds)

    if (scoresErr) {
      console.error('[sante-pcm] select v_sante_pcm:', scoresErr)
      return NextResponse.json({ error: scoresErr.message }, { status: 500 })
    }

    // Joindre nom des sociétés pour affichage
    const { data: societes } = await admin
      .from('societes')
      .select('id, nom')
      .in('id', societeIds)
    const nomMap = new Map((societes || []).map(s => [s.id, s.nom]))

    const rows = (scores || []).map(s => ({
      ...s,
      nom: nomMap.get(s.societe_id) || 'Société',
    }))

    // Détermine la pire (rouge > orange > vert, puis score asc)
    const COULEUR_RANK: Record<string, number> = { rouge: 3, orange: 2, vert: 1 }
    const pire = [...rows].sort((a, b) => {
      const r = (COULEUR_RANK[b.sante_couleur] || 0) - (COULEUR_RANK[a.sante_couleur] || 0)
      if (r !== 0) return r
      return (a.sante_score || 0) - (b.sante_score || 0)
    })[0] || null

    return NextResponse.json(
      { mode: 'overview', societes: rows, pire },
      { headers: CACHE_HEADERS }
    )
  } catch (e: unknown) {
    console.error('[sante-pcm]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
