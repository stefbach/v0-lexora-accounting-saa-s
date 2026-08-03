import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { signOAuthState } from '@/lib/google/oauth-state'
import { buildNylasAuthUrl, isNylasConfigured, nylasRedirectUri } from '@/lib/nylas/client'

/**
 * GET /api/auth/nylas/init?provider=google&societe_id=...&return_to=...
 * Démarre la connexion d'une boîte via l'auth hébergée Nylas.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const debug = sp.get('debug') === '1'

    // Ce préfixe `/api/auth/**` est public dans le middleware (les callbacks
    // OAuth doivent y accéder). Le diagnostic doit donc vérifier la session
    // lui-même, sinon n'importe qui lit la configuration Nylas de Lexora —
    // même décision que pour `/api/rdv/diag`, laissé hors liste blanche.
    // Diagnostic complet, par boîte : /api/nylas/diag.
    if (debug) {
      const debugUser = await resolveUserAuth(req)
      if (!debugUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      return NextResponse.json({
        configured: isNylasConfigured(),
        NYLAS_API_KEY_definie: !!process.env.NYLAS_API_KEY,
        NYLAS_CLIENT_ID_definie: !!process.env.NYLAS_CLIENT_ID,
        NYLAS_API_URI: process.env.NYLAS_API_URI || '(defaut us)',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(non definie)',
        redirectUri: nylasRedirectUri(req.nextUrl.origin),
      })
    }

    if (!isNylasConfigured()) {
      return NextResponse.json({ error: 'Nylas non configuré (NYLAS_API_KEY / NYLAS_CLIENT_ID manquants côté Vercel).' }, { status: 503 })
    }
    const user = await resolveUserAuth(req)
    if (!user) return NextResponse.json({ error: 'Non authentifié — connecte-toi à Lexora puis réessaie.' }, { status: 401 })

    const provider = sp.get('provider') || undefined
    const societeId = sp.get('societe_id') || ''
    const returnTo = sp.get('return_to') || '/client/email-accounts'

    const state = signOAuthState(user.id, JSON.stringify({ s: societeId, r: returnTo }))
    const url = buildNylasAuthUrl({ redirectUri: nylasRedirectUri(req.nextUrl.origin), state, provider })
    return NextResponse.redirect(url)
  } catch (e) {
    // Au lieu d'un 500 muet, on renvoie le détail.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur init Nylas', stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined }, { status: 500 })
  }
}
