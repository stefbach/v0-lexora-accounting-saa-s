import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const [emp, bulletins, conges, soldes, pointages] = await Promise.all([
      supabase.from('employes').select('*').eq('id', id).single(),
      supabase.from('bulletins_paie').select('*').eq('employe_id', id).order('periode', { ascending: false }).limit(12),
      supabase.from('demandes_conges').select('*').eq('employe_id', id).order('date_debut', { ascending: false }).limit(20),
      supabase.from('soldes_conges').select('*').eq('employe_id', id).order('annee', { ascending: false }).limit(3),
      supabase.from('pointages').select('*').eq('employe_id', id).order('date_pointage', { ascending: false }).limit(31),
    ])

    return NextResponse.json({ employe: emp.data, bulletins: bulletins.data, conges: conges.data, soldes: soldes.data, pointages: pointages.data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const body = await request.json()
    const { data, error } = await supabase.from('employes').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ employe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
