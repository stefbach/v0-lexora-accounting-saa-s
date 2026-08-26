/**
 * /api/client/pos/tables
 * GET  : plan de salle — tables avec leur addition ouverte (le cas échéant).
 * POST : crée une table.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { validateTablePayload } from '@/lib/pos/restaurant'

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

    const { data: tables } = await supabase
      .from('tables_restaurant').select('*').eq('societe_id', societe_id).eq('actif', true).order('code')

    // Additions ouvertes → rattachées à leur table.
    const { data: additions } = await supabase
      .from('additions')
      .select('id, table_id, numero, couverts, opened_at, additions_lignes(quantite, prix_unitaire_ht, remise_pct, taux_tva)')
      .eq('societe_id', societe_id).eq('statut', 'ouverte')

    const byTable = new Map<string, any>()
    for (const a of additions || []) {
      const lignes = a.additions_lignes || []
      const ttc = lignes.reduce((s: number, l: any) => {
        const ht = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * (1 - (Number(l.remise_pct) || 0) / 100)
        return s + ht * (1 + (Number(l.taux_tva) || 0) / 100)
      }, 0)
      if (a.table_id) byTable.set(a.table_id, { id: a.id, numero: a.numero, couverts: a.couverts, opened_at: a.opened_at, nb_articles: lignes.length, total_ttc: Math.round(ttc * 100) / 100 })
    }

    const items = (tables || []).map((t) => ({ ...t, addition: byTable.get(t.id) || null }))
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

    const valid = validateTablePayload(body)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    const { data, error } = await supabase
      .from('tables_restaurant')
      .insert({ ...valid.data, societe_id, depot_id: body.depot_id || null })
      .select('*').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Code table déjà utilisé (${valid.data.code})` }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
