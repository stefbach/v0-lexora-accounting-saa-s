import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { isNylasConfigured } from '@/lib/nylas/client'

/** GET /api/auth/nylas/accounts — boîtes Nylas connectées de l'utilisateur. */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const admin = getAdminClient()
  const { data } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, label, societe_id, active, last_synced_at, last_error')
    .eq('user_id', user.id)
    .eq('provider', 'nylas')
    .order('created_at', { ascending: false })
  return NextResponse.json({ configured: isNylasConfigured(), accounts: data || [] })
}

/** DELETE /api/auth/nylas/accounts?id=... — déconnecte une boîte. */
export async function DELETE(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const admin = getAdminClient()
  await admin.from('user_oauth_accounts').delete().eq('id', id).eq('user_id', user.id).eq('provider', 'nylas')
  return NextResponse.json({ ok: true })
}
