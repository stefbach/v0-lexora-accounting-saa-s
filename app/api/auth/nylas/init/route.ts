import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { signOAuthState } from '@/lib/google/oauth-state'
import { buildNylasAuthUrl, isNylasConfigured } from '@/lib/nylas/client'

/**
 * GET /api/auth/nylas/init?provider=google&societe_id=...&return_to=...
 * Démarre la connexion d'une boîte via l'auth hébergée Nylas.
 */
export async function GET(req: NextRequest) {
  if (!isNylasConfigured()) {
    return NextResponse.json({ error: 'Nylas non configuré (NYLAS_API_KEY / NYLAS_CLIENT_ID manquants).' }, { status: 503 })
  }
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const provider = sp.get('provider') || undefined // google | microsoft | imap | icloud …
  const societeId = sp.get('societe_id') || ''
  const returnTo = sp.get('return_to') || '/client/email-accounts'

  const state = signOAuthState(user.id, JSON.stringify({ s: societeId, r: returnTo }))
  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
  const redirectUri = `${base}/api/auth/nylas/callback`
  const url = buildNylasAuthUrl({ redirectUri, state, provider })

  if (sp.get('debug') === '1') {
    return NextResponse.json({ redirectUri_a_declarer_dans_nylas: redirectUri, authUrl: url, base })
  }
  return NextResponse.redirect(url)
}
