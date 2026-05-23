'use client'

import type { TAFIRE, TAFIRELine } from '@/lib/jurisdictions/core/financial-statements.interface'

interface TafireViewerProps {
  tafire: TAFIRE
  currency?: string
  societeName?: string
}

function formatAmount(amount: number, currency: string = 'F CFA'): string {
  if (amount === 0) return '–'
  const negative = amount < 0
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount))
  return (negative ? '(' : '') + formatted + ' ' + currency + (negative ? ')' : '')
}

function Section({ title, lines, currency }: { title: string; lines: TAFIRELine[]; currency: string }) {
  return (
    <div className="border-t">
      <div className="px-4 py-2 bg-gray-100 font-semibold text-sm">{title}</div>
      <table className="w-full">
        <thead className="bg-gray-50 text-xs">
          <tr>
            <th className="px-3 py-1.5 text-left w-12">Code</th>
            <th className="px-3 py-1.5 text-left">Libellé</th>
            <th className="px-3 py-1.5 text-right">Ressources</th>
            <th className="px-3 py-1.5 text-right">Emplois</th>
            <th className="px-3 py-1.5 text-right">Variation Nette</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {lines.map((line, i) => (
            <tr key={i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-1 font-mono text-xs text-gray-500">{line.code}</td>
              <td className="px-3 py-1">{line.label}</td>
              <td className="px-3 py-1 text-right font-mono text-green-600">
                {line.resources > 0 ? formatAmount(line.resources, currency) : ''}
              </td>
              <td className="px-3 py-1 text-right font-mono text-red-600">
                {line.uses > 0 ? formatAmount(line.uses, currency) : ''}
              </td>
              <td className="px-3 py-1 text-right font-mono font-medium">
                {formatAmount(line.netVariation, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TafireViewer({ tafire, currency = 'F CFA', societeName }: TafireViewerProps) {
  // Group lines by section
  const investissementLines = tafire.investmentActivities || []
  const financementLines = tafire.financingActivities || []

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-orange-50 to-amber-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">TAFIRE - Tableau Financier</h2>
            <p className="text-xs text-gray-600">Tableau des Ressources et des Emplois (SYSCOHADA)</p>
            {societeName && <p className="text-sm text-gray-700 mt-1">{societeName}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-600">
              Du {tafire.periodStart.toLocaleDateString('fr-FR')} au {tafire.periodEnd.toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </div>

      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50">
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">CAFG</div>
          <div className="text-base font-bold text-blue-600">{formatAmount(tafire.capacityForSelfFinancing, currency)}</div>
          <div className="text-xs text-gray-400">Capacité d'autofinancement</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Δ FdR</div>
          <div className="text-base font-bold">{formatAmount(tafire.workingCapitalChange, currency)}</div>
          <div className="text-xs text-gray-400">Variation Fonds de Roulement</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Cash Flow Libre</div>
          <div className="text-base font-bold text-green-600">{formatAmount(tafire.freeCashFlow, currency)}</div>
          <div className="text-xs text-gray-400">Free Cash Flow</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Δ Trésorerie</div>
          <div className={`text-base font-bold ${tafire.netVariationOfTreasury >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatAmount(tafire.netVariationOfTreasury, currency)}
          </div>
          <div className="text-xs text-gray-400">Variation Trésorerie Nette</div>
        </div>
      </div>

      {/* Activités d'Investissement */}
      <Section title="Activités d'Investissement" lines={investissementLines} currency={currency} />

      {/* Activités de Financement */}
      <Section title="Activités de Financement" lines={financementLines} currency={currency} />

      <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-600">
        TAFIRE conforme AUDCIF 2017 - Format officiel SYSCOHADA Système Normal
      </div>
    </div>
  )
}
