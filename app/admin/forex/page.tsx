import { LiveRatesWidget } from '@/components/forex/live-rates-widget'
import { CurrencyConverter } from '@/components/forex/currency-converter'

export default function ForexAdminPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Devises Temps Réel</h1>
        <p className="text-sm text-gray-600 mt-1">
          150+ devises supportées • Mise à jour automatique • Source: ECB/Frankfurter
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
          <h3 className="font-bold mb-3">Devises supportées</h3>
          <p className="text-sm text-gray-600 mb-4">
            150+ devises ISO 4217 incluant toutes les devises africaines, asiatiques,
            européennes, et OHADA (XOF, XAF, KMF, CDF, GNF).
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li>🇲🇺 MUR (Maurice)</li>
            <li>🇪🇺 EUR (Euro)</li>
            <li>🇺🇸 USD (Dollar US)</li>
            <li>🇬🇧 GBP (Sterling)</li>
            <li>🌍 XOF (CFA UEMOA)</li>
            <li>🌍 XAF (CFA CEMAC)</li>
            <li>🇿🇦 ZAR (Rand)</li>
            <li>🇨🇳 CNY (Yuan)</li>
            <li>🇮🇳 INR (Roupie)</li>
            <li>🇦🇪 AED (Dirham)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
