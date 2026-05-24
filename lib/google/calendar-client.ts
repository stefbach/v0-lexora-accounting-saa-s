/**
 * Helper Google Calendar — refresh auto, fetch typé, robustesse retry-on-401.
 *
 * Tous les tokens sont chiffrés en base AES-256-GCM (lib/crypto/symmetric.ts).
 * En cas d'expiration (< 60s), on rafraîchit via /oauth2/v4/token et on met
 * à jour la ligne user_oauth_accounts.
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { encryptSecret, decryptSecret } from '@/lib/crypto/symmetric'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CAL_BASE = 'https://www.googleapis.com/calendar/v3'

export type OAuthAccountRow = {
  id: string
  user_id: string
  societe_id: string | null
  provider: 'google'
  account_email: string
  scopes: string[]
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: string | null
  is_default_for_calendar: boolean
  active: boolean
  label: string | null
}

/**
 * Récupère le compte Google de l'user :
 *   - si account_email fourni → ce compte précis
 *   - sinon : default_for_calendar puis premier compte actif
 */
export async function getGoogleAccount(
  user_id: string,
  account_email?: string,
): Promise<OAuthAccountRow | null> {
  const admin = getAdminClient()
  let q = admin
    .from('user_oauth_accounts')
    .select('*')
    .eq('user_id', user_id)
    .eq('provider', 'google')
    .eq('active', true)

  if (account_email) {
    q = q.eq('account_email', account_email).limit(1)
  } else {
    q = q.order('is_default_for_calendar', { ascending: false }).order('created_at', { ascending: true }).limit(1)
  }
  const { data } = await q
  return (data?.[0] as OAuthAccountRow) || null
}

/**
 * Retourne un access_token Google valide. Rafraîchit automatiquement si
 * expires_at < now() + 60s.
 */
export async function getGoogleAccessToken(
  user_id: string,
  account_email?: string,
): Promise<{ access_token: string; account: OAuthAccountRow }> {
  const account = await getGoogleAccount(user_id, account_email)
  if (!account) {
    throw new Error(
      account_email
        ? `Aucun compte Google "${account_email}" lié pour cet utilisateur`
        : 'Aucun compte Google lié — connecte-toi d\'abord via /client/settings/google-accounts',
    )
  }

  const now = Date.now()
  const expMs = account.expires_at ? new Date(account.expires_at).getTime() : 0
  const needsRefresh = !account.access_token_enc || expMs - now < 60_000

  if (!needsRefresh && account.access_token_enc) {
    return { access_token: decryptSecret(account.access_token_enc), account }
  }

  // Refresh
  if (!account.refresh_token_enc) {
    throw new Error('Refresh token manquant — reconnecte le compte Google')
  }
  const refresh_token = decryptSecret(account.refresh_token_enc)
  const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const client_secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!client_id || !client_secret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET non configurés')
  }

  const body = new URLSearchParams({
    client_id,
    client_secret,
    refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Refresh Google échoué (${res.status}) : ${txt.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string }
  const access_token = json.access_token
  const newExpires = new Date(Date.now() + (json.expires_in - 30) * 1000).toISOString()

  const admin = getAdminClient()
  await admin
    .from('user_oauth_accounts')
    .update({
      access_token_enc: encryptSecret(access_token),
      expires_at: newExpires,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', account.id)

  return { access_token, account: { ...account, access_token_enc: encryptSecret(access_token), expires_at: newExpires } }
}

/**
 * Wrapper fetch sur l'API Google Calendar v3 avec auth bearer + retry once
 * si on prend un 401 (token invalidé entre temps).
 */
export async function googleCalendarFetch(
  user_id: string,
  account_email: string | undefined,
  path: string,
  options: RequestInit & { json?: any; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<any> {
  const { json, query, headers, ...rest } = options
  let url = path.startsWith('http') ? path : `${GOOGLE_CAL_BASE}${path}`
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v))
    }
    const sep = url.includes('?') ? '&' : '?'
    url += `${sep}${qs.toString()}`
  }

  async function doCall(token: string): Promise<Response> {
    return fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(headers as Record<string, string> | undefined),
      },
      body: json ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
    })
  }

  let { access_token, account } = await getGoogleAccessToken(user_id, account_email)
  let res = await doCall(access_token)

  // Retry une fois si 401 (token rejeté côté Google)
  if (res.status === 401) {
    // Force refresh : marque expires_at expiré
    const admin = getAdminClient()
    await admin.from('user_oauth_accounts').update({ expires_at: new Date(0).toISOString() }).eq('id', account.id)
    const refreshed = await getGoogleAccessToken(user_id, account_email)
    res = await doCall(refreshed.access_token)
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    let parsed: any = null
    try { parsed = JSON.parse(txt) } catch { /* noop */ }
    const msg = parsed?.error?.message || txt.slice(0, 300) || `HTTP ${res.status}`
    throw new Error(`Google Calendar API ${res.status} : ${msg}`)
  }

  if (res.status === 204) return null
  return res.json()
}

/** Petit utilitaire : extrait le lien Meet d'un event Google */
export function extractMeetUrl(event: any): string | null {
  const cd = event?.conferenceData
  if (!cd) return null
  // entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/xxx' }, ...]
  const ep = (cd.entryPoints || []).find((e: any) => e.entryPointType === 'video')
  return ep?.uri || null
}
