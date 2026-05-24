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
    const exercice   = searchParams.get('exercice')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let query = supabase
      .from('it_form3')
      .select('*')
      .eq('societe_id', societe_id)
      .order('exercice', { ascending: false })

    if (exercice) query = query.eq('exercice', exercice)

    const { data, error } = await query
    if (error) throw error

    // Si exercice spécifié, retourner un seul record
    if (exercice && data && data.length > 0) {
      return NextResponse.json({ form3: data[0] })
    }

    return NextResponse.json({ form3s: data || [], form3: data?.[0] || null })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, exercice, ...rest } = body

    if (!societe_id || !exercice) {
      return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('it_form3')
      .upsert({ societe_id, exercice, ...rest, updated_at: new Date().toISOString() }, { onConflict: 'societe_id,exercice' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, form3: data })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, societe_id, exercice, ...updates } = body

    if (!societe_id || !exercice) {
      return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('it_form3')
      .upsert({ societe_id, exercice, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'societe_id,exercice' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, form3: data })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
