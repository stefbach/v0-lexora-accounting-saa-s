/**
 * GET/POST /api/rh/prgf/exit-statements — sprint G13.
 * GET : liste des exit statements d'une société.
 * POST : créer un nouveau (calcul auto de final_remuneration).
 * Auth : admin + rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  creerExitStatement, getExitStatementsSociete, calculerFinalRemuneration,
  type MotifExit,
} from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')?.trim()
    const preview = searchParams.get('preview_employe_id')?.trim()
    const previewDate = searchParams.get('preview_date')?.trim()

    // Mode preview : calcul sans créer
    if (preview && previewDate) {
      const r = await calculerFinalRemuneration(supabase, preview, previewDate)
      return NextResponse.json({ preview: r })
    }

    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const list = await getExitStatementsSociete(supabase, societeId)
    return NextResponse.json({ exit_statements: list })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const employeId = String(body.employe_id || '').trim()
    const societeId = String(body.societe_id || '').trim()
    const dateExit = String(body.date_exit || '').trim()
    const motif = String(body.motif_exit || '').trim() as MotifExit
    if (!employeId || !societeId || !dateExit || !motif) {
      return NextResponse.json({
        error: 'employe_id, societe_id, date_exit et motif_exit requis',
      }, { status: 400 })
    }

    const r = await creerExitStatement(supabase, {
      employeId, societeId, dateExit, motif, createdBy: user.id,
    })
    if (!r.ok) return NextResponse.json({ error: r.erreur }, { status: 500 })
    return NextResponse.json({ success: true, id: r.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
