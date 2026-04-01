import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')

    if (clientId) {
      // Get one client with its sociétés
      const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
      if (!client) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

      const { data: societes } = await supabase.from('societes').select('*').eq('client_id', clientId).order('nom')
      const { data: users } = await supabase.from('profiles').select('id, email, full_name, role').eq('client_id', clientId)

      return NextResponse.json({ client, societes: societes || [], users: users || [] })
    }

    // List all clients with société count
    const { data: clients, error } = await supabase.from('clients').select('*').order('nom')
    if (error) throw error

    // Enrich with société count
    const enriched = []
    for (const c of clients || []) {
      const { count } = await supabase.from('societes').select('id', { count: 'exact', head: true }).eq('client_id', c.id)
      const { count: userCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('client_id', c.id)
      enriched.push({ ...c, nb_societes: count || 0, nb_users: userCount || 0 })
    }

    return NextResponse.json({ clients: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'creer') {
      const { nom, email_principal, telephone, adresse, plan } = body
      if (!nom) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

      const { data, error } = await supabase.from('clients').insert({
        nom, email_principal: email_principal || null,
        telephone: telephone || null, adresse: adresse || null,
        plan: plan || 'premium',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ client: data })
    }

    if (action === 'modifier') {
      const { id, ...updates } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      delete updates.action
      const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ client: data })
    }

    if (action === 'assigner_societe') {
      const { client_id, societe_id } = body
      if (!client_id || !societe_id) return NextResponse.json({ error: 'client_id et societe_id requis' }, { status: 400 })
      const { error } = await supabase.from('societes').update({ client_id }).eq('id', societe_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'assigner_user') {
      const { client_id, user_id } = body
      if (!client_id || !user_id) return NextResponse.json({ error: 'client_id et user_id requis' }, { status: 400 })
      const { error } = await supabase.from('profiles').update({ client_id }).eq('id', user_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
