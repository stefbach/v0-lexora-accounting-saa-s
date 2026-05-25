import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/crypto/symmetric'

/**
 * POST /api/google-accounts/disconnect { id }
 *
 * Révoque côté Google + supprime de la DB.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: row } = await admin
    .from('user_oauth_accounts').select('id, refresh_token_enc, access_token_enc')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'compte introuvable' }, { status: 404 })

  // Best-effort revoke côté Google
  try {
    const tok = row.refresh_token_enc
      ? decryptSecret(row.refresh_token_enc)
      : row.access_token_enc ? decryptSecret(row.access_token_enc) : null
    if (tok) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }).catch(() => null)
    }
  } catch { /* noop */ }

  const { error } = await admin.from('user_oauth_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
