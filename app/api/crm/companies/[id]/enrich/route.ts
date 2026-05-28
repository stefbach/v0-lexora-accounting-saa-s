// =============================================================================
// POST /api/crm/companies/[id]/enrich
// Lance une analyse Claude (pain points, stratégie, accroches) sur une société.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmPermission } from '@/lib/crm/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { enrichCompany, formatStrategy } from '@/lib/crm/enrichment'
import type { CrmCompany } from '@/lib/crm/types'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmPermission('enrich')
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const admin = getAdminClient()
  const { data: company, error } = await admin
    .from('crm_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  try {
    const result = await enrichCompany(company as CrmCompany)
    const strategy = formatStrategy(result)

    const patch: Record<string, unknown> = {
      enrichment: result,
      strategy,
      enriched_at: new Date().toISOString(),
    }
    if (typeof result.score_qualification === 'number') {
      patch.score = result.score_qualification
    }

    await admin.from('crm_companies').update(patch).eq('id', id)
    await admin.from('crm_activities').insert({
      company_id: id,
      type: 'enrichment_run',
      sujet: 'Enrichissement IA — société',
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
