import { createClient } from '@supabase/supabase-js'

// Fallback rates (Bank of Mauritius reference) used when DB and API are unavailable
const FALLBACK_RATES: Record<string, number> = {
  EUR: 46.50,
  GBP: 54.20,
  USD: 44.80,
  MUR: 1,
}

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
      .limit(10)

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

    // Ensure all expected currencies exist
    for (const [devise, fallback] of Object.entries(FALLBACK_RATES)) {
      if (!(devise in rates)) rates[devise] = fallback
    }

    return rates
  } catch {
    return { ...FALLBACK_RATES }
  }
}

/**
 * Fetch live rates from ExchangeRate-API and store in DB.
 * Base currency is MUR — the API returns how many MUR per 1 unit of foreign currency.
 * API: https://v6.exchangerate-api.com/v6/{KEY}/latest/MUR
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
    const currencies = ['EUR', 'GBP', 'USD']
    const rates: Record<string, number> = { MUR: 1 }

    for (const devise of currencies) {
      if (apiRates[devise] && apiRates[devise] > 0) {
        // Inverse: if 1 MUR = 0.0215 EUR, then 1 EUR = 1/0.0215 = 46.51 MUR
        rates[devise] = Math.round((1 / apiRates[devise]) * 10000) / 10000
      } else {
        rates[devise] = FALLBACK_RATES[devise] || 1
      }
    }

    // Store in database
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
 * This is the main function to use across the app.
 */
export async function getTauxChange(): Promise<Record<string, number>> {
  return getTauxChangeFromDB()
}

/**
 * Convert an amount to MUR using the provided rates.
 */
export function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  const taux = rates[devise] || 1
  return amount * taux
}
