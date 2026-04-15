import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

// Sécurité Sprint 1 — rôles autorisés à lire/modifier les règles WRA.
// Doit matcher le layout app/rh/planning/regles/layout.tsx.
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
  'direction',
]

async function getUserRole(userId: string): Promise<string> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return data?.role || ''
}

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

    // Sprint 1 — role gate API
    const role = await getUserRole(user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Sprint 1 — vérifie que l'utilisateur a réellement accès à cette société
    if (!(await userHasAccessToSociete(user.id, societe_id))) {
      return NextResponse.json({ error: 'Forbidden — société hors périmètre' }, { status: 403 })
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

    // Sprint 1 — role gate API
    const role = await getUserRole(user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { societe_id, regles } = body

    if (!societe_id || !regles) {
      return NextResponse.json({ error: 'societe_id et regles requis' }, { status: 400 })
    }

    // Sprint 1 — vérifie que l'utilisateur a réellement accès à cette société
    if (!(await userHasAccessToSociete(user.id, societe_id))) {
      return NextResponse.json({ error: 'Forbidden — société hors périmètre' }, { status: 403 })
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
