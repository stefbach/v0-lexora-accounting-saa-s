import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { signOAuthState } from '@/lib/google/oauth-state'

/**
 * GET /api/auth/google/init?return_to=...
 *
 * Redirige l'utilisateur vers le consent screen Google avec scopes Calendar
 * read/write + userinfo.email. Le state est un JWT-like signé HMAC-SHA256 pour
 * éviter CSRF + carrier le return_to.
 *
 * Env requises (sinon 503) :
 *   - GOOGLE_OAUTH_CLIENT_ID
 *   - GOOGLE_OAUTH_CLIENT_SECRET (utilisée au callback)
 *   - GOOGLE_OAUTH_REDIRECT_URI  (doit matcher exactement la config console Google)
 */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
  'profile',
]

export async function GET(req: NextRequest) {
  const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const redirect_uri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!client_id || !redirect_uri || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google OAuth non configuré côté serveur (GOOGLE_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI manquants)' },
      { status: 503 },
    )
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification Lexora requise' }, { status: 401 })
  }

  const return_to = req.nextUrl.searchParams.get('return_to') || '/client/settings/google-accounts?google=connected'
  const state = signOAuthState(user.id, return_to)

  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(url)
}
