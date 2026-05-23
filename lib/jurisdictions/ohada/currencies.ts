import type { CurrencyCode } from '../core/types'

export interface OhadaCurrency {
  code: CurrencyCode
  name: string
  symbol: string
  decimals: number  // 0 for XOF/XAF (no centimes)
  pegged?: { currency: string; rate: number }  // For CFA pegged to EUR
  countries: string[]  // ISO 3166-1 alpha-2
  zone: 'UEMOA' | 'CEMAC' | 'OTHER'
}

export const OHADA_CURRENCIES: Record<string, OhadaCurrency> = {
  XOF: {
    code: 'XOF',
    name: 'Franc CFA UEMOA',
    symbol: 'F CFA',
    decimals: 0,
    pegged: { currency: 'EUR', rate: 655.957 },  // 1 EUR = 655.957 XOF (fixed)
    countries: ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'],
    zone: 'UEMOA'
  },
  XAF: {
    code: 'XAF',
    name: 'Franc CFA CEMAC',
    symbol: 'F CFA',
    decimals: 0,
    pegged: { currency: 'EUR', rate: 655.957 },  // Same peg as XOF
    countries: ['CM', 'CF', 'CG', 'GA', 'GQ', 'TD'],
    zone: 'CEMAC'
  },
  KMF: {
    code: 'KMF',
    name: 'Franc Comorien',
    symbol: 'CF',
    decimals: 0,
    pegged: { currency: 'EUR', rate: 491.96775 },  // 1 EUR = 491.96775 KMF
    countries: ['KM'],
    zone: 'OTHER'
  },
  CDF: {
    code: 'CDF',
    name: 'Franc Congolais',
    symbol: 'FC',
    decimals: 2,
    // No peg - floating
    countries: ['CD'],
    zone: 'OTHER'
  },
  GNF: {
    code: 'GNF',
    name: 'Franc Guinéen',
    symbol: 'FG',
    decimals: 0,
    // No peg - floating
    countries: ['GN'],
    zone: 'OTHER'
  }
}

export function getCurrencyForCountry(countryCode: string): OhadaCurrency | undefined {
  return Object.values(OHADA_CURRENCIES).find(c => c.countries.includes(countryCode))
}

export function convertToCurrency(amount: number, from: CurrencyCode, to: CurrencyCode, rate?: number): number {
  if (from === to) return amount

  // CFA Pegged conversion
  const fromCur = OHADA_CURRENCIES[from]
  const toCur = OHADA_CURRENCIES[to]

  // Same peg → fixed rate
  if (fromCur?.pegged && toCur?.pegged && fromCur.pegged.currency === toCur.pegged.currency) {
    return amount * (toCur.pegged.rate / fromCur.pegged.rate)
  }

  // EUR pegged → EUR
  if (fromCur?.pegged?.currency === to) {
    return amount / fromCur.pegged.rate
  }
  if (toCur?.pegged?.currency === from) {
    return amount * toCur.pegged.rate
  }

  // Use provided rate
  if (rate === undefined) {
    throw new Error(`No conversion rate provided for ${from} → ${to}`)
  }
  return amount * rate
}

export function formatOhadaAmount(amount: number, currency: CurrencyCode): string {
  const cur = OHADA_CURRENCIES[currency]
  if (!cur) return `${amount} ${currency}`

  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: cur.decimals,
    maximumFractionDigits: cur.decimals,
    useGrouping: true
  }).format(amount)

  return `${formatted} ${cur.symbol}`
}
