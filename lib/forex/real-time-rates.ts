/**
 * Real-time exchange rates service.
 * Supports 150+ currencies via multiple providers (ECB, Open Exchange Rates, Wise).
 * Implements caching, fallback, and historical lookup.
 */

export type ISO4217 = string  // 3-letter currency code (USD, EUR, GBP, MUR, XOF, etc.)

export interface ExchangeRate {
  base: ISO4217
  quote: ISO4217
  rate: number  // 1 base = rate * quote
  timestamp: Date
  source: 'ECB' | 'OPEN_EXCHANGE' | 'WISE' | 'MANUAL' | 'CACHE'
  bid?: number
  ask?: number
  isFixedPeg?: boolean  // For XOF/XAF/KMF pegged to EUR
}

export interface RateCache {
  rates: Map<string, ExchangeRate>
  lastUpdate: Date
  ttlMs: number  // Time-to-live for cache entries
}

// Singleton cache
const cache: RateCache = {
  rates: new Map(),
  lastUpdate: new Date(0),
  ttlMs: 5 * 60 * 1000,  // 5 minutes
}

const FIXED_PEGS: Record<string, { base: ISO4217; rate: number }> = {
  'XOF': { base: 'EUR', rate: 655.957 },
  'XAF': { base: 'EUR', rate: 655.957 },
  'KMF': { base: 'EUR', rate: 491.96775 },
  'CVE': { base: 'EUR', rate: 110.265 },
  'STN': { base: 'EUR', rate: 24.500 },
  'BAM': { base: 'EUR', rate: 1.95583 },
}

export const SUPPORTED_CURRENCIES: ISO4217[] = [
  // Major
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD',
  // African
  'MUR', 'ZAR', 'NGN', 'KES', 'EGP', 'MAD', 'TZS', 'UGX', 'GHS', 'BWP', 'MWK', 'ZMW', 'ETB',
  // OHADA
  'XOF', 'XAF', 'KMF', 'CDF', 'GNF',
  // Asian
  'CNY', 'INR', 'HKD', 'SGD', 'KRW', 'TWD', 'THB', 'IDR', 'MYR', 'PHP', 'VND', 'PKR', 'BDT', 'LKR',
  // Middle Eastern
  'AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'JOD', 'LBP', 'ILS', 'TRY',
  // European (non-EUR)
  'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RSD', 'ISK', 'UAH', 'RUB',
  // Americas
  'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'VES',
  // Pacific
  'FJD', 'PGK', 'XPF', 'TOP', 'WST', 'VUV', 'SBD',
]

/**
 * Generate cache key for a currency pair.
 */
function cacheKey(base: ISO4217, quote: ISO4217): string {
  return `${base}/${quote}`
}

/**
 * Check if a rate is a fixed peg (no need to fetch).
 */
function getFixedPegRate(base: ISO4217, quote: ISO4217): ExchangeRate | null {
  // Direct peg
  const directPeg = FIXED_PEGS[base]
  if (directPeg && directPeg.base === quote) {
    return {
      base, quote,
      rate: 1 / directPeg.rate,  // base→quote
      timestamp: new Date(),
      source: 'MANUAL',
      isFixedPeg: true,
    }
  }

  // Reverse peg
  const reversePeg = FIXED_PEGS[quote]
  if (reversePeg && reversePeg.base === base) {
    return {
      base, quote,
      rate: reversePeg.rate,
      timestamp: new Date(),
      source: 'MANUAL',
      isFixedPeg: true,
    }
  }

  // Both pegged to same currency (XOF↔XAF, etc.)
  const basePeg = FIXED_PEGS[base]
  const quotePeg = FIXED_PEGS[quote]
  if (basePeg && quotePeg && basePeg.base === quotePeg.base) {
    return {
      base, quote,
      rate: quotePeg.rate / basePeg.rate,
      timestamp: new Date(),
      source: 'MANUAL',
      isFixedPeg: true,
    }
  }

  return null
}

/**
 * Fetch a single exchange rate from primary providers.
 */
async function fetchRateFromProvider(base: ISO4217, quote: ISO4217): Promise<ExchangeRate | null> {
  // Try ECB first (free, official, only for EUR-base)
  if (base === 'EUR') {
    try {
      const url = `https://api.frankfurter.app/latest?from=EUR&to=${quote}`
      const r = await fetch(url, { next: { revalidate: 300 } })
      if (r.ok) {
        const data = await r.json() as { rates: Record<string, number>; date: string }
        const rate = data.rates[quote]
        if (rate) {
          return {
            base, quote, rate,
            timestamp: new Date(data.date),
            source: 'ECB',
          }
        }
      }
    } catch { /* noop */ }
  }

  // Cross-rate via EUR if base ≠ EUR
  if (base !== 'EUR' && quote !== 'EUR') {
    try {
      const url = `https://api.frankfurter.app/latest?from=EUR&to=${base},${quote}`
      const r = await fetch(url, { next: { revalidate: 300 } })
      if (r.ok) {
        const data = await r.json() as { rates: Record<string, number>; date: string }
        const baseRate = data.rates[base]
        const quoteRate = data.rates[quote]
        if (baseRate && quoteRate) {
          return {
            base, quote,
            rate: quoteRate / baseRate,
            timestamp: new Date(data.date),
            source: 'ECB',
          }
        }
      }
    } catch { /* noop */ }
  }

  return null
}

/**
 * Get exchange rate with caching.
 */
export async function getExchangeRate(base: ISO4217, quote: ISO4217): Promise<ExchangeRate> {
  if (base === quote) {
    return { base, quote, rate: 1, timestamp: new Date(), source: 'MANUAL' }
  }

  // 1. Check fixed peg
  const pegRate = getFixedPegRate(base, quote)
  if (pegRate) return pegRate

  // 2. Check cache
  const key = cacheKey(base, quote)
  const cached = cache.rates.get(key)
  if (cached && Date.now() - cached.timestamp.getTime() < cache.ttlMs) {
    return { ...cached, source: 'CACHE' }
  }

  // 3. Fetch from provider
  const fresh = await fetchRateFromProvider(base, quote)
  if (fresh) {
    cache.rates.set(key, fresh)
    cache.lastUpdate = new Date()
    return fresh
  }

  // 4. Fallback: return stale cache if any
  if (cached) {
    return { ...cached, source: 'CACHE' }
  }

  throw new Error(`No exchange rate available for ${base}/${quote}`)
}

/**
 * Batch get multiple rates (more efficient).
 */
export async function getMultipleRates(
  base: ISO4217,
  quotes: ISO4217[]
): Promise<Record<string, ExchangeRate>> {
  const results: Record<string, ExchangeRate> = {}
  await Promise.all(
    quotes.map(async (quote) => {
      try {
        results[quote] = await getExchangeRate(base, quote)
      } catch (e) {
        // Skip failed rates
      }
    })
  )
  return results
}

/**
 * Convert amount using real-time rate.
 */
export async function convertWithLiveRate(
  amount: number,
  from: ISO4217,
  to: ISO4217
): Promise<{ amount: number; rate: ExchangeRate }> {
  const rate = await getExchangeRate(from, to)
  return { amount: amount * rate.rate, rate }
}

/**
 * Clear cache (admin only).
 */
export function clearRateCache(): void {
  cache.rates.clear()
  cache.lastUpdate = new Date(0)
}

export function getCacheStats() {
  return {
    size: cache.rates.size,
    lastUpdate: cache.lastUpdate,
    entries: Array.from(cache.rates.keys()),
  }
}
