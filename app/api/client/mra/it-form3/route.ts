/**
 * GET /api/client/mra/it-form3?societe_id=...&annee=YYYY
 *   → IT Form 3 annuel : agrégat TDS par fournisseur/catégorie (via RPC
 *     tds_annual_statement mig 259), totaux, statut de la déclaration
 *     (mra_declarations type=IT_FORM3 periode=YYYY, échéance 15 août).
 *
 * POST /api/client/mra/it-form3  body : { societe_id, annee, action: 'sync' }
 *   → (re)calcule et upsert mra_declarations IT_FORM3 pour l'année (montant
 *     dû = somme TDS de l'année). Idempotent.
 *
 * Auth multi-mode.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function loadAggregate(admin: any, societe_id: string, annee: number) {
  const { data, error } = await admin.rpc('tds_annual_statement', {
    p_societe_id: societe_id,
    p_year: annee,
  })
  if (error) throw new Error(error.message)
  const rows = (data || []) as any[]
  const total_brut = rows.reduce((s, r) => s + Number(r.total_paiements_mur || 0), 0)
  const total_tds = rows.reduce((s, r) => s + Number(r.total_tds_mur || 0), 0)
  const nb_factures = rows.reduce((s, r) => s + Number(r.nb_factures || 0), 0)
  const nb_fournisseurs = new Set(rows.map(r => r.tiers)).size
  return { rows, total_brut, total_tds, nb_factures, nb_fournisseurs }
}

export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const anneeStr = searchParams.get('annee') || String(new Date().getFullYear() - 1)
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const annee = Number(anneeStr)
    if (!Number.isInteger(annee) || annee < 2000) return NextResponse.json({ error: 'annee invalide' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const agg = await loadAggregate(admin, societe_id, annee)
    const { data: decl } = await admin
      .from('mra_declarations').select('*')
      .eq('societe_id', societe_id).eq('type', 'IT_FORM3').eq('periode', String(annee))
      .maybeSingle()

    return NextResponse.json({
      societe_id, annee,
      summary: {
        nb_fournisseurs: agg.nb_fournisseurs,
        nb_factures: agg.nb_factures,
        total_brut: Math.round(agg.total_brut * 100) / 100,
        total_tds: Math.round(agg.total_tds * 100) / 100,
      },
      par_fournisseur: agg.rows,
      declaration: decl,
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)
    const body = await request.json().catch(() => ({})) as any
    const societe_id = String(body?.societe_id || '')
    const annee = Number(body?.annee || (new Date().getFullYear() - 1))
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    if (body?.action !== 'sync') {
      return NextResponse.json({ error: 'action invalide (utiliser "sync")' }, { status: 400 })
    }

    // Calcule l'agrégat puis upsert dans mra_declarations via _mra_upsert.
    const agg = await loadAggregate(admin, societe_id, annee)
    const meta = {
      nb_fournisseurs: agg.nb_fournisseurs,
      nb_factures: agg.nb_factures,
      total_brut: Math.round(agg.total_brut * 100) / 100,
    }
    const { error } = await admin.rpc('_mra_upsert', {
      p_societe_id: societe_id,
      p_type: 'IT_FORM3',
      p_periode: String(annee),
      p_montant: Math.round(agg.total_tds * 100) / 100,
      p_meta: meta,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: decl } = await admin
      .from('mra_declarations').select('*')
      .eq('societe_id', societe_id).eq('type', 'IT_FORM3').eq('periode', String(annee))
      .maybeSingle()

    return NextResponse.json({ ok: true, declaration: decl, summary: meta, total_tds: Math.round(agg.total_tds * 100) / 100 })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
