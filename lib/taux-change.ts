import { createClient } from '@supabase/supabase-js'

// Fallback rates (Bank of Mauritius reference) used when DB and API are unavailable
// Couvre toutes les devises courantes à Maurice — compliance MRA
const FALLBACK_RATES: Record<string, number> = {
  EUR: 46.50,
  GBP: 54.20,
  USD: 44.80,
  MUR: 1,
  ZAR: 2.40,   // Rand sud-africain
  CNY: 6.20,   // Yuan chinois
  AED: 12.20,  // Dirham UAE
  INR: 0.54,   // Roupie indienne
  SGD: 33.50,  // Dollar singapourien
  JPY: 0.30,   // Yen japonais
  CHF: 50.20,  // Franc suisse
  CAD: 33.10,  // Dollar canadien
  AUD: 29.50,  // Dollar australien
  KES: 0.35,   // Shilling kenyan
  MGA: 0.010,  // Ariary malgache
}

// Liste des devises à fetcher depuis l'API externe
const CURRENCIES_TO_FETCH = ['EUR', 'GBP', 'USD', 'ZAR', 'CNY', 'AED', 'INR', 'SGD', 'JPY', 'CHF', 'CAD', 'AUD', 'KES']

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Fetch latest exchange rates from the database.
 * Returns rates as { EUR: 46.5, GBP: 54.2, USD: 44.8, MUR: 1 }
 */
export async function getTauxChangeFromDB(): Promise<Record<string, number>> {
  try {
    const supabase = getSupabase()

    // Get the most recent rates for each currency
    const { data, error } = await supabase
      .from('taux_change')
      .select('devise, taux, date_taux')
      .order('date_taux', { ascending: false })
      .limit(50)

    if (error || !data || data.length === 0) {
      return { ...FALLBACK_RATES }
    }

    // Keep only the latest rate per currency
    const rates: Record<string, number> = { MUR: 1 }
    const seen = new Set<string>()
    for (const row of data) {
      if (!seen.has(row.devise)) {
        rates[row.devise] = Number(row.taux)
        seen.add(row.devise)
      }
    }

    // Ensure all expected currencies exist (fallback for missing ones)
    for (const [devise, fallback] of Object.entries(FALLBACK_RATES)) {
      if (!(devise in rates)) rates[devise] = fallback
    }

    return rates
  } catch {
    return { ...FALLBACK_RATES }
  }
}

/**
 * Get the exchange rate for a specific currency on a specific date.
 * Uses the closest available rate on or before the requested date (MRA-compliant).
 *
 * @param devise - Currency code (e.g. "EUR", "USD")
 * @param date   - Date in YYYY-MM-DD format
 * @returns MUR equivalent of 1 unit of the currency
 */
