/**
 * GET /api/comptable/sante-banque
 *
 * Garde-fou rapprochement : détecte les anomalies bancaires sur TOUS les
 * relevés / écritures BNQ / comptes, en s'appuyant sur les vues SQL
 * v_banque_anomalies + v_sante_banque (migration 461).
 *
 * 6 contrôles : lignes_a_zero, dates_manquantes, ecart_reconciliation,
 * lignes_vs_total, bnq_date_hors_periode, compte_bancaire_double.
 *
 * Query params :
 *   - societe_id (optionnel) : restreint à une société (sinon toutes les
 *     sociétés accessibles à l'utilisateur).
 *
 * Retourne : { societes: [{ societe_id, nom, couleur, nb_critiques, ... }],
 *              anomalies: [...], total, pire }
 *
 * Auth : session + accès société via lib/rh/access.ts. Cache 60s.
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
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
}

const COULEUR_RANK: Record<string, number> = { rouge: 3, orange: 2, vert: 1 }

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')

    // Détermine le périmètre des sociétés à inspecter
    let societeIds: string[]
    if (societeId) {
      if (!(await userHasAccessToSociete(user.id, societeId))) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }
      societeIds = [societeId]
    } else {
      societeIds = await getUserSocieteIds(user.id)
    }

    if (societeIds.length === 0) {
      return NextResponse.json(
        { societes: [], anomalies: [], total: 0, pire: null },
        { headers: CACHE_HEADERS },
      )
    }

    const admin = getAdminClient()

    const [{ data: synth, error: synthErr }, { data: anomalies, error: anoErr }, { data: societes }] =
      await Promise.all([
        admin.from('v_sante_banque').select('*').in('societe_id', societeIds),
        admin.from('v_banque_anomalies').select('*').in('societe_id', societeIds),
        admin.from('societes').select('id, nom').in('id', societeIds),
      ])

    if (synthErr) {
      console.error('[sante-banque] v_sante_banque:', synthErr)
      return NextResponse.json({ error: synthErr.message }, { status: 500 })
    }
    if (anoErr) {
      console.error('[sante-banque] v_banque_anomalies:', anoErr)
      return NextResponse.json({ error: anoErr.message }, { status: 500 })
    }

    const nomMap = new Map((societes || []).map(s => [s.id, s.nom]))

    const rows = (synth || [])
      .map(s => ({ ...s, nom: nomMap.get(s.societe_id) || 'Société' }))
      // N'expose que les sociétés non-vertes dans l'overview (le reste est sain)
      .sort((a, b) => {
        const r = (COULEUR_RANK[b.couleur] || 0) - (COULEUR_RANK[a.couleur] || 0)
        if (r !== 0) return r
        return (b.nb_critiques || 0) - (a.nb_critiques || 0)
      })

    const anomaliesEnriched = (anomalies || []).map(a => ({
      ...a,
      nom: nomMap.get(a.societe_id) || 'Société',
    }))

    const pire = rows.find(r => r.couleur !== 'vert') || null

    return NextResponse.json(
      {
        societes: rows,
        anomalies: anomaliesEnriched,
        total: anomaliesEnriched.length,
        pire,
        generated_at: new Date().toISOString(),
      },
      { headers: CACHE_HEADERS },
    )
  } catch (e: any) {
    console.error('[sante-banque]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    )
  }
}
