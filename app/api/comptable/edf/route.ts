import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAllowedRole() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) return null
  return user
}

export async function GET(request: Request) {
  try {
    const user = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const { data, error } = await supabase
      .from('declarations_edf')
      .select('*')
      .eq('societe_id', societe_id)
      .order('exercice', { ascending: false })

    if (error) throw error

    return NextResponse.json({ declarations: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await request.json()

    const { data, error } = await supabase
      .from('declarations_edf')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ declaration: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
