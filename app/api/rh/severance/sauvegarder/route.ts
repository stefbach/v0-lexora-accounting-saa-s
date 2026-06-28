/**
 * POST /api/rh/severance/sauvegarder — sprint G12.
 *
 * Calcule via RPC puis INSERT dans severance_calculs (statut='simulation').
 * Body :
 *   { employe_id, societe_id, date_licenciement, motif_licenciement,
 *     deductions?, commentaire? }
 * Auth : admin / rh.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculerSeveranceEmploye, sauvegarderSimulation, type MotifLicenciement,
} from '@/lib/rh/severance'

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
    const societeId = String(body?.societe_id || '')
    const dateLicenciement = String(body?.date_licenciement || '')
    const motif: MotifLicenciement | null = body?.motif_licenciement || null
    if (!employeId || !societeId || !dateLicenciement) {
      return NextResponse.json({ error: 'employe_id + societe_id + date_licenciement requis' }, { status: 400 })
    }

    const deductions = {
      gratifications: Number(body?.deductions?.gratifications) || 0,
      pension_privee: Number(body?.deductions?.pension_privee) || 0,
      prgf: Number(body?.deductions?.prgf) || 0,
    }

    const calcul = await calculerSeveranceEmploye(supabase, employeId, dateLicenciement, deductions)
    if (!calcul) return NextResponse.json({ error: 'RPC null' }, { status: 500 })

    if (!calcul.eligible) {
      return NextResponse.json({
        error: 'Employé non éligible',
        code: 'not_eligible',
        motif: calcul.motif_non_eligible,
        calcul,
      }, { status: 422 })
    }

    const result = await sauvegarderSimulation(supabase, calcul, {
      employe_id: employeId,
      societe_id: societeId,
      date_licenciement: dateLicenciement,
      motif_licenciement: motif,
      deductions,
      commentaire: body?.commentaire || null,
      createdBy: user.id,
    })
    if (!result.ok) {
      return NextResponse.json({ error: (result as any).erreur }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: result.id, calcul })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
