/**
 * POST /api/rh/declarations-mra/sauvegarder — sprint G13.
 * Upsert des 2 tables (paye + csg) avec détails par employé.
 * Auth : admin + rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  agregerDeclarationsMraMois, firstDayOfMonth,
  sauvegarderDeclarationPaye, sauvegarderDeclarationCsg,
} from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const societeId = String(body.societe_id || '').trim()
    const periode = String(body.periode || '').trim()
    const ern = body.ern ? String(body.ern).trim() : null
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!periode) return NextResponse.json({ error: 'periode requise' }, { status: 400 })

    const recap = await agregerDeclarationsMraMois(supabase, societeId, firstDayOfMonth(periode))
    const paye = await sauvegarderDeclarationPaye(supabase, recap, ern)
    if (!paye.ok) return NextResponse.json({ error: `Paye: ${paye.erreur}` }, { status: 500 })
    const csg = await sauvegarderDeclarationCsg(supabase, recap, ern)
    if (!csg.ok) return NextResponse.json({ error: `Csg: ${csg.erreur}` }, { status: 500 })

    return NextResponse.json({
      success: true,
      declaration_paye_id: paye.id,
      declaration_csg_id: csg.id,
      recap,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
