import { createClient } from '@supabase/supabase-js'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — List clients visible to the current user
export async function GET() {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
      return apiError('not_authenticated', 401)
    }

    const supabase = getAdminClient()

    // Get current user's role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.role || ''

    // Admin and comptable roles can access
    if (!['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(role)) {
      return apiError('unauthorized_access', 403)
    }

    if (['admin', 'super_admin', 'comptable'].includes(role)) {
      // Sees all clients
      const { data: clients, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, phone, comptable_id, is_active, created_at')
        .in('role', ['client_admin', 'client_user'])
        .order('created_at', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Get all dossiers
      const { data: dossiers } = await supabase.from('dossiers').select('*')
      // Enrich with societe names
      const societeIds = [...new Set((dossiers || []).map(d => d.societe_id).filter(Boolean))]
      let societeMap: Record<string, any> = {}
      if (societeIds.length > 0) {
        const { data: societes } = await supabase.from('societes').select('id, nom').in('id', societeIds)
        ;(societes || []).forEach(s => { societeMap[s.id] = s })
      }
      const enrichedDossiers = (dossiers || []).map(d => ({ ...d, societe: societeMap[d.societe_id] || null }))

      return NextResponse.json({ clients, dossiers: enrichedDossiers })
    } else if (role === 'client_admin') {
      // Client admin: sees own data
      const { data: dossiers } = await supabase.from('dossiers').select('*').eq('client_id', user.id)
      const societeIds = (dossiers || []).map(d => d.societe_id).filter(Boolean)
      let societes: any[] = []
      if (societeIds.length > 0) {
        const { data } = await supabase.from('societes').select('id, nom').in('id', societeIds)
        societes = data || []
      }
      return NextResponse.json({
        clients: [{ id: user.id, ...profile }],
        dossiers: (dossiers || []).map(d => ({ ...d, societe: societes.find(s => s.id === d.societe_id) || null })),
      })
    } else {
      // Comptable dédié: only assigned clients via dossiers
      const { data: dossiers } = await supabase.from('dossiers').select('*').eq('comptable_id', user.id).eq('statut', 'actif')
      const clientIds = [...new Set((dossiers || []).map(d => d.client_id).filter(Boolean))]
      const societeIds = [...new Set((dossiers || []).map(d => d.societe_id).filter(Boolean))]

      let clients: any[] = []
      let societeMap: Record<string, any> = {}
      if (clientIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, email, full_name, role, phone, is_active, created_at').in('id', clientIds)
        clients = data || []
      }
      if (societeIds.length > 0) {
        const { data } = await supabase.from('societes').select('id, nom').in('id', societeIds)
        ;(data || []).forEach(s => { societeMap[s.id] = s })
      }

      return NextResponse.json({
        clients,
        dossiers: (dossiers || []).map(d => ({ ...d, societe: societeMap[d.societe_id] || null })),
      })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
