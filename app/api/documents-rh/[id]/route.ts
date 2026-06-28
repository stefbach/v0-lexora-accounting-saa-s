/**
 * PATCH / DELETE /api/documents-rh/[id] — RH/admin uniquement.
 *
 * PATCH body (tous optionnels) :
 *   { vu: true }            -> marque vu_par_destinataire_le = NOW
 *   { archive: true|false } -> archive / désarchive
 *   { description: "..." }  -> update description
 *   { confidentiel_rh_only: true|false } -> bascule visibilité employé
 *
 * DELETE : hard delete (remove Storage + DELETE row).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getDocument, supprimerDocument } from '@/lib/rh/documents-rh'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireRH(userId: string, supabase: ReturnType<typeof getAdminClient>) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  const role = (data as { role?: string } | null)?.role || ''
  return ['admin', 'rh'].includes(role) ? role : null
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const role = await requireRH(user.id, supabase)
    if (!role) return NextResponse.json({ error: 'RH/admin requis' }, { status: 403 })

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const id = String(params.id || '')
    const body = await request.json().catch(() => ({} as any))

    const updates: Record<string, any> = {}
    if (body.vu === true) updates.vu_par_destinataire_le = new Date().toISOString()
    if (typeof body.archive === 'boolean') updates.archive = body.archive
    if (typeof body.description === 'string') updates.description = body.description
    if (typeof body.confidentiel_rh_only === 'boolean') {
      updates.confidentiel_rh_only = body.confidentiel_rh_only
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ modifiable fourni' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('documents_rh')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Erreur update' }, { status: 500 })
    }
    return NextResponse.json({ success: true, document: data })
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
    const role = await requireRH(user.id, supabase)
    if (!role) return NextResponse.json({ error: 'RH/admin requis' }, { status: 403 })

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const doc = await getDocument(supabase, id)
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    const result = await supprimerDocument(supabase, id)
    if (!result.ok) return NextResponse.json({ error: result.erreur }, { status: 500 })
    return NextResponse.json({ success: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
