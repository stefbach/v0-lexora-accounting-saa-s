import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const classe = searchParams.get('classe')
    const type = searchParams.get('type') // charge|produit|actif|passif
    const q = searchParams.get('q') // recherche texte
    const societe_id = searchParams.get('societe_id')

    let query = supabase
      .from('plan_comptable')
      .select('*')
      .eq('actif', true)
      .order('compte')

    if (classe) query = query.eq('classe', parseInt(classe))
    if (type) query = query.eq('type_compte', type)
    if (q) query = query.or(`compte.ilike.${q}%,libelle.ilike.%${q}%`)
    if (societe_id) query = query.or(`societe_id.eq.${societe_id},societe_id.is.null`)

    const { data, error } = await query
    if (error) throw error

    // Grouper par classe
    const parClasse: Record<number, { comptes: typeof data }> = {}
    for (const c of data || []) {
      const cl = c.classe as number
      if (!parClasse[cl]) parClasse[cl] = { comptes: [] }
      parClasse[cl].comptes.push(c)
    }

    return NextResponse.json({ comptes: data, par_classe: parClasse, total: data?.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { data, error } = await supabase
      .from('plan_comptable')
      .upsert(body, { onConflict: 'compte' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ compte: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
