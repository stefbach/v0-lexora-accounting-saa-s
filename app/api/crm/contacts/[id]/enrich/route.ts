// =============================================================================
// POST /api/crm/contacts/[id]/enrich
// Analyse Claude : persona, motivations, objections, accroches.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { enrichContact, formatStrategy } from '@/lib/crm/enrichment'
import type { CrmContact, CrmCompany } from '@/lib/crm/types'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const admin = getAdminClient()
  const { data: contact, error } = await admin
    .from('crm_contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let company: CrmCompany | null = null
  if (contact.company_id) {
    const { data } = await admin.from('crm_companies').select('*').eq('id', contact.company_id).maybeSingle()
    company = (data as CrmCompany | null) ?? null
  }

  try {
    const result = await enrichContact(contact as CrmContact, company)
    const strategy = formatStrategy(result)

    await admin
      .from('crm_contacts')
      .update({
        enrichment: result,
        strategy,
        enriched_at: new Date().toISOString(),
        canal_prefere: result.canal_recommande ?? contact.canal_prefere,
      })
      .eq('id', id)

    await admin.from('crm_activities').insert({
      contact_id: id,
      company_id: contact.company_id,
      type: 'enrichment_run',
      sujet: 'Enrichissement IA — contact',
      metadata: { model: result.model, score: result.score_qualification },
      created_by: auth.user.id,
    })

    return NextResponse.json({ data: { enrichment: result, strategy } })
  } catch (err) {
    return NextResponse.json(
      { error: `enrichment_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}
