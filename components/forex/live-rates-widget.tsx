'use client'

import { useEffect, useState } from 'react'
import { t, getLocale } from '@/lib/i18n'

interface Rate {
  base: string
  quote: string
  rate: number
  timestamp: string
  source: string
  isFixedPeg?: boolean
}

interface LiveRatesWidgetProps {
  base?: string
  refreshInterval?: number  // ms
  showOnly?: string[]
}

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭',
  MUR: '🇲🇺', ZAR: '🇿🇦', XOF: '🌍', XAF: '🌍', KMF: '🇰🇲',
  CDF: '🇨🇩', GNF: '🇬🇳', NGN: '🇳🇬', KES: '🇰🇪', EGP: '🇪🇬',
  CNY: '🇨🇳', INR: '🇮🇳', AED: '🇦🇪',
}

export function LiveRatesWidget({ base = 'EUR', refreshInterval = 60000, showOnly }: LiveRatesWidgetProps) {
  const locale = getLocale()
  const [rates, setRates] = useState<Record<string, Rate>>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchRates = async () => {
    try {
      const url = showOnly?.length
        ? `/api/forex/rates?base=${base}&quotes=${showOnly.join(',')}`
        : `/api/forex/rates?base=${base}`

      const r = await fetch(url)
      const data = await r.json()

      if (data.rates) {
        setRates(data.rates)
        setLastUpdate(new Date())
        setError(null)
      }
    } catch (e: any) {
      setError(e?.message ?? t('scmsc.fx.fetch_failed', locale))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, refreshInterval)
    return () => clearInterval(interval)
  }, [base, refreshInterval, showOnly?.join(',')])

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <span>{CURRENCY_FLAGS[base] ?? '💱'}</span>
              {t('scmsc.fx.titre', locale).replace('{base}', base)}
            </h3>
            {lastUpdate && (
              <p className="text-xs text-gray-500 mt-0.5">
                {t('scmsc.fx.mis_a_jour', locale).replace('{time}', lastUpdate.toLocaleTimeString('fr-FR'))}
                <span className="inline-flex items-center gap-1 ml-2 text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  {t('scmsc.fx.live', locale)}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={fetchRates}
            disabled={loading}
            className="text-sm px-3 py-1 border rounded hover:bg-white disabled:opacity-50"
          >
            {t('scmsc.fx.refresh', locale)}
          </button>
        </div>
      </div>

      <div className="divide-y">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 text-sm">
            ⚠ {error}
          </div>
        )}

        {loading && Object.keys(rates).length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">
            {t('scmsc.fx.chargement_taux', locale)}
          </div>
        )}

        {Object.entries(rates).map(([quote, rate]) => (
          <div key={quote} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-xl">{CURRENCY_FLAGS[quote] ?? '💱'}</span>
              <div>
                <div className="font-medium text-sm">{quote}</div>
                <div className="text-xs text-gray-500">
                  {rate.isFixedPeg ? t('scmsc.fx.parite_fixe', locale) : rate.source}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold">
                {rate.rate.toLocaleString('fr-FR', {
                  minimumFractionDigits: rate.rate > 100 ? 0 : 4,
                  maximumFractionDigits: rate.rate > 100 ? 2 : 6,
                })}
              </div>
              <div className="text-xs text-gray-500">
                1 {base}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-600 text-center">
        {t('scmsc.fx.source_footer', locale)}
      </div>
    </div>
  )
}
