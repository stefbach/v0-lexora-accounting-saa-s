import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

/** GET /api/client/societes/company-data?societe_id= — dirigeants, actionnaires, financiers. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const admin = getAdminClient()
  try { await assertSocieteAccess(admin, user.id, societeId) }
  catch { return NextResponse.json({ error: 'Accès société refusé' }, { status: 403 }) }

  const [officers, shareholders, financials] = await Promise.all([
    admin.from('societe_officers').select('id, role, nom, adresse, nationalite, fonction, appointed_at').eq('societe_id', societeId).order('role'),
    admin.from('societe_shareholders').select('id, nom, type, shares, percentage, currency').eq('societe_id', societeId),
    admin.from('societe_financials').select('*').eq('societe_id', societeId).order('year', { ascending: false }),
  ])
  return NextResponse.json({
    officers: officers.data || [],
    shareholders: shareholders.data || [],
    financials: financials.data || [],
  })
}

/** DELETE /api/client/societes/company-data?type=officer|shareholder|financial&id= */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const type = req.nextUrl.searchParams.get('type')
  const id = req.nextUrl.searchParams.get('id')
  const table = type === 'officer' ? 'societe_officers' : type === 'shareholder' ? 'societe_shareholders' : type === 'financial' ? 'societe_financials' : null
  if (!table || !id) return NextResponse.json({ error: 'type et id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: row } = await admin.from(table).select('societe_id').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ ok: true })
  try { await assertSocieteAccess(admin, user.id, (row as any).societe_id) }
  catch { return NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
  await admin.from(table).delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
