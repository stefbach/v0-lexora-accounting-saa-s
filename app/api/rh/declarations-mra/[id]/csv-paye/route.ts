/**
 * GET /api/rh/declarations-mra/[id]/csv-paye — sprint G13.
 * Télécharge le CSV PAYE format MRA.
 * Auth : admin + rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { genererCsvMraPaye, type DeclarationMraRecap } from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return new NextResponse('Non autorisé', { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) return new NextResponse('Accès refusé', { status: 403 })

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return new NextResponse('id requis', { status: 400 })

    const { data } = await supabase
      .from('declarations_paye_mensuelle')
      .select('*').eq('id', id).maybeSingle()
    if (!data) return new NextResponse('Déclaration introuvable', { status: 404 })

    const r = data as any
    const recap: DeclarationMraRecap = {
      societe_id: String(r.societe_id),
      periode: String(r.periode).slice(0, 10),
      nb_employes: Number(r.nb_employes) || 0,
      nb_prgf_eligibles: 0,
      masse_salariale: Number(r.total_salaires_bruts) || 0,
      total_paye: Number(r.total_paye_retenu) || 0,
      total_csg_salarie: 0, total_csg_patronal: 0,
      total_nsf_salarie: 0, total_nsf_patronal: 0,
      total_training_levy: 0, total_prgf: 0, total_a_remettre_mra: 0,
      details: Array.isArray(r.details_par_employe) ? r.details_par_employe : [],
    }
    const csv = genererCsvMraPaye(recap)
    const filename = `mra_paye_${recap.periode.slice(0, 7)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return new NextResponse(`Erreur: ${e?.message || 'serveur'}`, { status: 500 })
  }
}
