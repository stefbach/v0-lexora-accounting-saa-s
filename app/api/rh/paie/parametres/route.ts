import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PARAMS_MRA_DEFAUT } from '@/lib/rh/paie'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data } = await supabase.from('parametres_paie_mra').select('*').order('annee', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ params: data || PARAMS_MRA_DEFAUT })
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
    const annee = new Date().getFullYear()

    const { data, error } = await supabase.from('parametres_paie_mra').upsert({
      annee,
      ...body,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'annee' }).select().single()

    if (error) throw error
    return NextResponse.json({ params: data, message: 'Paramètres sauvegardés' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
