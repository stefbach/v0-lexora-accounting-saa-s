/**
 * GET /api/rh/geocode-search?q=<query>&country=<iso2>
 *
 * Autocomplétion d'adresses via OSM Nominatim. Pas de cache (les
 * requêtes partielles ne se réutilisent quasiment jamais).
 *
 * Auth : authentifié (n'importe quel rôle).
 *
 * Query :
 *   - q        string, min 3 caractères (sinon retourne tableau vide)
 *   - country  ISO 3166-1 alpha-2, défaut 'mu' (Maurice)
 *
 * Réponse 200 :
 *   [
 *     { display_name, lat, lng, country_code },
 *     ... (max 5)
 *   ]
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { searchAddresses } from '@/lib/geo/geocode'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // ── Parse query ────────────────────────────────────────────────────────
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const country = (url.searchParams.get('country') || 'mu').toLowerCase()

  if (q.length < 3) {
    return NextResponse.json([])
  }

  // ── Recherche ──────────────────────────────────────────────────────────
  const suggestions = await searchAddresses(q, country)
  return NextResponse.json(suggestions)
}
