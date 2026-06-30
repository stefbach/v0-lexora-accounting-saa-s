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

async function debugLog(stage: string, req: NextRequest, note?: string) {
  try {
    await getAdminClient().from('nylas_auth_debug').insert({
      stage,
      inbound_url: req.nextUrl.toString().slice(0, 1000),
      query_keys: Array.from(req.nextUrl.searchParams.keys()).join(','),
      note: note?.slice(0, 500) || null,
    })
  } catch { /* diagnostic best-effort */ }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const code = sp.get('code')
  const stateRaw = sp.get('state')
  await debugLog('callback_hit', req)
  // Diagnostic : si Nylas renvoie une erreur OAuth ou un retour incomplet, on
  // remonte tout ce qui a été reçu pour qu'aucune cause ne reste invisible.
  const nylasErr = sp.get('error') || sp.get('error_description')
  if (nylasErr) return errorRedirect(req, `Nylas a refusé : ${nylasErr}`)
  if (!code || !stateRaw) {
    const keys = Array.from(sp.keys()).join(',') || 'aucun'
    return errorRedirect(req, `Retour incomplet (params reçus : ${keys}). code=${code ? 'oui' : 'NON'} state=${stateRaw ? 'oui' : 'NON'}`)
  }

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
    await debugLog('exchange_ok', req, `email=${email} grant=${grantId ? 'oui' : 'NON'}`)

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
    const { error: dbError } = existing?.id
      ? await admin.from('user_oauth_accounts').update(row).eq('id', existing.id)
      : await admin.from('user_oauth_accounts').insert(row)
    if (dbError) return errorRedirect(req, `Enregistrement échoué : ${dbError.message}`)

    const url = new URL(returnTo, req.nextUrl.origin)
    url.searchParams.set('nylas_connected', email || '1')
    return NextResponse.redirect(url)
  } catch (e) {
    await debugLog('exchange_error', req, e instanceof Error ? e.message : 'unknown')
    return errorRedirect(req, e instanceof Error ? e.message : 'Échec de la connexion Nylas')
  }
}
