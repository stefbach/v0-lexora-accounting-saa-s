import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — list groupes for a manager, or all manager-groupe assignments
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const managerId = searchParams.get('manager_id') || user.id
    const societeId = searchParams.get('societe_id')

    // Get manager's assigned groupes
    const { data: assignments } = await supabase
      .from('manager_groupes')
      .select('groupe_id')
      .eq('manager_id', managerId)

    const groupeIds = (assignments || []).map(a => a.groupe_id)

    // Get groupe details
    let groupes: any[] = []
    if (groupeIds.length > 0) {
      const { data } = await supabase.from('groupes_employes').select('*').in('id', groupeIds)
      groupes = data || []
    }

    // Get employee IDs in those groupes
    let employeIds: string[] = []
    if (groupeIds.length > 0) {
      const { data: eg } = await supabase.from('employe_groupes').select('employe_id').in('groupe_id', groupeIds)
      employeIds = [...new Set((eg || []).map(e => e.employe_id))]
    }

    // If manager has NO assigned groupes, check profile role
    const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', managerId).single()
    const isFullAccess = profile?.role && ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'].includes(profile.role)

    return NextResponse.json({
      groupes,
      groupe_ids: groupeIds,
      employe_ids: isFullAccess ? null : employeIds, // null = all access
      full_access: isFullAccess,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — assign/remove groupes for a manager
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'affecter') {
      const { manager_id, groupe_ids } = body
      if (!manager_id || !groupe_ids) return NextResponse.json({ error: 'manager_id et groupe_ids requis' }, { status: 400 })

      // Remove old
      await supabase.from('manager_groupes').delete().eq('manager_id', manager_id)

      // Insert new
      if (groupe_ids.length > 0) {
        const rows = groupe_ids.map((gid: string) => ({ manager_id, groupe_id: gid }))
        await supabase.from('manager_groupes').insert(rows)
      }

      return NextResponse.json({ success: true, nb_groupes: groupe_ids.length })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
