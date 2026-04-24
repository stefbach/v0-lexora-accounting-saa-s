/**
 * Bank currency resolution & comparison utilities.
 *
 * Implements fixes for the OCR audit 2026-04:
 *   F1 — mismatch devise compte vs devise releve
 *   F2 — fallback silencieux 'MUR' quand Claude renvoie devise vide
 *   F3 — regex IBAN currency suffix faux positif
 *
 * Strict: no `any`, no silent fallbacks. When the extracted currency is not
 * trustworthy, `resolveBankCurrency` throws `BankCurrencyError` or returns a
 * null descriptor so the caller can block and flag for human review.
 */

export const SUPPORTED_CURRENCIES = [
  'MUR',
  'EUR',
  'USD',
  'GBP',
  'ZAR',
  'INR',
  'CNY',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
] as const

export type Currency = typeof SUPPORTED_CURRENCIES[number]

export type BankCurrencyErrorCode = 'UNRESOLVED' | 'CONFLICT' | 'UNSUPPORTED'

/** IBAN country codes whose conventions embed a 3-letter currency suffix. */
const IBAN_CURRENCY_SUFFIX_WHITELIST = new Set<string>([
  // Mauritius MCB/SBM multi-currency IBANs sometimes append the ISO currency
  // code as the last 3 chars of the BBAN.
  'MU',
])

export class BankCurrencyError extends Error {
  public code: BankCurrencyErrorCode

  constructor(msg: string, code: BankCurrencyErrorCode) {
    super(msg)
    this.name = 'BankCurrencyError'
    this.code = code
  }
}

/** Type guard: is the value a supported ISO-4217 currency we accept? */
export function isValidCurrency(d: unknown): d is Currency {
  if (typeof d !== 'string') return false
  const up = d.toUpperCase().trim()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(up)
}

/** Normalize any loose currency string to its canonical form, or `null`. */
function normalizeCurrency(raw: unknown): Currency | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '')
  return isValidCurrency(cleaned) ? (cleaned as Currency) : null
}

/**
 * Extract a currency suffix from an IBAN — BUT ONLY when the country code is
 * in our strict whitelist. Many IBAN formats end with digits or letters that
 * look like currency codes but aren't (e.g. a French IBAN ending in "EUR"
 * by coincidence of the BBAN numeric layout). We refuse those.
 */
function extractIbanCurrency(iban: string | null | undefined): Currency | null {
  if (!iban || typeof iban !== 'string') return null
  const compact = iban.replace(/\s+/g, '').toUpperCase()
  if (compact.length < 5) return null
  const country = compact.slice(0, 2)
  if (!IBAN_CURRENCY_SUFFIX_WHITELIST.has(country)) return null
  const suffix = compact.slice(-3)
  if (!/^[A-Z]{3}$/.test(suffix)) return null
  return isValidCurrency(suffix) ? (suffix as Currency) : null
}

export type ResolvedBankCurrency =
  | { currency: Currency; source: 'extraction' | 'iban'; confident: true }
  | { currency: null; source: null; confident: false; reason: string }

/**
 * Resolve a bank account's currency from multiple signals with strict priority.
 *   1. `extractedDevise` — what Claude explicitly returned
 *   2. IBAN suffix — only if the country code is in the whitelist
 *   3. null + reason — no silent MUR fallback
 *
 * Rationale: F2 previously defaulted to MUR whenever Claude returned an empty
 * devise, silently masking extraction failures and corrupting multi-currency
 * accounts.
 */
export function resolveBankCurrency(input: {
  extractedDevise?: string | null
  iban?: string | null
}): ResolvedBankCurrency {
  const fromExtraction = normalizeCurrency(input.extractedDevise)
  if (fromExtraction) {
    return { currency: fromExtraction, source: 'extraction', confident: true }
  }

  const fromIban = extractIbanCurrency(input.iban ?? null)
  if (fromIban) {
    return { currency: fromIban, source: 'iban', confident: true }
  }

  return {
    currency: null,
    source: null,
    confident: false,
    reason:
      'Devise non determinee: extraction vide et IBAN non eligible (whitelist stricte). ' +
      'Aucun fallback MUR silencieux — revue humaine requise.',
  }
}

/**
 * Compare two currency strings (existing vs newly extracted). Returns:
 *   - 'match'       : both known and equal
 *   - 'conflict'    : both known but different — caller MUST block & flag review
 *   - 'no_existing' : only the new value is known
 *   - 'no_new'      : only the existing value is known (or both absent)
 */
export function compareCurrency(
  existingBankCurrency: string | null | undefined,
  newReleveCurrency: string | null | undefined,
): 'match' | 'conflict' | 'no_existing' | 'no_new' {
  const existing = normalizeCurrency(existingBankCurrency)
  const incoming = normalizeCurrency(newReleveCurrency)

  if (!existing && !incoming) return 'no_new'
  if (!existing && incoming) return 'no_existing'
  if (existing && !incoming) return 'no_new'
  if (existing && incoming && existing === incoming) return 'match'
  return 'conflict'
}
