// =============================================================================
// GET  /api/crm/contacts  — liste paginée
// POST /api/crm/contacts  — créer un contact
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const url = new URL(req.url)
  const companyId = url.searchParams.get('company_id') ?? undefined
  const statut = url.searchParams.get('statut') ?? undefined
  const decisionMaker = url.searchParams.get('decision_maker')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const includeOptOut = url.searchParams.get('include_opt_out') === '1'

  const admin = getAdminClient()
  let q = admin
    .from('crm_contacts')
    .select('*, crm_companies(id,nom,industrie)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (companyId) q = q.eq('company_id', companyId)
  if (statut) q = q.eq('statut', statut)
  if (decisionMaker === '1') q = q.eq('decision_maker', true)
  if (!includeOptOut) q = q.eq('opt_out', false)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body invalide' }, { status: 400 })
  if (!body.prenom && !body.nom && !body.email && !body.linkedin_url) {
    return NextResponse.json({ error: 'au moins un identifiant requis (prenom+nom OU email OU linkedin_url)' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('crm_contacts')
    .insert({
      company_id: body.company_id ?? null,
      prenom: body.prenom ?? null,
      nom: body.nom ?? null,
      titre: body.titre ?? null,
      seniorite: body.seniorite ?? null,
      decision_maker: Boolean(body.decision_maker),
      linkedin_url: body.linkedin_url ?? null,
      email: body.email ?? null,
      email_verified: Boolean(body.email_verified),
      telephone: body.telephone ?? null,
      whatsapp: body.whatsapp ?? null,
      langue_preferee: body.langue_preferee ?? 'fr',
      canal_prefere: body.canal_prefere ?? null,
      source: body.source ?? 'manuel',
      tags: body.tags ?? [],
      notes: body.notes ?? null,
      assigned_to: body.assigned_to ?? auth.user.id,
      created_by: auth.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
