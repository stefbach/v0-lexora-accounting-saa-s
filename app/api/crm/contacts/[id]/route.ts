// =============================================================================
// GET    /api/crm/contacts/[id]
// PATCH  /api/crm/contacts/[id]
// DELETE /api/crm/contacts/[id]
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { requireCrmPermission } from '@/lib/crm/permissions'
import { getAdminClient } from '@/lib/supabase/admin'

const ALLOWED_FIELDS = new Set([
  'company_id', 'prenom', 'nom', 'titre', 'seniorite', 'decision_maker',
  'linkedin_url', 'email', 'email_verified', 'telephone', 'whatsapp',
  'langue_preferee', 'canal_prefere',
  'statut', 'tags', 'notes', 'assigned_to', 'last_contacted_at',
])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const admin = getAdminClient()
  const [contactRes, activitiesRes] = await Promise.all([
    admin.from('crm_contacts').select('*, crm_companies(*)').eq('id', id).maybeSingle(),
    admin.from('crm_activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(100),
  ])

  if (contactRes.error) return NextResponse.json({ error: contactRes.error.message }, { status: 500 })
  if (!contactRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    data: contactRes.data,
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

  if (patch.statut) {
    const { data: prev } = await admin.from('crm_contacts').select('statut').eq('id', id).maybeSingle()
    if (prev && prev.statut !== patch.statut) {
      await admin.from('crm_activities').insert({
        contact_id: id,
        type: 'status_change',
        sujet: `${prev.statut} → ${patch.statut}`,
        created_by: auth.user.id,
      })
    }
  }

  const { data, error } = await admin
    .from('crm_contacts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmPermission('delete')
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const admin = getAdminClient()
  const { error } = await admin.from('crm_contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
