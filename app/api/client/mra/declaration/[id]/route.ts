/**
 * GET  /api/client/mra/declaration/[id]          → détail d'une déclaration MRA
 * POST /api/client/mra/declaration/[id]          → action sur le cycle de vie
 *   body : { action: 'declarer'|'payer'|'reset', date?, reference_mra?, montant_paye?, ecriture_id? }
 *
 * Cycle : auto/a_faire → (declarer) → declare → (payer) → paye
 *         (reset) ramène à a_faire / recalcul.
 *
 * Auth : session OU clé API OU token interne (agent Telegram).
 */
import { NextResponse } from 'next/server'
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

async function loadAndAssert(admin: any, userId: string, id: string) {
  const { data: decl, error } = await admin
    .from('mra_declarations').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!decl) { const e: any = new Error('Déclaration introuvable'); e.code = 404; throw e }
  await assertSocieteAccess(admin, userId, decl.societe_id)
  return decl
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await ctx.params
    const admin = getAdminClient()
    const decl = await loadAndAssert(admin, user.id, id)
    return NextResponse.json({ declaration: decl })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    if (e?.code === 404) return NextResponse.json({ error: e.message }, { status: 404 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await ctx.params
    const body = await request.json().catch(() => ({}))
    // action depuis le body OU la query string (?action=) — ce dernier permet
    // aux outils Telegram d'encoder l'action dans l'URL sans body dédié.
    const urlAction = new URL(request.url).searchParams.get('action') || ''
    const action = String(body?.action || urlAction || '')

    const admin = getAdminClient()
    const decl = await loadAndAssert(admin, user.id, id)

    const today = new Date().toISOString().slice(0, 10)
    let patch: Record<string, any> = { updated_at: new Date().toISOString() }

    if (action === 'declarer') {
      patch.statut = 'declare'
      patch.date_declaration = body?.date || today
      if (body?.reference_mra) patch.reference_mra = String(body.reference_mra)
    } else if (action === 'payer') {
      patch.statut = 'paye'
      patch.date_paiement = body?.date || today
      patch.montant_paye = body?.montant_paye != null ? Number(body.montant_paye) : decl.montant_du
      if (!decl.date_declaration) patch.date_declaration = body?.date || today
      if (body?.reference_mra) patch.reference_mra = String(body.reference_mra)
      if (body?.ecriture_id) patch.ecriture_id = String(body.ecriture_id) // lettrage banque
    } else if (action === 'reset') {
      patch.statut = (Number(decl.montant_du) || 0) > 0 ? 'a_faire' : 'sans_objet'
      patch.date_declaration = null
      patch.date_paiement = null
      patch.montant_paye = 0
      patch.ecriture_id = null
    } else {
      return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
    }

    const { data: updated, error: upErr } = await admin
      .from('mra_declarations').update(patch).eq('id', id).select('*').maybeSingle()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ declaration: updated, action })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    if (e?.code === 404) return NextResponse.json({ error: e.message }, { status: 404 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
