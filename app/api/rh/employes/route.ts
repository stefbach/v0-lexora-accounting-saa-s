import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
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

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const search = searchParams.get('search')
    const actifs = searchParams.get('actifs') !== 'false'

    // Build query
    let query = supabase.from('employes').select('*').order('nom')

    if (societe_id) {
      // Filter by specific société
      query = query.eq('societe_id', societe_id)
    } else {
      // Use shared access control that handles all roles (admin, client_admin, comptable, rh, etc.)
      const accessibleIds = await getUserSocieteIds(user.id)
      if (accessibleIds.length > 0) {
        query = query.in('societe_id', accessibleIds)
      }
    }
    // Filter by departure status
    const statut = searchParams.get('statut')
    if (statut === 'presents') {
      query = query.is('date_depart', null)
    } else if (statut === 'sortis') {
      query = query.not('date_depart', 'is', null)
    }
    // Legacy: if actifs param is used (backwards compat)
    else if (actifs) {
      // Don't filter — show all by default for backwards compat
    }

    if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,poste.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ employes: data, total: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()

    const body = await request.json()
    if (!body.societe_id || !body.nom || !body.prenom || !body.salaire_base)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    // Générer code employé
    const { count } = await supabase.from('employes').select('*', { count: 'exact', head: true }).eq('societe_id', body.societe_id)
    body.code = String((count || 0) + 1).padStart(6, '0')

    const { data, error } = await supabase.from('employes').insert(body).select().single()
    if (error) throw error

    // Initialiser soldes congés année en cours
    await supabase.from('soldes_conges').insert({
      employe_id: data.id,
      annee: new Date().getFullYear(),
    })

    return NextResponse.json({ employe: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
