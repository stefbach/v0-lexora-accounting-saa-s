/**
 * POST /api/comptable/immobilisations/comptabiliser
 * body: { societe_id, exercice?, immobilisation_id? }
 *
 * Comptabilise les dotations aux amortissements (D 6811 / C 281x) pour un
 * exercice donné, sur toutes les immobilisations d'une société (ou une seule).
 * Idempotent par pièce (ref_folio AMORT-<immo>-<exercice>).
 *
 * Le registre calculait le plan d'amortissement mais ne générait pas
 * d'écriture — la dotation n'apparaissait donc ni au P&L (classe 68) ni au
 * bilan (cumul classe 28). Cette route pose enfin ces écritures.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { createEcritureDotation } from '@/lib/accounting/amortissement-ecritures'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const societe_id = String(body.societe_id || '').trim()
    const exercice = body.exercice ? String(body.exercice).trim() : null
    const immobilisation_id = body.immobilisation_id ? String(body.immobilisation_id).trim() : null
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) return apiError('access_denied_company', 403)
      throw err
    }

    // Immobilisations de la société (ou une seule)
    let immoQuery = supabase
      .from('immobilisations')
      .select('id, designation, categorie')
      .eq('societe_id', societe_id)
    if (immobilisation_id) immoQuery = immoQuery.eq('id', immobilisation_id)
    const { data: immos, error: immoErr } = await immoQuery
    if (immoErr) throw immoErr
    if (!immos || immos.length === 0) {
      return NextResponse.json({ comptabilise: 0, skipped: 0, message: 'Aucune immobilisation' })
    }

    const immoIds = immos.map((i: any) => i.id)
    const immoById: Record<string, any> = {}
    for (const i of immos) immoById[i.id] = i

    // Lignes du plan d'amortissement à comptabiliser
    let amortQuery = supabase
      .from('amortissements')
      .select('immobilisation_id, exercice, date_fin, dotation')
      .in('immobilisation_id', immoIds)
    if (exercice) amortQuery = amortQuery.eq('exercice', exercice)
    const { data: amorts, error: amortErr } = await amortQuery
    if (amortErr) throw amortErr

    let comptabilise = 0
    let skipped = 0
    let totalDotation = 0
    const erreurs: Array<{ immobilisation_id: string; exercice: string; error: string }> = []

    for (const a of amorts || []) {
      const immo = immoById[a.immobilisation_id]
      if (!immo) continue
      const res = await createEcritureDotation(supabase, {
        immobilisation_id: a.immobilisation_id,
        societe_id,
        designation: immo.designation || 'Immobilisation',
        categorie: immo.categorie,
        exercice: a.exercice,
        date_ecriture: a.date_fin,
        dotation: Number(a.dotation) || 0,
      })
      if (!res.ok) {
        erreurs.push({ immobilisation_id: a.immobilisation_id, exercice: a.exercice, error: res.error || 'échec' })
      } else if (res.nb_entries > 0) {
        comptabilise++
        totalDotation += Number(a.dotation) || 0
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      success: true,
      comptabilise,
      skipped,
      total_dotation_mur: Math.round(totalDotation * 100) / 100,
      erreurs: erreurs.slice(0, 50),
    })
  } catch (e: any) {
    console.error('[immobilisations/comptabiliser]', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
