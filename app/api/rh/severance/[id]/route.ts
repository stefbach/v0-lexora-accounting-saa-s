/**
 * GET /api/rh/severance/[id] — détail d'une simulation.
 * DELETE /api/rh/severance/[id] — soft delete (statut='annule'). Admin seul.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { annulerSimulation, getSimulation } from '@/lib/rh/severance'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
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
    if (!['admin', 'rh'].includes(role)) {
      return apiError('hr_admin_only', 403)
    }

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const sim = await getSimulation(supabase, String(params.id || ''))
    if (!sim) return NextResponse.json({ error: 'Simulation introuvable' }, { status: 404 })
    return NextResponse.json({ simulation: sim })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(
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
      return apiError('cancel_admin_only', 403)
    }

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const result = await annulerSimulation(supabase, String(params.id || ''))
    if (!result.ok) return NextResponse.json({ error: result.erreur }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
