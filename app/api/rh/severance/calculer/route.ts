/**
 * POST /api/rh/severance/calculer — sprint G12.
 *
 * Preview sans sauvegarder. Body :
 *   { employe_id, date_licenciement, deductions?: {gratifications, pension_privee, prgf} }
 * Auth : admin / rh.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerSeveranceEmploye } from '@/lib/rh/severance'

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
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return apiError('hr_admin_only', 403)
    }

    const body = await request.json().catch(() => ({} as any))
    const employeId = String(body?.employe_id || '')
    const dateLicenciement = String(body?.date_licenciement || '')
    if (!employeId || !dateLicenciement) {
      return NextResponse.json({ error: 'employe_id + date_licenciement requis' }, { status: 400 })
    }

    const calcul = await calculerSeveranceEmploye(supabase, employeId, dateLicenciement, {
      gratifications: Number(body?.deductions?.gratifications) || 0,
      pension_privee: Number(body?.deductions?.pension_privee) || 0,
      prgf: Number(body?.deductions?.prgf) || 0,
    })
    if (!calcul) return NextResponse.json({ error: 'RPC renvoie null' }, { status: 500 })
    return NextResponse.json({ calcul, saved: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
