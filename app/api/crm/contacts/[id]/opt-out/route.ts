// =============================================================================
// POST /api/crm/contacts/[id]/opt-out
// Marque un contact comme opt-out (DPA Maurice 2017) + propage au registre.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const raison = body?.raison ?? 'demande explicite'

  const admin = getAdminClient()
  // Le trigger crm_propagate_opt_out se charge d'alimenter crm_opt_outs.
  const { data, error } = await admin
    .from('crm_contacts')
    .update({ opt_out: true, opt_out_reason: raison })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('crm_activities').insert({
    contact_id: id,
    company_id: data.company_id,
    type: 'note',
    sujet: 'Opt-out enregistré',
    contenu: raison,
    created_by: auth.user.id,
  })

  return NextResponse.json({ data })
}
