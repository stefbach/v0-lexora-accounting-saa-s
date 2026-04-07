import { NextResponse } from 'next/server'
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

// GET — List investissements/credits for a société
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('investissements_previsionnel')
      .select('*')
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({
      investissements: (data || []).filter(d => d.type === 'investissement'),
      credits: (data || []).filter(d => d.type === 'credit'),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Create or update an investissement/credit
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { id, societe_id, type, libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes } = body
    console.log('[investissements POST]', { id, type, libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque })

    if (!societe_id || !type || !libelle) {
      return NextResponse.json({ error: 'societe_id, type, libelle requis' }, { status: 400 })
    }

    if (id) {
      // Update
      const { data, error } = await supabase
        .from('investissements_previsionnel')
        .update({ libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ item: data })
    } else {
      // Create
      const { data, error } = await supabase
        .from('investissements_previsionnel')
        .insert({ societe_id, type, libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ item: data }, { status: 201 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — Remove an investissement/credit
export async function DELETE(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { error } = await supabase.from('investissements_previsionnel').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
