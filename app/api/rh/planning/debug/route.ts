import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdmin()

    // Get all plannings
    const { data: plannings, error: planErr } = await supabase
      .from('plannings')
      .select('*')
      .order('periode', { ascending: false })

    // Get all planning_assignments count per planning
    const planningIds = (plannings || []).map((p: any) => p.id)
    let assignments: any[] = []
    if (planningIds.length > 0) {
      const { data: a } = await supabase
        .from('planning_assignments')
        .select('planning_id, employe_id, date, shift_code, heure_debut, heure_fin, est_repos')
        .in('planning_id', planningIds)
        .limit(100)
      assignments = a || []
    }

    // Get employee linked to this user
    const { data: selfEmp } = await supabase
      .from('employes')
      .select('id, nom, prenom, societe_id, auth_user_id, email')
      .or(`auth_user_id.eq.${user.id},email.eq.${user.email || 'NONE'}`)
      .is('date_depart', null)
      .maybeSingle()

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      employee: selfEmp,
      plannings: (plannings || []).map((p: any) => ({
        id: p.id,
        societe_id: p.societe_id,
        periode: p.periode,
        statut: p.statut,
        nom: p.nom,
        nb_assignments: assignments.filter((a: any) => a.planning_id === p.id).length,
      })),
      sample_assignments: assignments.slice(0, 20).map((a: any) => ({
        planning_id: a.planning_id,
        employe_id: a.employe_id,
        date: a.date,
        shift_code: a.shift_code,
        heure_debut: a.heure_debut,
        heure_fin: a.heure_fin,
        est_repos: a.est_repos,
        is_for_me: selfEmp ? a.employe_id === selfEmp.id : false,
      })),
      debug: {
        nb_plannings: (plannings || []).length,
        nb_assignments: assignments.length,
        nb_for_employee: selfEmp ? assignments.filter((a: any) => a.employe_id === selfEmp.id).length : 0,
        employee_societe_id: selfEmp?.societe_id,
        planning_societe_ids: [...new Set((plannings || []).map((p: any) => p.societe_id))],
        planning_periodes: (plannings || []).map((p: any) => p.periode),
        planning_statuts: (plannings || []).map((p: any) => p.statut),
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
