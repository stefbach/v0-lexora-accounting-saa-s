import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/** GET /api/nylas/saved-contacts?account_id=&societe_id= — carnet de la boîte. */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!isNylasConfigured()) return NextResponse.json({ contacts: [] })
  const admin = getAdminClient()
  const acc = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!acc) return NextResponse.json({ contacts: [], account_email: null })

  const { data } = await admin
    .from('nylas_account_contacts')
    .select('id, name, company, email, telephone, mobile, adresse, ville, pays, vat_number, site_web, created_at')
    .eq('account_id', acc.id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ contacts: data || [], account_email: acc.account_email })
}

/** DELETE /api/nylas/saved-contacts?id= — supprime un contact du carnet. */
export async function DELETE(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const admin = getAdminClient()
  await admin.from('nylas_account_contacts').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
