import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// GET — List all dossiers with joined data
export async function GET() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()

    // Simple select without FK joins
    const { data: dossiers, error } = await supabase
      .from('dossiers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with client, comptable, and société names
    const userIds = [...new Set((dossiers || []).flatMap(d => [d.client_id, d.comptable_id]).filter(Boolean))]
    const societeIds = [...new Set((dossiers || []).map(d => d.societe_id).filter(Boolean))]

    let profileMap: Record<string, any> = {}
    let societeMap: Record<string, any> = {}

    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })
    }
    if (societeIds.length > 0) {
      const { data: societes } = await supabase.from('societes').select('id, nom').in('id', societeIds)
      ;(societes || []).forEach(s => { societeMap[s.id] = s })
    }

    const enriched = (dossiers || []).map(d => ({
      ...d,
      client: d.client_id ? profileMap[d.client_id] || null : null,
      comptable: d.comptable_id ? profileMap[d.comptable_id] || null : null,
      societe: d.societe_id ? societeMap[d.societe_id] || null : null,
    }))

    return NextResponse.json({ dossiers: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// POST — Create a dossier (link client ↔ société ↔ comptable)
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { client_id, societe_id, comptable_id } = await request.json()

    if (!client_id || !societe_id) {
      return NextResponse.json({ error: 'client_id et societe_id sont requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Check if dossier already exists
    const { data: existing } = await supabase
      .from('dossiers')
      .select('id')
      .eq('client_id', client_id)
      .eq('societe_id', societe_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Ce client est déjà lié à cette société' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('dossiers')
      .insert({ client_id, societe_id, comptable_id: comptable_id || null })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossier: data })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
