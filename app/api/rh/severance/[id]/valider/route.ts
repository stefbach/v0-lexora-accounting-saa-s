/**
 * PATCH /api/rh/severance/[id]/valider — sprint G12.
 *
 * Passe une simulation au statut 'valide'. Admin UNIQUEMENT (action
 * irrévocable hors re-admin).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { validerSeverance } from '@/lib/rh/severance'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function PATCH(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as { role?: string } | null)?.role || ''
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Validation réservée admin' }, { status: 403 })
    }

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const result = await validerSeverance(supabase, id)
    if (!result.ok) {
      return NextResponse.json({ error: result.erreur || 'validation failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
