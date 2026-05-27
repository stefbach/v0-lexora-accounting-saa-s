// =============================================================================
// GET    /api/crm/companies/[id]
// PATCH  /api/crm/companies/[id]
// DELETE /api/crm/companies/[id]
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

const ALLOWED_FIELDS = new Set([
  'nom', 'brn', 'tan', 'linkedin_url', 'site_web', 'email_principal', 'telephone',
  'activite', 'nic_code', 'industrie', 'taille_effectif', 'ca_estime_mur',
  'annee_creation', 'region', 'ville', 'adresse', 'description',
  'statut', 'score', 'tags', 'notes', 'assigned_to', 'last_contacted_at',
])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const admin = getAdminClient()
  const [companyRes, contactsRes, activitiesRes] = await Promise.all([
    admin.from('crm_companies').select('*').eq('id', id).maybeSingle(),
    admin.from('crm_contacts').select('*').eq('company_id', id).order('decision_maker', { ascending: false }),
    admin.from('crm_activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
  ])

  if (companyRes.error) return NextResponse.json({ error: companyRes.error.message }, { status: 500 })
  if (!companyRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    data: companyRes.data,
    contacts: contactsRes.data ?? [],
    activities: activitiesRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'body invalide' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'aucun champ valide' }, { status: 400 })

  const admin = getAdminClient()

  // Si le statut change, on log une activité
  if (patch.statut) {
    const { data: prev } = await admin.from('crm_companies').select('statut').eq('id', id).maybeSingle()
    if (prev && prev.statut !== patch.statut) {
      await admin.from('crm_activities').insert({
        company_id: id,
        type: 'status_change',
        sujet: `${prev.statut} → ${patch.statut}`,
        created_by: auth.user.id,
      })
    }
  }

  const { data, error } = await admin
    .from('crm_companies')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  // Suppression réservée à admin/super_admin
  if (auth.role === 'commercial') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params

  const admin = getAdminClient()
  const { error } = await admin.from('crm_companies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
