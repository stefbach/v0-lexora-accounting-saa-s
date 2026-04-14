import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/conformite/dirigeants?societe_id=...
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('directors_shareholders')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('active', true)
      .order('nom_complet')

    if (error) {
      if ((error.message || '').includes('does not exist')) {
        return NextResponse.json({ directors: [], migrated: false })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ directors: data || [], migrated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — créer/update/delete un dirigeant
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'create' || !action) {
      const { societe_id, nom_complet, role, nic, date_nomination, parts_sociales, pourcentage_capital, notes } = body
      if (!societe_id || !nom_complet || !role) {
        return NextResponse.json({ error: 'societe_id, nom_complet, role requis' }, { status: 400 })
      }
      const { data, error } = await supabase.from('directors_shareholders').insert({
        societe_id, nom_complet, role, nic, date_nomination,
        parts_sociales, pourcentage_capital, notes,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ director: data })
    }

    if (action === 'update') {
      const { id, ...updates } = body
      const { error } = await supabase.from('directors_shareholders').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const { id } = body
      // Soft delete: marquer inactif (préserver l'historique)
      const { error } = await supabase.from('directors_shareholders').update({ active: false }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
