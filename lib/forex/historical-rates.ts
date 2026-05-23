import type { ISO4217, ExchangeRate } from './real-time-rates'

export interface HistoricalRateQuery {
  base: ISO4217
  quote: ISO4217
  date: Date
}

/**
 * Get historical exchange rate for a specific date.
 * Required for IAS 21 (foreign currency translation) and audit purposes.
 */
export async function getHistoricalRate(query: HistoricalRateQuery): Promise<ExchangeRate> {
  const { base, quote, date } = query

  if (base === quote) {
    return { base, quote, rate: 1, timestamp: date, source: 'MANUAL' }
  }

  // Format date as YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0]

  // Frankfurter API supports historical
  try {
    let url: string
    if (base === 'EUR') {
      url = `https://api.frankfurter.app/${dateStr}?from=EUR&to=${quote}`
    } else if (quote === 'EUR') {
      url = `https://api.frankfurter.app/${dateStr}?from=EUR&to=${base}`
    } else {
      url = `https://api.frankfurter.app/${dateStr}?from=EUR&to=${base},${quote}`
    }

    const r = await fetch(url, { next: { revalidate: 86400 } })  // 24h cache
    if (r.ok) {
      const data = await r.json() as { rates: Record<string, number>; date: string }

      if (base === 'EUR') {
        return { base, quote, rate: data.rates[quote], timestamp: new Date(data.date), source: 'ECB' }
      }
      if (quote === 'EUR') {
        return { base, quote, rate: 1 / data.rates[base], timestamp: new Date(data.date), source: 'ECB' }
      }
      // Cross-rate
      return {
        base, quote,
        rate: data.rates[quote] / data.rates[base],
        timestamp: new Date(data.date),
        source: 'ECB',
      }
    }
  } catch {}

  throw new Error(`No historical rate available for ${base}/${quote} on ${dateStr}`)
}

/**
 * Get average rate over a period (for IAS 21 average translation).
 */
export async function getAverageRate(
  base: ISO4217,
  quote: ISO4217,
  startDate: Date,
  endDate: Date,
  sampleDays: number = 30
): Promise<ExchangeRate> {
  const dates: Date[] = []
  const totalMs = endDate.getTime() - startDate.getTime()
  const intervalMs = totalMs / Math.min(sampleDays, 30)

  for (let i = 0; i < sampleDays; i++) {
    dates.push(new Date(startDate.getTime() + i * intervalMs))
  }

  const rates = await Promise.all(
    dates.map(d => getHistoricalRate({ base, quote, date: d }).catch(() => null))
  )

  const validRates = rates.filter((r): r is ExchangeRate => r !== null)
  if (validRates.length === 0) {
    throw new Error(`No rates available for averaging ${base}/${quote}`)
  }

  const avgRate = validRates.reduce((sum, r) => sum + r.rate, 0) / validRates.length

  return {
    base, quote,
    rate: avgRate,
    timestamp: endDate,
    source: 'ECB',
  }
}
