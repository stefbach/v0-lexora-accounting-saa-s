// =============================================================================
// GET  /api/crm/companies  — liste paginée filtrée
// POST /api/crm/companies  — créer une société (manuel)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const statut = url.searchParams.get('statut') ?? undefined
  const source = url.searchParams.get('source') ?? undefined
  const assignedTo = url.searchParams.get('assigned_to') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const admin = getAdminClient()
  let query = admin
    .from('crm_companies')
    .select('*, crm_contacts(count)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) query = query.or(`nom.ilike.%${q}%,activite.ilike.%${q}%,brn.eq.${q}`)
  if (statut) query = query.eq('statut', statut)
  if (source) query = query.eq('source', source)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body?.nom) return NextResponse.json({ error: 'nom requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('crm_companies')
    .insert({
      nom: String(body.nom).trim(),
      brn: body.brn ?? null,
      tan: body.tan ?? null,
      linkedin_url: body.linkedin_url ?? null,
      site_web: body.site_web ?? null,
      email_principal: body.email_principal ?? null,
      telephone: body.telephone ?? null,
      activite: body.activite ?? null,
      industrie: body.industrie ?? null,
      taille_effectif: body.taille_effectif ?? null,
      region: body.region ?? null,
      ville: body.ville ?? null,
      adresse: body.adresse ?? null,
      description: body.description ?? null,
      source: body.source ?? 'manuel',
      tags: body.tags ?? [],
      notes: body.notes ?? null,
      assigned_to: body.assigned_to ?? auth.user.id,
      created_by: auth.user.id,
      pays: 'Mauritius',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
