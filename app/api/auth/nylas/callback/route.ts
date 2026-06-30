import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyOAuthState } from '@/lib/google/oauth-state'
import { encryptSecret } from '@/lib/crypto/symmetric'
import { exchangeNylasCode } from '@/lib/nylas/client'

/**
 * GET /api/auth/nylas/callback?code=...&state=...
 * Échange le code contre un grant Nylas et enregistre le compte (grant_id
 * chiffré) dans user_oauth_accounts (provider='nylas').
 */
function errorRedirect(req: NextRequest, message: string) {
  const url = new URL('/client/email-accounts', req.nextUrl.origin)
  url.searchParams.set('nylas_error', message.slice(0, 200))
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const code = sp.get('code')
  const stateRaw = sp.get('state')
  if (!code || !stateRaw) return errorRedirect(req, 'code ou state manquant')

  let state
  try { state = verifyOAuthState(stateRaw) } catch { return errorRedirect(req, 'state invalide ou expiré') }

  let meta: { s?: string; r?: string } = {}
  try { meta = JSON.parse(state.return_to || '{}') } catch { /* noop */ }
  const societeId = meta.s || null
  const returnTo = meta.r || '/client/email-accounts'

  try {
    const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
    const redirectUri = `${base}/api/auth/nylas/callback`
    const { grantId, email } = await exchangeNylasCode(code, redirectUri)

    const admin = getAdminClient()
    const { data: existing } = await admin
      .from('user_oauth_accounts')
      .select('id')
      .eq('user_id', state.user_id)
      .eq('provider', 'nylas')
      .eq('account_email', email)
      .maybeSingle()

    const row = {
      user_id: state.user_id,
      societe_id: societeId,
      provider: 'nylas',
      account_email: email,
      label: `Nylas · ${email}`,
      scopes: ['email.send', 'email.read', 'calendar'],
      access_token_enc: encryptSecret(grantId), // grant_id (clé d'accès au compte)
      active: true,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (existing?.id) await admin.from('user_oauth_accounts').update(row).eq('id', existing.id)
    else await admin.from('user_oauth_accounts').insert(row)

    const url = new URL(returnTo, req.nextUrl.origin)
    url.searchParams.set('nylas_connected', email || '1')
    return NextResponse.redirect(url)
  } catch (e) {
    return errorRedirect(req, e instanceof Error ? e.message : 'Échec de la connexion Nylas')
  }
}
