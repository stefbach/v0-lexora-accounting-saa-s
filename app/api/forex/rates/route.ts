import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getExchangeRate, getMultipleRates, SUPPORTED_CURRENCIES } from '@/lib/forex/real-time-rates'

export async function GET(req: NextRequest) {
  const base = req.nextUrl.searchParams.get('base') ?? 'EUR'
  const quote = req.nextUrl.searchParams.get('quote')
  const quotesParam = req.nextUrl.searchParams.get('quotes')

  if (!SUPPORTED_CURRENCIES.includes(base)) {
    return NextResponse.json({ error: 'Unsupported base currency' }, { status: 400 })
  }

  try {
    if (quote) {
      const rate = await getExchangeRate(base, quote)
      return NextResponse.json({ rate })
    }

    if (quotesParam) {
      const quotes = quotesParam.split(',')
      const rates = await getMultipleRates(base, quotes)
      return NextResponse.json({ rates })
    }

    // Return all major currencies vs base
    const majorQuotes = ['USD', 'EUR', 'GBP', 'JPY', 'MUR', 'ZAR', 'XOF', 'XAF', 'CNY', 'INR']
      .filter(c => c !== base)
    const rates = await getMultipleRates(base, majorQuotes)
    return NextResponse.json({ base, rates })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Forex error' }, { status: 500 })
  }
}
