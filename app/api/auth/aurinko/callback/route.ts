import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyOAuthState } from '@/lib/google/oauth-state'
import { encryptSecret } from '@/lib/crypto/symmetric'
import { exchangeAurinkoCode, getAurinkoAccount } from '@/lib/aurinko/client'

/**
 * GET /api/auth/aurinko/callback?code=...&state=...
 * Aurinko redirige ici après autorisation. On échange le code contre un
 * accessToken de compte, on récupère l'email connecté, et on enregistre le
 * compte (chiffré) dans user_oauth_accounts (provider='aurinko').
 */
function errorRedirect(req: NextRequest, message: string) {
  const url = new URL('/client/settings/email-accounts', req.nextUrl.origin)
  url.searchParams.set('aurinko_error', message.slice(0, 200))
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const code = sp.get('code')
  const stateRaw = sp.get('state')
  if (!code || !stateRaw) return errorRedirect(req, 'code ou state manquant')

  let state
  try {
    state = verifyOAuthState(stateRaw)
  } catch {
    return errorRedirect(req, 'state invalide ou expiré')
  }

  let meta: { s?: string; r?: string; t?: string } = {}
  try { meta = JSON.parse(state.return_to || '{}') } catch { /* noop */ }
  const societeId = meta.s || null
  const returnTo = meta.r || '/client/settings/email-accounts'

  try {
    const { accountId, accessToken } = await exchangeAurinkoCode(code)
    const account = await getAurinkoAccount(accessToken)

    const admin = getAdminClient()
    // Upsert : un compte par (user, email, provider=aurinko).
    const { data: existing } = await admin
      .from('user_oauth_accounts')
      .select('id')
      .eq('user_id', state.user_id)
      .eq('provider', 'aurinko')
      .eq('account_email', account.email)
      .maybeSingle()

    const row = {
      user_id: state.user_id,
      societe_id: societeId,
      provider: 'aurinko',
      account_email: account.email,
      label: `${account.serviceType || 'Aurinko'} · ${account.email}${accountId ? ` (#${accountId})` : ''}`,
      scopes: ['Mail.Read', 'Mail.Send', 'Calendar.ReadWrite'],
      access_token_enc: encryptSecret(accessToken),
      active: true,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      await admin.from('user_oauth_accounts').update(row).eq('id', existing.id)
    } else {
      await admin.from('user_oauth_accounts').insert(row)
    }

    const url = new URL(returnTo, req.nextUrl.origin)
    url.searchParams.set('aurinko_connected', account.email || '1')
    return NextResponse.redirect(url)
  } catch (e) {
    return errorRedirect(req, e instanceof Error ? e.message : 'Échec de la connexion Aurinko')
  }
}
