import { NextResponse } from 'next/server'
import { getMultipleRates, SUPPORTED_CURRENCIES, clearRateCache } from '@/lib/forex/real-time-rates'

export const runtime = 'nodejs'

export async function GET() {
  // Clear cache to force fresh fetches
  clearRateCache()

  // Pre-warm cache with EUR base (covers most pairs via cross-rate)
  const bases = ['EUR', 'USD', 'MUR']
  const results: any[] = []

  for (const base of bases) {
    const quotes = SUPPORTED_CURRENCIES.filter(c => c !== base).slice(0, 50)  // Top 50
    try {
      const rates = await getMultipleRates(base, quotes)
      results.push({
        base,
        ratesUpdated: Object.keys(rates).length,
        success: true,
      })
    } catch (e: any) {
      results.push({ base, error: e?.message, success: false })
    }
  }

  return NextResponse.json({
    cronJob: 'forex-rates-update',
    executedAt: new Date().toISOString(),
    results,
    totalPairsUpdated: results.reduce((s, r) => s + (r.ratesUpdated || 0), 0),
  })
}
