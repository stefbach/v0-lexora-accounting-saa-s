/**
 * GET /api/rh/severance?societe_id=xxx&statut=simulation — G12.
 * Liste les simulations d'une société (filtré par statut optionnel).
 * Auth : admin / rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSimulationsSociete, type SeveranceStatut } from '@/lib/rh/severance'

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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const url = new URL(request.url)
    const societeId = url.searchParams.get('societe_id')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const statutRaw = url.searchParams.get('statut')
    const statut: SeveranceStatut | undefined = statutRaw && ['simulation','valide','paye','annule'].includes(statutRaw)
      ? statutRaw as SeveranceStatut
      : undefined

    const simulations = await getSimulationsSociete(supabase, societeId, { statut })
    return NextResponse.json({ simulations, total: simulations.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
