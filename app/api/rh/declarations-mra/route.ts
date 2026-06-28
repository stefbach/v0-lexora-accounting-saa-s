/**
 * GET /api/rh/declarations-mra?societe_id=&annee= — sprint G13.
 * Liste des déclarations PAYE + CSG d'une année pour une société.
 * Auth : admin + rh.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getDeclarationsAnnee } from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')?.trim()
    const anneeRaw = searchParams.get('annee')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const annee = anneeRaw ? Number(anneeRaw) : new Date().getFullYear()

    const declarations = await getDeclarationsAnnee(supabase, societeId, annee)
    return NextResponse.json(declarations)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
