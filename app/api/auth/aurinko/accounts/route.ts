import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { isAurinkoConfigured } from '@/lib/aurinko/client'

/** GET /api/auth/aurinko/accounts — comptes Aurinko connectés de l'utilisateur. */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = getAdminClient()
  const { data } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, label, societe_id, active, last_synced_at, last_error')
    .eq('user_id', user.id)
    .eq('provider', 'aurinko')
    .order('created_at', { ascending: false })

  return NextResponse.json({ configured: isAurinkoConfigured(), accounts: data || [] })
}

/** DELETE /api/auth/aurinko/accounts?id=... — déconnecte un compte. */
export async function DELETE(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const admin = getAdminClient()
  await admin.from('user_oauth_accounts').delete().eq('id', id).eq('user_id', user.id).eq('provider', 'aurinko')
  return NextResponse.json({ ok: true })
}
