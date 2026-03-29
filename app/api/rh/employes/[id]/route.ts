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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
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
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()

    // Remove fields that shouldn't be updated directly
    delete body.id
    delete body.created_at
    delete body.actif

    const { data, error } = await supabase
      .from('employes')
      .update(body)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ employe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
