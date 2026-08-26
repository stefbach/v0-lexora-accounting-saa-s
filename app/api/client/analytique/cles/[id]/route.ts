/**
 * /api/client/analytique/cles/[id]
 * PATCH  : met à jour libellé/base et remplace les lignes pondérées.
 * DELETE : supprime la clé (cascade sur ses lignes).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { CLE_BASES } from '@/lib/analytique/cles'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.libelle === 'string' && body.libelle.trim()) patch.libelle = body.libelle.trim()
    if (typeof body.base === 'string' && CLE_BASES.includes(body.base)) patch.base = body.base
    if (typeof body.actif === 'boolean') patch.actif = body.actif

    const { error } = await supabase.from('cles_repartition').update(patch).eq('id', id).eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Remplacement des lignes si fournies.
    if (Array.isArray(body.lignes)) {
      await supabase.from('cles_repartition_lignes').delete().eq('cle_id', id).eq('societe_id', societe_id)
      const rows = body.lignes
        .map((l: any) => ({ societe_id, cle_id: id, section_analytique_id: String(l?.section_analytique_id || ''), poids: Number(l?.poids) || 0 }))
        .filter((r: any) => r.section_analytique_id && r.poids > 0)
      if (rows.length) {
        const { error: lErr } = await supabase.from('cles_repartition_lignes').insert(rows)
        if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id') || ''
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { error } = await supabase.from('cles_repartition').delete().eq('id', id).eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
