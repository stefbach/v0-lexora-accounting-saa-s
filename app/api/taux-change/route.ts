import { NextResponse } from 'next/server'
import { getTauxChange, fetchAndStoreRates } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

// GET — Return current exchange rates (from DB, or fetch from API if empty)
export async function GET() {
  try {
    let rates = await getTauxChange()

    // If rates are fallback (DB empty), try to fetch live from API
    const isFallback = !rates.EUR || rates.EUR === 46.50
    if (isFallback && process.env.EXCHANGE_RATE_API_KEY) {
      const fresh = await fetchAndStoreRates()
      if (fresh.success) rates = fresh.rates
    }

    return NextResponse.json({
      rates,
      source: isFallback ? 'fallback' : 'database',
      last_update: new Date().toISOString(),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
