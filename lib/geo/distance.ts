/**
 * lib/geo/distance.ts
 *
 * Calcul de distance routière estimée entre 2 adresses, sans GPS ni
 * service routing payant. On combine :
 *
 *   1) Geocoding OSM Nominatim (cache-first, cf. ./geocode.ts)
 *   2) Distance Haversine (à vol d'oiseau, formule trigo sphérique)
 *   3) Facteur de routage empirique ROAD_ROUTING_FACTOR = 1.3
 *
 * À Maurice (île compacte, réseau routier dense, distances < 70 km),
 * Haversine × 1.3 approche la distance routière à ±10 % — suffisant pour
 * un calcul de frais km / planning. Pour de la précision routière vraie
 * (carrefours, sens unique), il faudrait basculer sur OSRM ou Mapbox.
 */

import { geocodeAddress, type GeocodeResult } from './geocode'

const ROAD_ROUTING_FACTOR = 1.3

/**
 * Distance grand-cercle (Haversine) en km entre 2 points GPS.
 * Précision suffisante pour des distances < 1000 km.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // rayon terrestre moyen, km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export interface DistanceResult {
  distance_km: number               // estimation routière = haversine × 1.3
  distance_haversine_km: number     // distance pure à vol d'oiseau
  depart: GeocodeResult
  arrivee: GeocodeResult
  routing_factor: number            // pour transparence côté client
}

/**
 * Calcule la distance routière estimée entre 2 adresses libres.
 * Géocode les 2 adresses EN PARALLÈLE (gain de ~1 réseau aller-retour).
 *
 * @returns DistanceResult si les 2 adresses sont géocodables,
 *          sinon `{ error: string }` avec un message explicite RH-friendly.
 */
export async function computeRoadDistance(
  adresseDepart: string,
  adresseArrivee: string,
): Promise<DistanceResult | { error: string }> {
  const [dep, arr] = await Promise.all([
    geocodeAddress(adresseDepart, { countryHint: 'mu' }),
    geocodeAddress(adresseArrivee, { countryHint: 'mu' }),
  ])

  if (!dep) return { error: `Adresse départ introuvable : "${adresseDepart}"` }
  if (!arr) return { error: `Adresse arrivée introuvable : "${adresseArrivee}"` }

  const haversine = haversineKm(dep.lat, dep.lng, arr.lat, arr.lng)
  return {
    distance_km: Math.round(haversine * ROAD_ROUTING_FACTOR * 100) / 100,
    distance_haversine_km: Math.round(haversine * 100) / 100,
    depart: dep,
    arrivee: arr,
    routing_factor: ROAD_ROUTING_FACTOR,
  }
}
