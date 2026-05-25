/**
 * lib/geo/geocode.ts
 *
 * Geocoding adresse → (lat,lng) via OSM Nominatim, avec cache Postgres
 * (table `geocoding_cache`, migration 424). Pensé pour le calcul de
 * distance entre 2 adresses sans GPS (frais km, planning trajets, etc.).
 *
 * Contraintes Nominatim publiques :
 *   - 1 req/sec max (politique d'usage gratuit)
 *   - User-Agent obligatoire avec contact
 *   - Pas de bulk geocoding (mettre en place le cache !)
 *
 * Le cache est consulté AVANT tout appel réseau ; il n'y a donc qu'un
 * seul hit Nominatim par adresse unique sur 90 jours.
 */

import { createClient } from '@/lib/supabase/server'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'Lexora-SaaS-Accounting/1.0 (contact@lexora.app)'

export interface GeocodeResult {
  lat: number
  lng: number
  display_name: string
  country_code: string | null
  from_cache: boolean
}

export interface SearchSuggestion {
  display_name: string
  lat: number
  lng: number
  country_code: string | null
}

/**
 * Normalise une adresse pour servir de clé de cache stable :
 *   - décompose les diacritiques (é → e + ́) puis les retire
 *   - lowercase
 *   - trim + espaces multiples → simple espace
 * Ex. "  Rue de la République, Curepipe  " → "rue de la republique, curepipe"
 */
function normalizeAddress(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Géocode une adresse texte → coordonnées. Cache-first, fallback Nominatim.
 *
 * @param address      Adresse libre saisie par l'utilisateur
 * @param options.countryHint  Code ISO 3166-1 alpha-2 (ex 'mu') pour biaiser
 *                              vers le bon pays. Recommandé : toujours 'mu'.
 * @returns null si introuvable (ne lève pas — facilite l'usage côté API)
 */
export async function geocodeAddress(
  address: string,
  options?: { countryHint?: string },
): Promise<GeocodeResult | null> {
  const adresseNorm = normalizeAddress(address)
  if (!adresseNorm) return null

  const sb = await createClient()

  // 1. Lookup cache (clé primaire → index B-tree, < 1 ms)
  const { data: cached } = await sb
    .from('geocoding_cache')
    .select('lat, lng, display_name, country_code')
    .eq('adresse_norm', adresseNorm)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (cached) {
    return {
      lat: Number(cached.lat),
      lng: Number(cached.lng),
      display_name: cached.display_name ?? address,
      country_code: cached.country_code ?? null,
      from_cache: true,
    }
  }

  // 2. Cache miss → Nominatim
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    addressdetails: '1',
  })
  if (options?.countryHint) params.set('countrycodes', options.countryHint)

  let res: Response
  try {
    res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fr,en',
      },
    })
  } catch (e: any) {
    console.error('[geocode] Nominatim fetch failed', e?.message)
    return null
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[geocode] Nominatim HTTP', res.status, body.slice(0, 200))
    return null
  }

  const arr = (await res.json()) as Array<{
    lat: string
    lon: string
    display_name: string
    address?: { country_code?: string }
  }>
  if (!arr || arr.length === 0) return null

  const result: GeocodeResult = {
    lat: Number(arr[0].lat),
    lng: Number(arr[0].lon),
    display_name: arr[0].display_name,
    country_code: arr[0].address?.country_code ?? null,
    from_cache: false,
  }

  // 3. Write cache (best-effort, n'attend pas la fin pour répondre)
  sb.from('geocoding_cache')
    .insert({
      adresse_norm: adresseNorm,
      adresse_input: address,
      lat: result.lat,
      lng: result.lng,
      display_name: result.display_name,
      country_code: result.country_code,
    })
    .then(
      () => {},
      (e: any) => console.warn('[geocode] cache insert failed', e?.message),
    )

  return result
}

/**
 * Recherche d'adresses (autocomplétion). Pas mis en cache : les requêtes
 * partielles ("Rose-H", "Rose-Hi", "Rose-Hil") gonfleraient la table sans
 * réutilisation. C'est le geocodeAddress() final, sur l'adresse choisie,
 * qui peuplera le cache.
 *
 * @param query        Au moins 3 caractères (sinon retourne [])
 * @param countryHint  ISO 3166-1 alpha-2, défaut 'mu' (Maurice)
 */
export async function searchAddresses(
  query: string,
  countryHint = 'mu',
): Promise<SearchSuggestion[]> {
  if (!query || query.trim().length < 3) return []

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    countrycodes: countryHint,
    addressdetails: '1',
  })

  let res: Response
  try {
    res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fr,en',
      },
    })
  } catch (e: any) {
    console.error('[geocode-search] fetch failed', e?.message)
    return []
  }
  if (!res.ok) return []

  const arr = (await res.json()) as Array<{
    lat: string
    lon: string
    display_name: string
    address?: { country_code?: string }
  }>
  return arr.map((r) => ({
    display_name: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    country_code: r.address?.country_code ?? null,
  }))
}
