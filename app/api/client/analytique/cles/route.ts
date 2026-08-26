/**
 * /api/client/analytique/cles
 *
 * GET  : liste des clés de répartition (avec lignes pondérées + % normalisés).
 * POST : crée une clé + ses lignes.
 *
 * Tenant isolation : assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateClePayload, normalizeWeights } from '@/lib/analytique/cles'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: cles } = await supabase
      .from('cles_repartition')
      .select('*, cles_repartition_lignes(id, section_analytique_id, poids)')
      .eq('societe_id', societe_id)
      .order('code')

    const items = (cles || []).map((c: any) => {
      const lignes = (c.cles_repartition_lignes || []).map((l: any) => ({ section_analytique_id: l.section_analytique_id, poids: Number(l.poids) || 0 }))
      return { ...c, lignes: normalizeWeights(lignes) }
    })
    return NextResponse.json({ items })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    const valid = validateClePayload(body)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    const { data: cle, error } = await supabase
      .from('cles_repartition')
      .insert({ societe_id, code: valid.data.code, libelle: valid.data.libelle, base: valid.data.base, created_by: user.id })
      .select('id').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Code déjà utilisé (${valid.data.code})` }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = valid.data.lignes.map((l) => ({
      societe_id, cle_id: cle.id, section_analytique_id: l.section_analytique_id, poids: l.poids,
    }))
    const { error: lErr } = await supabase.from('cles_repartition_lignes').insert(rows)
    if (lErr) {
      await supabase.from('cles_repartition').delete().eq('id', cle.id)
      return NextResponse.json({ error: lErr.message }, { status: 500 })
    }
    return NextResponse.json({ id: cle.id }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
