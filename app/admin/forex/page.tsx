"use client"

import { LiveRatesWidget } from '@/components/forex/live-rates-widget'
import { CurrencyConverter } from '@/components/forex/currency-converter'
import { t, getLocale } from '@/lib/i18n'

export default function ForexAdminPage() {
  const locale = getLocale()
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('adm3.forex.title', locale)}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t('adm3.forex.subtitle', locale)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <LiveRatesWidget base="EUR" />
        </div>
        <div>
          <LiveRatesWidget base="USD" />
        </div>
        <div>
          <LiveRatesWidget base="MUR" showOnly={['EUR', 'USD', 'GBP', 'ZAR', 'INR', 'XOF']} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <CurrencyConverter />

        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-bold mb-3">{t('adm3.forex.supported_title', locale)}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {t('adm3.forex.supported_desc', locale)}
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li>🇲🇺 {t('adm3.forex.cur_mur', locale)}</li>
            <li>🇪🇺 {t('adm3.forex.cur_eur', locale)}</li>
            <li>🇺🇸 {t('adm3.forex.cur_usd', locale)}</li>
            <li>🇬🇧 {t('adm3.forex.cur_gbp', locale)}</li>
            <li>🌍 {t('adm3.forex.cur_xof', locale)}</li>
            <li>🌍 {t('adm3.forex.cur_xaf', locale)}</li>
            <li>🇿🇦 {t('adm3.forex.cur_zar', locale)}</li>
            <li>🇨🇳 {t('adm3.forex.cur_cny', locale)}</li>
            <li>🇮🇳 {t('adm3.forex.cur_inr', locale)}</li>
            <li>🇦🇪 {t('adm3.forex.cur_aed', locale)}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
