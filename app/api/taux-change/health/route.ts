import { NextResponse } from 'next/server'
import { getTauxHealth } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const health = await getTauxHealth()
    return NextResponse.json(health, {
      status: health.stale ? 200 : 200, // never 5xx — consumers check .stale
      headers: { 'Cache-Control': 'public, s-maxage=60' },
    })
  } catch (e: unknown) {
    return NextResponse.json({
      has_rates: false,
      latest_date: null,
      currencies: [],
      stale: true,
      hours_since_last: null,
      error: e instanceof Error ? e.message : 'Erreur',
    }, { status: 200 })
  }
}
