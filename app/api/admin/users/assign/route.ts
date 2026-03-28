import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin credentials')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// POST — Assign a client to a comptable
export async function POST(request: NextRequest) {
  try {
    const { client_id, comptable_id } = await request.json()

    if (!client_id) {
      return NextResponse.json({ error: 'client_id est requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { error } = await supabase
      .from('profiles')
      .update({ comptable_id: comptable_id || null })
      .eq('id', client_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
