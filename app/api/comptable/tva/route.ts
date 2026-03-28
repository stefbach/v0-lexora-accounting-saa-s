import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode    = searchParams.get('periode')
    const annee      = searchParams.get('annee') // ex: 2024

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let query = supabase
      .from('tva_mensuelle')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })

    if (periode) query = query.eq('periode', periode)
    if (annee)   query = query.like('periode', `${annee}-%`)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({
      records: data || [],
      nb: data?.length || 0,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data, error } = await supabase
      .from('tva_mensuelle')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, record: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
