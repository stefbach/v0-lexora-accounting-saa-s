import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// POST — Assign/unassign societies and clients to a comptable dédié
// Body: { comptable_dedie_id, society_assignments: [{ dossier_id, assigned }], client_assignments: [{ client_id, assigned }] }
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { comptable_dedie_id, society_assignments, client_assignments } = await request.json()

    if (!comptable_dedie_id) {
      return NextResponse.json({ error: 'comptable_dedie_id est requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verify the target is actually a comptable_dedie
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', comptable_dedie_id)
      .single()

    if (!targetProfile || targetProfile.role !== 'comptable_dedie') {
      return NextResponse.json({ error: 'Utilisateur cible n\'est pas un comptable dédié' }, { status: 400 })
    }

    const results = { societies_updated: 0, clients_updated: 0, errors: [] as string[] }

    // Handle society assignments (update dossiers.comptable_id)
    if (Array.isArray(society_assignments)) {
      for (const sa of society_assignments) {
        const { dossier_id, assigned } = sa
        if (!dossier_id) continue

        const newComptableId = assigned ? comptable_dedie_id : null
        const { error } = await supabase
          .from('dossiers')
          .update({ comptable_id: newComptableId })
          .eq('id', dossier_id)

        if (error) {
          results.errors.push(`Dossier ${dossier_id}: ${error.message}`)
        } else {
          results.societies_updated++
        }
      }
    }

    // Handle direct client assignments (clients without societies)
    if (Array.isArray(client_assignments)) {
      for (const ca of client_assignments) {
        const { client_id, assigned } = ca
        if (!client_id) continue

        const newComptableId = assigned ? comptable_dedie_id : null
        const { error } = await supabase
          .from('profiles')
          .update({ comptable_id: newComptableId })
          .eq('id', client_id)

        if (error) {
          results.errors.push(`Client ${client_id}: ${error.message}`)
        } else {
          results.clients_updated++
        }
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
