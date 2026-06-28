/**
 * POST /api/rh/declarations-mra/calculer — sprint G13.
 * Aperçu depuis les bulletins (sans sauvegarder). Auth admin + rh.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { agregerDeclarationsMraMois, firstDayOfMonth } from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return apiError('hr_admin_only', 403)
    }

    const body = await request.json().catch(() => ({}))
    const societeId = String(body.societe_id || '').trim()
    const periode = String(body.periode || '').trim()
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!periode) return NextResponse.json({ error: 'periode (YYYY-MM-DD) requise' }, { status: 400 })

    const recap = await agregerDeclarationsMraMois(supabase, societeId, firstDayOfMonth(periode))
    return NextResponse.json({ recap })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
