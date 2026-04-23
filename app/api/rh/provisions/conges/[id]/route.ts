/**
 * DELETE /api/rh/provisions/conges/[id] — sprint G8 Phase 1.
 * Soft delete : statut='annule'. Admin uniquement.
 * Ne supprime PAS les écritures comptables (traçabilité).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { annulerSnapshot } from '@/lib/rh/ias19-provisions'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Annulation réservée admin' }, { status: 403 })
    }

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const result = await annulerSnapshot(supabase, id)
    if (!result.ok) return NextResponse.json({ error: result.erreur }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
