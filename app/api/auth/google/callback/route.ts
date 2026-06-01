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
 *
 * Stratégie d'erreur :
 *  - Toute erreur est redirigée vers /client/settings/google-accounts?google=error&reason=...
 *    pour éviter les 500 muets côté navigateur.
 *  - Les erreurs critiques (CRYPT_KEY manquante, table absente, etc.) sont
 *    explicitées avec un message clair pour l'admin.
 */
function errorRedirect(req: NextRequest, reason: string) {
  const url = new URL('/client/settings/google-accounts', req.url)
  url.searchParams.set('google', 'error')
  url.searchParams.set('reason', reason.slice(0, 300))
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  try {
    const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID
    const client_secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const redirect_uri = process.env.GOOGLE_OAUTH_REDIRECT_URI
    if (!client_id || !client_secret || !redirect_uri) {
      return errorRedirect(req, 'Google OAuth non configuré côté serveur (GOOGLE_OAUTH_* manquant)')
    }

    // Vérif CRYPT_KEY tôt — sans elle, on ne peut pas chiffrer les tokens
    if (!process.env.CRYPT_KEY || process.env.CRYPT_KEY.length !== 64) {
      return errorRedirect(req, 'CRYPT_KEY env manquante ou invalide (attendu 64 hex chars). Configure-la dans Vercel → Settings → Environment Variables.')
    }

    const code = req.nextUrl.searchParams.get('code')
    const stateRaw = req.nextUrl.searchParams.get('state')
    const errorParam = req.nextUrl.searchParams.get('error')

    if (errorParam) {
      return errorRedirect(req, `Refus Google : ${errorParam}`)
    }
    if (!code || !stateRaw) {
      return errorRedirect(req, 'code ou state manquant dans le callback Google')
    }

    let state
    try {
      state = verifyOAuthState(stateRaw)
    } catch (e: any) {
      return errorRedirect(req, `State OAuth invalide : ${e?.message || 'inconnu'}`)
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
      return errorRedirect(req, `Échange token Google échoué : ${txt.slice(0, 200)}`)
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
      return errorRedirect(req, 'Impossible de lire userinfo Google')
    }
    const userinfo = (await uiRes.json()) as { email: string; name?: string }

    const admin = getAdminClient()
    const scopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : []
    const expires_at = new Date(Date.now() + (tokens.expires_in - 30) * 1000).toISOString()

    // Lookup existant + count actif. Si la table n'existe pas → message clair.
    const existRes = await admin
      .from('user_oauth_accounts')
      .select('id, refresh_token_enc, is_default_for_calendar')
      .eq('user_id', state.user_id)
      .eq('provider', 'google')
      .eq('account_email', userinfo.email)
      .maybeSingle()

    if (existRes.error) {
      const msg = existRes.error.message || ''
      if (/user_oauth_accounts.*does not exist|relation .* does not exist/i.test(msg)) {
        return errorRedirect(req, 'Table user_oauth_accounts absente. Exécute la migration supabase/migrations/271_user_oauth_accounts.sql sur Supabase.')
      }
      return errorRedirect(req, `Lecture user_oauth_accounts : ${msg}`)
    }
    const existing = existRes.data

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

    let access_token_enc: string
    try {
      access_token_enc = encryptSecret(tokens.access_token)
    } catch (e: any) {
      return errorRedirect(req, `Chiffrement impossible : ${e?.message || 'CRYPT_KEY invalide'}`)
    }

    const payload: any = {
      user_id: state.user_id,
      societe_id: us?.societe_id || null,
      provider: 'google',
      account_email: userinfo.email,
      scopes,
      access_token_enc,
      expires_at,
      active: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      label: userinfo.name || null,
    }

    if (tokens.refresh_token) {
      try {
        payload.refresh_token_enc = encryptSecret(tokens.refresh_token)
      } catch (e: any) {
        return errorRedirect(req, `Chiffrement refresh_token impossible : ${e?.message || 'CRYPT_KEY invalide'}`)
      }
    } else if (!existing?.refresh_token_enc) {
      return errorRedirect(
        req,
        'Refresh token absent — révoque l\'accès Lexora dans ton compte Google (myaccount.google.com/permissions) puis reconnecte.',
      )
    }
    if (isFirst) payload.is_default_for_calendar = true

    const upRes = existing
      ? await admin.from('user_oauth_accounts').update(payload).eq('id', existing.id)
      : await admin.from('user_oauth_accounts').insert(payload)

    if (upRes.error) {
      return errorRedirect(req, `Sauvegarde compte : ${upRes.error.message}`)
    }

    // ── Enregistre aussi le compte comme adresse email d'envoi (provider gmail_oauth)
    // si le scope Gmail "send" a été accordé. Une seule connexion Google donne ainsi
    // l'agenda ET l'email. Best-effort : on n'échoue pas la connexion agenda si la
    // création du compte email rate (ex: pas de société liée → societe_id NOT NULL).
    const hasGmailSend = scopes.includes('https://www.googleapis.com/auth/gmail.send')
    if (hasGmailSend && us?.societe_id) {
      try {
        const { data: existingEmail } = await admin
          .from('email_accounts')
          .select('id')
          .eq('societe_id', us.societe_id)
          .eq('user_id', state.user_id)
          .eq('provider', 'gmail_oauth')
          .eq('from_email', userinfo.email)
          .maybeSingle()

        // Premier compte email perso de l'user dans cette société → défaut
        const { count: emailCount } = await admin
          .from('email_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('societe_id', us.societe_id)
          .eq('user_id', state.user_id)
          .eq('active', true)

        const emailPayload: any = {
          societe_id: us.societe_id,
          user_id: state.user_id,
          provider: 'gmail_oauth',
          label: userinfo.name ? `Gmail — ${userinfo.name}` : `Gmail — ${userinfo.email}`,
          from_email: userinfo.email,
          from_name: userinfo.name || null,
          active: true,
        }
        if (existingEmail) {
          await admin.from('email_accounts').update(emailPayload).eq('id', existingEmail.id)
        } else {
          if ((emailCount || 0) === 0) emailPayload.is_default_for_user = true
          await admin.from('email_accounts').insert(emailPayload)
        }
      } catch (emailErr: any) {
        // Non bloquant : l'agenda reste connecté, on logge seulement.
        console.error('[google callback] email_accounts gmail_oauth setup:', emailErr?.message || emailErr)
      }
    }

    const return_to = state.return_to || '/client/settings/google-accounts?google=connected'
    const safeReturnTo = return_to.startsWith('/') ? return_to : '/client/settings/google-accounts?google=connected'
    return NextResponse.redirect(new URL(safeReturnTo, req.url))
  } catch (e: any) {
    console.error('[google callback] unhandled:', e)
    return errorRedirect(req, `Erreur interne : ${e?.message || 'unknown'}`)
  }
}
