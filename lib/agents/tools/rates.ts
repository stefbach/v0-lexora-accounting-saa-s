import { createClient } from '@supabase/supabase-js'
import { getTauxChange, getTauxForDate } from '@/lib/taux-change'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getExchangeRate(date: string, currencyFrom = 'EUR', currencyTo = 'MUR'): Promise<{
  rate: number
  source: string
  date: string
}> {
  const supabase = getSupabase()

  // 1. Check cache
  const { data: cached } = await supabase
    .from('exchange_rates_cache')
    .select('rate, source, date')
    .eq('date', date)
    .eq('currency_from', currencyFrom.toUpperCase())
    .eq('currency_to', currencyTo.toUpperCase())
    .maybeSingle()

  if (cached) {
    return { rate: Number(cached.rate), source: cached.source, date: cached.date }
  }

  // 2. Fetch from existing taux_change table (J-1 ou plus proche)
  try {
    const rate = await getTauxForDate(currencyFrom.toUpperCase(), date)
    if (rate && rate > 0) {
      // Cache for next time
      await supabase.from('exchange_rates_cache').upsert({
        date,
        currency_from: currencyFrom.toUpperCase(),
        currency_to: currencyTo.toUpperCase(),
        rate,
        source: 'taux_change_table',
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'date,currency_from,currency_to' }).catch(() => {})

      return { rate, source: 'taux_change_table', date }
    }
  } catch { /* fallback */ }

  // 3. Fallback : taux courants
  const rates = await getTauxChange()
  const rate = rates[currencyFrom.toUpperCase()] || 1

  return { rate, source: 'fallback_current', date }
}

export function convertToMUR(amount: number, devise: string, rate: number): number {
  if (!devise || devise.toUpperCase() === 'MUR') return amount
  return Math.round(amount * rate * 100) / 100
}
