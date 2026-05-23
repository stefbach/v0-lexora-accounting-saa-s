import type { CurrencyCode } from '../core/types'
import { OHADA_CURRENCIES, convertToCurrency as baseCvonertToCurrency } from './currencies'

/**
 * Live exchange rates cache (in production, fetch from API daily).
 * For now, hardcoded approximate rates as of 2024-2025.
 */
export const EXCHANGE_RATES_VS_EUR: Record<string, number> = {
  // CFA pegged (FIXED RATE - never changes)
  'XOF': 655.957,
  'XAF': 655.957,
  'KMF': 491.96775,

  // Floating currencies (approximate - update daily in production)
  'CDF': 2790.0,
  'GNF': 9420.0,
  'MUR': 49.5,
  'USD': 1.08,
  'GBP': 0.85,
}

export function getEurRate(currency: CurrencyCode): number {
  return EXCHANGE_RATES_VS_EUR[currency] ?? 1
}

/**
 * Convert any OHADA + EUR/USD/MUR currency to any other.
 * For CFA pegged currencies, uses the fixed EUR peg.
 * For floating currencies, uses the rate via EUR as pivot.
 */
export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount

  // Direct EUR conversion
  if (from === 'EUR') {
    return amount * getEurRate(to)
  }
  if (to === 'EUR') {
    return amount / getEurRate(from)
  }

  // Via EUR pivot
  const inEur = amount / getEurRate(from)
  return inEur * getEurRate(to)
}

/**
 * Round to currency-specific decimals.
 * XOF/XAF/KMF/GNF: 0 decimals
 * CDF: 2 decimals
 * MUR, EUR, USD: 2 decimals
 */
export function roundForCurrency(amount: number, currency: CurrencyCode): number {
  const decimals = OHADA_CURRENCIES[currency]?.decimals ?? 2
  const factor = Math.pow(10, decimals)
  return Math.round(amount * factor) / factor
}

/**
 * Format amount with proper locale and currency symbol.
 */
export function formatCurrency(amount: number, currency: CurrencyCode, locale = 'fr-FR'): string {
  const ohada = OHADA_CURRENCIES[currency]
  const decimals = ohada?.decimals ?? 2
  const symbol = ohada?.symbol ?? currency

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(amount)

  return `${formatted} ${symbol}`
}

/**
 * Determine if 2 currencies share the same EUR peg (CFA XOF/XAF).
 * If yes, conversion is 1:1.
 */
export function shareSamePeg(from: CurrencyCode, to: CurrencyCode): boolean {
  const fromCfa = ['XOF', 'XAF'].includes(from)
  const toCfa = ['XOF', 'XAF'].includes(to)
  return fromCfa && toCfa
}

/**
 * Multi-currency journal entry validator.
 * Ensures that converted amounts match within tolerance.
 */
export function validateMultiCurrencyEntry(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  expectedConverted: number,
  toleranceBps: number = 5  // 5 basis points = 0.05% tolerance
): { valid: boolean; converted: number; diff: number; diffBps: number } {
  const converted = convertCurrency(amount, fromCurrency, toCurrency)
  const rounded = roundForCurrency(converted, toCurrency)
  const diff = Math.abs(rounded - expectedConverted)
  const diffBps = (diff / expectedConverted) * 10000

  return {
    valid: diffBps <= toleranceBps,
    converted: rounded,
    diff,
    diffBps,
  }
}
