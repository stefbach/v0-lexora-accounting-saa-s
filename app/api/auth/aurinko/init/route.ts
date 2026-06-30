import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { signOAuthState } from '@/lib/google/oauth-state'
import { buildAurinkoAuthorizeUrl, isAurinkoConfigured, type AurinkoServiceType } from '@/lib/aurinko/client'

/**
 * GET /api/auth/aurinko/init?serviceType=Google&societe_id=...&return_to=...
 * Démarre la connexion d'un compte (Gmail/Outlook/iCloud/IMAP) via Aurinko.
 * Redirige vers l'écran d'autorisation hébergé Aurinko.
 */
const SERVICE_TYPES: AurinkoServiceType[] = ['Google', 'Office365', 'Outlook.com', 'MS Exchange', 'iCloud', 'Zoho Mail', 'IMAP']
const DEFAULT_SCOPES = ['Mail.Read', 'Mail.Send', 'Mail.Drafts', 'Calendar.ReadWrite', 'Contacts.Read']

export async function GET(req: NextRequest) {
  if (!isAurinkoConfigured()) {
    return NextResponse.json({ error: 'Aurinko non configuré (AURINKO_CLIENT_ID / AURINKO_CLIENT_SECRET manquants).' }, { status: 503 })
  }
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const serviceTypeRaw = sp.get('serviceType') || 'Google'
  const serviceType = (SERVICE_TYPES.includes(serviceTypeRaw as AurinkoServiceType) ? serviceTypeRaw : 'Google') as AurinkoServiceType
  const societeId = sp.get('societe_id') || ''
  const returnTo = sp.get('return_to') || '/client/email-accounts'

  // On encode user + societe + return_to + serviceType dans le state signé.
  const state = signOAuthState(user.id, JSON.stringify({ s: societeId, r: returnTo, t: serviceType }))

  // Base STABLE pour la returnUrl : doit correspondre EXACTEMENT à une URL
  // déclarée dans l'app Aurinko. On privilégie NEXT_PUBLIC_APP_URL (prod fixe)
  // plutôt que l'origine dynamique (qui varie sur les previews Vercel et
  // provoque l'erreur "returnurl.invalid").
  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
  const returnUrl = `${base}/api/auth/aurinko/callback`
  const url = buildAurinkoAuthorizeUrl({ serviceType, scopes: DEFAULT_SCOPES, returnUrl, state })
  return NextResponse.redirect(url)
}
