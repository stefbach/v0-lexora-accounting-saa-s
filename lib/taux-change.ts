import { createClient } from '@supabase/supabase-js'
import { fetchBomRates, toRateMap, BomFetchError } from './connectors/bom-fx'

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
 * Fetch live rates et stockage en DB.
 *
 * Stratégie en cascade :
 *  1. **BOM (Bank of Mauritius)** — source officielle, requise par MRA pour
 *     la valorisation fiscale (USD, EUR, GBP, JPY, AUD, CAD, CNY, INR).
 *  2. **ExchangeRate-API** — couvre les devises non listées par BOM (ZAR,
 *     AED, SGD, CHF, KES, MGA, etc.) et sert de fallback si BOM indisponible.
 *  3. **FALLBACK_RATES** hardcodés — dernier recours si les deux sources échouent.
 *
 * Pour chaque devise, on enregistre `source = 'bom-mu' | 'exchangerate-api'`
 * dans la table `taux_change` pour traçabilité (audit MRA, IFRS).
 */
export async function fetchAndStoreRates(): Promise<{ success: boolean; rates: Record<string, number>; error?: string }> {
  const supabase = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  const finalRates: Record<string, number> = { MUR: 1 }
  const errors: string[] = []

  // ── 1. Source officielle BOM (devises principales) ──
  let bomDate = today
  try {
    const bom = await fetchBomRates()
    const bomMap = toRateMap(bom)
    bomDate = bom.date
    for (const [devise, taux] of Object.entries(bomMap)) {
      if (devise === 'MUR') continue
      finalRates[devise] = taux
      await supabase
        .from('taux_change')
        .upsert(
          { devise, taux, date_taux: bomDate, source: 'bom-mu' },
          { onConflict: 'devise,date_taux' },
        )
    }
  } catch (e) {
    const msg = e instanceof BomFetchError ? e.message : 'BOM injoignable'
    errors.push(`BOM: ${msg}`)
  }

  // ── 2. ExchangeRate-API pour les devises restantes (ZAR, AED, SGD, etc.) ──
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  const missingFromBom = CURRENCIES_TO_FETCH.filter(d => !(d in finalRates))
  if (missingFromBom.length > 0) {
    if (!apiKey) {
      errors.push('EXCHANGE_RATE_API_KEY not configured — devises ' + missingFromBom.join(',') + ' indisponibles')
    } else {
      try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/MUR`, {
          next: { revalidate: 0 },
        })
        if (!response.ok) {
          errors.push(`exchangerate-api HTTP ${response.status}`)
        } else {
          const data = await response.json()
          if (data.result !== 'success' || !data.conversion_rates) {
            errors.push(`exchangerate-api: ${data['error-type'] || 'invalid response'}`)
          } else {
            const apiRates = data.conversion_rates as Record<string, number>
            for (const devise of missingFromBom) {
              if (apiRates[devise] && apiRates[devise] > 0) {
                // L'API renvoie 1 MUR = X devise → on inverse pour avoir 1 devise = Y MUR
                const taux = Math.round((1 / apiRates[devise]) * 10000) / 10000
                finalRates[devise] = taux
                await supabase
                  .from('taux_change')
                  .upsert(
                    { devise, taux, date_taux: today, source: 'exchangerate-api' },
                    { onConflict: 'devise,date_taux' },
                  )
              }
            }
          }
        }
      } catch (e) {
        errors.push(`exchangerate-api: ${e instanceof Error ? e.message : 'fetch failed'}`)
      }
    }
  }

  // ── 3. Fallback hardcodé pour ce qui manque encore ──
  for (const devise of Object.keys(FALLBACK_RATES)) {
    if (!(devise in finalRates)) finalRates[devise] = FALLBACK_RATES[devise]
  }

  // Le succès est défini comme : on a au moins eu BOM OU exchangerate-api.
  // Si les deux ont échoué, on renvoie les fallbacks hardcodés en signalant.
  const success = errors.length < 2
  return {
    success,
    rates: finalRates,
    error: errors.length > 0 ? errors.join(' | ') : undefined,
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
 * Raised by `convertToMUR` in strict mode when the requested currency is not
 * present in the provided rate table. Carries the offending code and the set
 * of known currencies to make debugging trivial.
 */
export class UnknownCurrencyError extends Error {
  readonly devise: string
  readonly knownCurrencies: string[]
  constructor(devise: string, rates: Record<string, number>) {
    const known = Object.keys(rates).sort()
    super(
      `Unknown currency "${devise}" — not found in rate table. ` +
      `Known currencies: ${known.join(', ')}`
    )
    this.name = 'UnknownCurrencyError'
    this.devise = devise
    this.knownCurrencies = known
  }
}

/**
 * Type-guard assertion: narrows `devise` so the compiler trusts it is a
 * known key of the rate table. Throws `UnknownCurrencyError` if not.
 *
 * Use this at API boundaries when you want TS to propagate currency safety
 * through the rest of the function.
 */
export function assertKnownCurrency(
  devise: string,
  rates: Record<string, number>
): asserts devise is keyof typeof rates {
  const key = (devise || '').toUpperCase()
  if (!key || !(key in rates)) {
    throw new UnknownCurrencyError(devise, rates)
  }
}

/**
 * Convert an amount to MUR using the provided rates.
 *
 * @param amount  - Amount in the source currency.
 * @param devise  - Currency code (case-insensitive).
 * @param rates   - Rate table (MUR per 1 unit of foreign currency).
 * @param strict  - When `true`, throws `UnknownCurrencyError` if `devise` is
 *                  absent from `rates`. When `false` (default) preserves
 *                  backward-compatible behaviour: logs a warning and falls
 *                  back to a 1:1 conversion. Always preserve behaviour for
 *                  legacy callers that don't pass `strict`.
 */
export function convertToMUR(
  amount: number,
  devise: string,
  rates: Record<string, number>,
  strict = false
): number {
  const key = (devise || '').toUpperCase()
  if (!key || key === 'MUR') return amount

  const taux = rates[key] ?? rates[devise]
  if (taux === undefined || taux === null) {
    if (strict) {
      throw new UnknownCurrencyError(devise, rates)
    }
    console.warn(
      `[convertToMUR] Unknown currency "${devise}" — falling back to 1:1. ` +
      `Known: ${Object.keys(rates).sort().join(', ')}`
    )
    return amount * 1
  }

  return amount * taux
}
