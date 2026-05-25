import { NextResponse } from 'next/server'
import { getTauxChange, fetchAndStoreRates } from '@/lib/taux-change'

// Sprint 1 — cache 1h. L'audit RH a relevé que /rh/paie/parametres
// re-fetchait le taux EUR/MUR à chaque mount, sans cache → appels
// inutiles vers l'API externe à chaque visite. Le taux ne bouge que
// quelques fois par jour ; 1h de cache est largement acceptable et
// évite le throttling de l'API tierce (EXCHANGE_RATE_API).
//
// `revalidate = 3600` active le cache de la route (Next.js ISR) pendant
// 1 heure. Le header `Cache-Control` force aussi le cache CDN/navigateur
// au cas où la page serait servie via Vercel Edge.
export const revalidate = 3600 // 1h en secondes

// GET — Return current exchange rates (from DB, or fetch fresh from BOM /
// ExchangeRate-API if the cache looks stale). BOM ne nécessite pas de clé,
// donc on déclenche un refresh même sans EXCHANGE_RATE_API_KEY.
export async function GET() {
  try {
    let rates = await getTauxChange()

    // Heuristique "rates fallback" : on détecte les taux hardcodés (== 46.50)
    // pour décider si un fetch frais est nécessaire. BOM publie pas le
    // week-end : si le DB-cache vient d'un jour ouvré récent, on garde.
    const isFallback = !rates.EUR || rates.EUR === 46.50
    if (isFallback) {
      const fresh = await fetchAndStoreRates()
      if (fresh.success) rates = fresh.rates
    }

    return NextResponse.json({
      rates,
      source: isFallback ? 'fallback' : 'database',
      last_update: new Date().toISOString(),
    }, {
      headers: {
        // s-maxage = cache CDN 1h ; stale-while-revalidate = sert l'ancien
        // pendant 5 min supplémentaires pendant qu'un fetch en arrière-plan
        // rafraîchit le cache (transparent pour l'utilisateur).
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
