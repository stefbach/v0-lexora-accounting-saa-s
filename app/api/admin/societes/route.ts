import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — List all sociétés
export async function GET() {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('societes')
      .select('*, comptable:profiles!societes_comptable_id_fkey(id, full_name, email)')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ societes: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// POST — Create a société
export async function POST(request: NextRequest) {
  try {
    const { nom, brn, numero_tva_mra, statut_tva, comptable_id } = await request.json()

    if (!nom) {
      return NextResponse.json({ error: 'Le nom de la société est requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('societes')
      .insert({
        nom,
        brn: brn || null,
        numero_tva_mra: numero_tva_mra || null,
        statut_tva: statut_tva || false,
        comptable_id: comptable_id || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
