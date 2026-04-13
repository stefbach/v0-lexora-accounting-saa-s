import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

export async function GET() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('vue_comptable_portefeuille')
      .select('*')
      .order('comptable_nom')

    if (error) throw error
    return NextResponse.json({ assignations: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { comptable_id, societe_id, type_acces = 'comptable', notes } = await request.json()
    if (!comptable_id || !societe_id) return NextResponse.json({ error: 'comptable_id et societe_id requis' }, { status: 400 })

    const { data, error } = await supabase
      .from('comptable_societes')
      .upsert({
        comptable_id,
        societe_id,
        type_acces,
        notes,
        assigne_par: adminUser.id,
        actif: true,
        date_assignation: new Date().toISOString()
      }, { onConflict: 'comptable_id,societe_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ assignation: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { comptable_id, societe_id } = await request.json()

    const { error } = await supabase
      .from('comptable_societes')
      .update({ actif: false })
      .eq('comptable_id', comptable_id)
      .eq('societe_id', societe_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
