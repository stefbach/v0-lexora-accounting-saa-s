import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/planning/regles?societe_id=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Try to read regles_planning from societes table
    const { data, error } = await supabase
      .from('societes')
      .select('regles_planning')
      .eq('id', societe_id)
      .single()

    if (error) {
      // Column might not exist yet - return empty
      console.warn('regles_planning column may not exist:', error.message)
      return NextResponse.json({ regles: null })
    }

    return NextResponse.json({ regles: data?.regles_planning || null })
  } catch (e: any) {
    console.error('GET /api/rh/planning/regles error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/rh/planning/regles
// Body: { societe_id, regles: [...] }
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { societe_id, regles } = body

    if (!societe_id || !regles) {
      return NextResponse.json({ error: 'societe_id et regles requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Try to update regles_planning JSONB column on societes
    const { error } = await supabase
      .from('societes')
      .update({ regles_planning: regles })
      .eq('id', societe_id)

    if (error) {
      // If column doesn't exist, log and still return success (localStorage is the fallback)
      console.warn('Could not save regles_planning to DB:', error.message)
      return NextResponse.json({ success: true, fallback: true, message: 'Saved to localStorage only. DB column regles_planning may need to be added.' })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('POST /api/rh/planning/regles error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
