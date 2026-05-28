// =============================================================================
// GET  /api/crm/activities  — liste filtrée (contact_id OU company_id)
// POST /api/crm/activities  — créer (note, email, appel, etc.)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = new Set([
  'note', 'email_sent', 'email_received', 'call_outbound', 'call_inbound',
  'meeting', 'linkedin_dm', 'whatsapp_msg', 'outreach_trigger',
])

export async function GET(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const url = new URL(req.url)
  const contactId = url.searchParams.get('contact_id') ?? undefined
  const companyId = url.searchParams.get('company_id') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  const admin = getAdminClient()
  let q = admin
    .from('crm_activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (contactId) q = q.eq('contact_id', contactId)
  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body invalide' }, { status: 400 })
  if (!body.type || !ALLOWED_TYPES.has(body.type)) {
    return NextResponse.json({ error: 'type invalide' }, { status: 400 })
  }
  if (!body.contact_id && !body.company_id) {
    return NextResponse.json({ error: 'contact_id ou company_id requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('crm_activities')
    .insert({
      contact_id: body.contact_id ?? null,
      company_id: body.company_id ?? null,
      type: body.type,
      direction: body.direction ?? null,
      sujet: body.sujet ?? null,
      contenu: body.contenu ?? null,
      metadata: body.metadata ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mettre à jour last_contacted_at si pertinent
  const contactTypes = ['email_sent', 'call_outbound', 'linkedin_dm', 'whatsapp_msg', 'meeting']
  if (contactTypes.includes(body.type)) {
    const nowIso = new Date().toISOString()
    if (body.contact_id) {
      await admin.from('crm_contacts').update({ last_contacted_at: nowIso }).eq('id', body.contact_id)
    }
    if (body.company_id) {
      await admin.from('crm_companies').update({ last_contacted_at: nowIso }).eq('id', body.company_id)
    }
  }

  return NextResponse.json({ data })
}
