/**
 * POST /api/rh/calcul-distance
 *
 * Calcule la distance routière estimée entre 2 adresses libres, sans GPS.
 * Géocode via OSM Nominatim (cache mutualisé), puis Haversine × 1.3.
 *
 * Body :
 *   {
 *     "depart_adresse":   string non-vide,
 *     "arrivee_adresse":  string non-vide,
 *     "aller_retour":     boolean (optionnel, défaut false)
 *   }
 *
 * Réponse 200 :
 *   {
 *     "distance_km": 12.5,
 *     "distance_haversine_km": 9.6,
 *     "depart":  { lat, lng, display_name, ... },
 *     "arrivee": { lat, lng, display_name, ... },
 *     "aller_retour": false,
 *     "total_km": 12.5,
 *     "routing_factor": 1.3
 *   }
 *
 * Auth : tout utilisateur authentifié (feature self-service RH / trajets).
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { computeRoadDistance } from '@/lib/geo/distance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return apiError('not_authenticated', 401)
  }

  // ── Parse + validation ─────────────────────────────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const depart = typeof body?.depart_adresse === 'string' ? body.depart_adresse.trim() : ''
  const arrivee = typeof body?.arrivee_adresse === 'string' ? body.arrivee_adresse.trim() : ''
  const allerRetour = Boolean(body?.aller_retour)

  if (!depart) {
    return NextResponse.json(
      { error: 'depart_adresse requis (string non-vide)' },
      { status: 400 },
    )
  }
  if (!arrivee) {
    return NextResponse.json(
      { error: 'arrivee_adresse requis (string non-vide)' },
      { status: 400 },
    )
  }

  // ── Calcul ─────────────────────────────────────────────────────────────
  const result = await computeRoadDistance(depart, arrivee)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  const totalKm = allerRetour
    ? Math.round(result.distance_km * 2 * 100) / 100
    : result.distance_km

  return NextResponse.json({
    distance_km: result.distance_km,
    distance_haversine_km: result.distance_haversine_km,
    depart: result.depart,
    arrivee: result.arrivee,
    aller_retour: allerRetour,
    total_km: totalKm,
    routing_factor: result.routing_factor,
  })
}