export async function getTauxForDate(devise: string, date: string): Promise<number> {
  const deviseCaps = devise.toUpperCase()

  // MUR is always 1
  if (deviseCaps === 'MUR') return 1

  try {
    const supabase = getSupabase()

    // 1. Look for the most recent rate on or before the requested date
    const { data: onOrBefore } = await supabase
      .from('taux_change')
      .select('taux, date_taux')
      .eq('devise', deviseCaps)
      .lte('date_taux', date)
      .order('date_taux', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (onOrBefore?.taux) {
      return Number(onOrBefore.taux)
    }

    // 2. No rate found on or before this date — take the closest available (any date)
    const { data: closest } = await supabase
      .from('taux_change')
      .select('taux, date_taux')
      .eq('devise', deviseCaps)
      .order('date_taux', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (closest?.taux) {
      return Number(closest.taux)
    }

    // 3. Nothing in DB — return fallback
    return FALLBACK_RATES[deviseCaps] || 1
  } catch {
    return FALLBACK_RATES[deviseCaps] || 1
  }
}

/**
 * Batch fetch historical rates for multiple currencies on a given date.
 * Efficient: makes one DB query per currency.
 *
 * @param devises - Array of currency codes (e.g. ["EUR", "USD", "ZAR"])
 * @param date    - Date in YYYY-MM-DD format
 * @returns Record mapping each currency to its MUR rate
 */
export async function getTauxForDates(
  devises: string[],
  date: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = { MUR: 1 }
  const devisesToFetch = [...new Set(devises.map(d => d.toUpperCase()))].filter(d => d !== 'MUR')

  if (devisesToFetch.length === 0) return result

  try {
    const supabase = getSupabase()

    // For each currency, get the most recent rate on or before the date
    // Use a single query and process results
    const { data } = await supabase
      .from('taux_change')
      .select('devise, taux, date_taux')
      .in('devise', devisesToFetch)
      .lte('date_taux', date)
      .order('date_taux', { ascending: false })

    // Keep only the most recent rate per currency (first occurrence in DESC order)
    const seen = new Set<string>()
    for (const row of data || []) {
      if (!seen.has(row.devise)) {
        result[row.devise] = Number(row.taux)
        seen.add(row.devise)
      }
    }

    // For currencies not found on or before the date, try any available date
    const missing = devisesToFetch.filter(d => !(d in result))
    if (missing.length > 0) {
      const { data: fallbackData } = await supabase
        .from('taux_change')
        .select('devise, taux, date_taux')
        .in('devise', missing)
        .order('date_taux', { ascending: false })
        .limit(missing.length * 2)

      const seenFallback = new Set<string>()
      for (const row of fallbackData || []) {
        if (!seenFallback.has(row.devise)) {
          result[row.devise] = Number(row.taux)
          seenFallback.add(row.devise)
        }
      }
    }

    // Apply static fallback for anything still missing
    for (const devise of devisesToFetch) {
      if (!(devise in result)) {
        result[devise] = FALLBACK_RATES[devise] || 1
      }
    }

    return result
  } catch {
    // Full fallback
    for (const devise of devisesToFetch) {
      result[devise] = FALLBACK_RATES[devise] || 1
    }
    return result
  }
}

/**
 * Fetch live rates from ExchangeRate-API and store in DB.
 * Base currency is MUR — the API returns how many MUR per 1 unit of foreign currency.
 * API: https://v6.exchangerate-api.com/v6/{KEY}/latest/MUR
 * Étendu pour couvrir toutes les devises courantes à Maurice.
 */
export async function fetchAndStoreRates(): Promise<{ success: boolean; rates: Record<string, number>; error?: string }> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) {
    return { success: false, rates: FALLBACK_RATES, error: 'EXCHANGE_RATE_API_KEY not configured' }
  }

  try {
    // Fetch rates with MUR as base
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/MUR`, {
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      return { success: false, rates: FALLBACK_RATES, error: `API returned ${response.status}` }
    }

    const data = await response.json()

    if (data.result !== 'success' || !data.conversion_rates) {
      return { success: false, rates: FALLBACK_RATES, error: data['error-type'] || 'Invalid API response' }
    }

    // The API returns: 1 MUR = X EUR, 1 MUR = X GBP, etc.
    // We need the inverse: 1 EUR = Y MUR, 1 GBP = Z MUR
    const apiRates = data.conversion_rates as Record<string, number>
    const rates: Record<string, number> = { MUR: 1 }

    for (const devise of CURRENCIES_TO_FETCH) {
      if (apiRates[devise] && apiRates[devise] > 0) {
        // Inverse: if 1 MUR = 0.0215 EUR, then 1 EUR = 1/0.0215 = 46.51 MUR
        rates[devise] = Math.round((1 / apiRates[devise]) * 10000) / 10000
      } else {
        rates[devise] = FALLBACK_RATES[devise] || 1
      }
    }

    // Store in database with today's date
    const supabase = getSupabase()
    const today = new Date().toISOString().split('T')[0]

    for (const [devise, taux] of Object.entries(rates)) {
      if (devise === 'MUR') continue
      await supabase
        .from('taux_change')
        .upsert(
          { devise, taux, date_taux: today, source: 'exchangerate-api' },
          { onConflict: 'devise,date_taux' }
        )
    }

    return { success: true, rates }
  } catch (e) {
    return { success: false, rates: FALLBACK_RATES, error: e instanceof Error ? e.message : 'Fetch failed' }
  }
}

/**
 * Get current exchange rates — from DB first, falls back to hardcoded.
 * This is the main function to use across the app when the date doesn't matter.
 * Pour les écritures comptables, préférer getTauxForDate().
 */
export async function getTauxChange(): Promise<Record<string, number>> {
  return getTauxChangeFromDB()
}

/**
 * Same as getTauxChange but never throws — replaces ad-hoc catches with
 * hardcoded fallbacks scattered across API routes. Logs a warning if the
 * DB is unreachable so drift is visible in Vercel logs / Sentry.
 */
export async function getTauxChangeSafe(context = 'unknown'): Promise<Record<string, number>> {
  try {
    return await getTauxChangeFromDB()
  } catch (e) {
    console.warn(`[taux-change][${context}] DB unreachable, using FALLBACK_RATES`, e)
    return { ...FALLBACK_RATES }
  }
}

/**
 * Health check: returns the freshness of FX rates in DB.
 * Useful for admin dashboards / alerting when the daily cron fails.
 */
export async function getTauxHealth(): Promise<{
  has_rates: boolean
  latest_date: string | null
  currencies: string[]
  stale: boolean
  hours_since_last: number | null
}> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('taux_change')
      .select('devise, date_taux')
      .order('date_taux', { ascending: false })
      .limit(50)

    if (!data || data.length === 0) {
      return { has_rates: false, latest_date: null, currencies: [], stale: true, hours_since_last: null }
    }

    const latest = data[0].date_taux as string
    const currencies = [...new Set(data.map(r => r.devise as string))]
    const hours = (Date.now() - new Date(latest).getTime()) / 3600000
    return {
      has_rates: true,
      latest_date: latest,
      currencies,
      stale: hours > 36, // more than 36h old = stale (daily cron + weekend margin)
      hours_since_last: Math.round(hours),
    }
  } catch {
    return { has_rates: false, latest_date: null, currencies: [], stale: true, hours_since_last: null }
  }
}

/**
 * Convert an amount to MUR using the provided rates.
 */
export function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  const taux = rates[devise.toUpperCase()] || rates[devise] || 1
  return amount * taux
}
