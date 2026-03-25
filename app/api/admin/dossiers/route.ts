import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — List all dossiers with joined data
export async function GET() {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('dossiers')
      .select('*, client:profiles!dossiers_client_id_fkey(id, full_name, email), comptable:profiles!dossiers_comptable_id_fkey(id, full_name, email), societe:societes(id, nom)')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossiers: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// POST — Create a dossier (link client ↔ société ↔ comptable)
export async function POST(request: NextRequest) {
  try {
    const { client_id, societe_id, comptable_id } = await request.json()

    if (!client_id || !societe_id || !comptable_id) {
      return NextResponse.json({ error: 'client_id, societe_id et comptable_id sont requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Check if dossier already exists
    const { data: existing } = await supabase
      .from('dossiers')
      .select('id')
      .eq('client_id', client_id)
      .eq('societe_id', societe_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Ce client est déjà lié à cette société' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('dossiers')
      .insert({ client_id, societe_id, comptable_id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dossier: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
