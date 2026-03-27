import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/claude'
import { fetchAndStoreRates } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

// Cron: Every day at 5:30 AM — Fetch and store latest exchange rates
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const result = await fetchAndStoreRates()

  if (!result.success) {
    console.error('[CRON maj-taux-change] Error:', result.error)
    return NextResponse.json({
      status: 'error',
      error: result.error,
      fallback_rates: result.rates,
    }, { status: 500 })
  }

  console.log('[CRON maj-taux-change] Rates updated:', result.rates)
  return NextResponse.json({
    status: 'ok',
    rates: result.rates,
    timestamp: new Date().toISOString(),
  })
}
