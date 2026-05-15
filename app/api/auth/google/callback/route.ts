import { NextRequest, NextResponse } from 'next/server'
import { verifyOAuthState } from '@/lib/google/oauth-state'
import { getAdminClient } from '@/lib/supabase/admin'
import { encryptSecret } from '@/lib/crypto/symmetric'

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Échange le code OAuth contre access_token + refresh_token, récupère l'email
 * du compte via userinfo, puis upsert dans user_oauth_accounts.
 *
 * Le state JWT-like contient le user_id Lexora et le return_to.
 */
export async function GET(req: NextRequest) {
  const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const client_secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirect_uri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!client_id || !client_secret || !redirect_uri) {
    return NextResponse.json({ error: 'Google OAuth non configuré côté serveur' }, { status: 503 })
  }

  const code = req.nextUrl.searchParams.get('code')
  const stateRaw = req.nextUrl.searchParams.get('state')
  const errorParam = req.nextUrl.searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/client/settings/google-accounts?google=error&reason=${encodeURIComponent(errorParam)}`, req.url),
    )
  }
  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'code ou state manquant' }, { status: 400 })
  }

  let state
  try {
    state = verifyOAuthState(stateRaw)
  } catch (e: any) {
    return NextResponse.json({ error: `State invalide : ${e?.message || 'unknown'}` }, { status: 400 })
  }

  // Échange code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '')
    return NextResponse.json({ error: `Échange token échoué : ${txt.slice(0, 300)}` }, { status: 502 })
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
    id_token?: string
  }

  // Récupère l'email du compte connecté
  const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!uiRes.ok) {
    return NextResponse.json({ error: 'Impossible de lire userinfo Google' }, { status: 502 })
  }
  const userinfo = (await uiRes.json()) as { email: string; name?: string }

  const admin = getAdminClient()
  const scopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : []
  const expires_at = new Date(Date.now() + (tokens.expires_in - 30) * 1000).toISOString()

  // S'il existe déjà un compte (user_id, provider, email), on update.
  // S'il n'y a aucun compte Google actif chez cet user → on le marque default.
  const { data: existing } = await admin
    .from('user_oauth_accounts')
    .select('id, refresh_token_enc, is_default_for_calendar')
    .eq('user_id', state.user_id)
    .eq('provider', 'google')
    .eq('account_email', userinfo.email)
    .maybeSingle()

  const { count: countActive } = await admin
    .from('user_oauth_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', state.user_id)
    .eq('provider', 'google')
    .eq('active', true)

  const isFirst = (countActive || 0) === 0

  // Récupère la société active de l'user (best-effort)
  const { data: us } = await admin
    .from('user_societes')
    .select('societe_id')
    .eq('user_id', state.user_id)
    .limit(1)
    .maybeSingle()

  const payload: any = {
    user_id: state.user_id,
    societe_id: us?.societe_id || null,
    provider: 'google',
    account_email: userinfo.email,
    scopes,
    access_token_enc: encryptSecret(tokens.access_token),
    expires_at,
    active: true,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    label: userinfo.name || null,
  }
  // Refresh token : Google ne le renvoie qu'au premier consent.
  // On garde l'ancien si pas renvoyé.
  if (tokens.refresh_token) {
    payload.refresh_token_enc = encryptSecret(tokens.refresh_token)
  } else if (!existing?.refresh_token_enc) {
    return NextResponse.redirect(
      new URL(
        '/client/settings/google-accounts?google=error&reason=' +
          encodeURIComponent('Refresh token absent — révoque l\'accès dans ton compte Google puis reconnecte'),
        req.url,
      ),
    )
  }
  if (isFirst) payload.is_default_for_calendar = true

  if (existing) {
    await admin.from('user_oauth_accounts').update(payload).eq('id', existing.id)
  } else {
    await admin.from('user_oauth_accounts').insert(payload)
  }

  const return_to = state.return_to || '/client/settings/google-accounts?google=connected'
  // Empêche redirect arbitraire : doit commencer par "/"
  const safeReturnTo = return_to.startsWith('/') ? return_to : '/client/settings/google-accounts?google=connected'
  return NextResponse.redirect(new URL(safeReturnTo, req.url))
}
