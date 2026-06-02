/**
 * GET /api/rdv/google-config
 *   → expose le client_id Google OAuth pour initialiser Google Identity
 *     Services côté client (Sign in with Google sur /rdv).
 *
 * Public — le client_id n'est pas un secret.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    google_client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
  })
}
