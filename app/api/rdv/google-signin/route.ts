/**
 * POST /api/rdv/google-signin
 *   body : { credential }
 *
 * Vérifie un ID token Google (Sign in with Google) et retourne
 * { email, name, picture } pour pré-remplir le formulaire de prise de RDV.
 *
 * Pas d'auth Lexora — endpoint public. Le credential est un JWT signé par
 * Google, validé via les clés publiques de Google et l'audience
 * (GOOGLE_OAUTH_CLIENT_ID — le même client utilisé pour OAuth agenda).
 *
 * Aucun stockage : on extrait juste les claims pour la commodité du prospect.
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { credential } = (await req.json().catch(() => ({}))) as { credential?: string }
    if (!credential || typeof credential !== 'string') {
      return NextResponse.json({ error: 'credential manquant' }, { status: 400 })
    }

    const aud = process.env.GOOGLE_OAUTH_CLIENT_ID
    if (!aud) return NextResponse.json({ error: 'Google OAuth client non configuré' }, { status: 503 })

    // Endpoint Google de vérification + parsing du JWT (équivalent à valider
    // la signature avec les certs de google + vérifier aud, iss, exp).
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { cache: 'no-store' },
    )
    if (!tokenInfoRes.ok) {
      return NextResponse.json({ error: 'Token Google invalide' }, { status: 401 })
    }
    const info = (await tokenInfoRes.json()) as {
      aud: string
      iss: string
      email?: string
      email_verified?: string
      name?: string
      given_name?: string
      family_name?: string
      picture?: string
      exp?: string
    }

    if (info.aud !== aud) return NextResponse.json({ error: 'Audience invalide' }, { status: 401 })
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(info.iss)) {
      return NextResponse.json({ error: 'Issuer invalide' }, { status: 401 })
    }
    if (info.email_verified !== 'true' && info.email_verified !== true as any) {
      return NextResponse.json({ error: 'Email non vérifié' }, { status: 401 })
    }
    if (info.exp && Number(info.exp) * 1000 < Date.now()) {
      return NextResponse.json({ error: 'Token expiré' }, { status: 401 })
    }

    return NextResponse.json({
      ok: true,
      email: info.email,
      name: info.name || [info.given_name, info.family_name].filter(Boolean).join(' ') || null,
      picture: info.picture || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
