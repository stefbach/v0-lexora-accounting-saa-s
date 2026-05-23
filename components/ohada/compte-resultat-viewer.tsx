'use client'

import type { IncomeStatement, IncomeStatementLine } from '@/lib/jurisdictions/core/financial-statements.interface'

interface CompteResultatViewerProps {
  compteResultat: IncomeStatement
  currency?: string
  societeName?: string
}

function formatAmount(amount: number, currency: string = 'F CFA'): string {
  if (amount === 0) return '–'
  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(absAmount)
  return (isNegative ? '(' : '') + formatted + ' ' + currency + (isNegative ? ')' : '')
}

export function CompteResultatViewer({ compteResultat, currency = 'F CFA', societeName }: CompteResultatViewerProps) {
  const sortedLines = compteResultat.lines

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Compte de Résultat SYSCOHADA</h2>
            {societeName && <p className="text-sm text-gray-600">{societeName}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-600">
              Du {compteResultat.periodStart.toLocaleDateString('fr-FR')} au {compteResultat.periodEnd.toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-16">Code</th>
            <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Libellé</th>
            <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">N</th>
            <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">N-1</th>
          </tr>
        </thead>
        <tbody>
          {sortedLines.map((line, i) => {
            const isSubtotal = line.type === 'SUBTOTAL'
            const isTotal = line.type === 'TOTAL'
            const baseClass = 'border-t'
            const styleClass = isTotal
              ? 'bg-blue-50 font-bold text-blue-900'
              : isSubtotal
                ? 'bg-gray-50 font-semibold'
                : 'hover:bg-gray-50'

            return (
              <tr key={i} className={`${baseClass} ${styleClass}`}>
                <td className={`px-3 py-${isSubtotal || isTotal ? 2 : 1} text-xs font-mono ${isSubtotal || isTotal ? '' : 'text-gray-400'}`}>
                  {line.code}
                </td>
                <td className={`px-3 py-${isSubtotal || isTotal ? 2 : 1} text-sm ${isSubtotal || isTotal ? 'uppercase' : ''}`}>
                  {line.label}
                </td>
                <td className={`px-3 py-${isSubtotal || isTotal ? 2 : 1} text-sm text-right font-mono`}>
                  {formatAmount(line.amount, currency)}
                </td>
                <td className={`px-3 py-${isSubtotal || isTotal ? 2 : 1} text-sm text-right font-mono text-gray-500`}>
                  {line.comparativeAmount !== undefined ? formatAmount(line.comparativeAmount, currency) : ''}
                </td>
              </tr>
            )
          })}

          {/* RÉSULTAT NET FINAL */}
          <tr className="border-t-2 border-green-500 bg-green-100">
            <td className="px-3 py-3 text-xs font-mono font-bold">XI</td>
            <td className="px-3 py-3 text-sm font-bold uppercase">Résultat Net de l'Exercice</td>
            <td className="px-3 py-3 text-base text-right font-mono font-bold">
              {formatAmount(compteResultat.netIncome, currency)}
            </td>
            <td className="px-3 py-3 text-sm text-right font-mono"></td>
          </tr>
        </tbody>
      </table>

      {/* Summary cards */}
      <div className="px-6 py-4 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Chiffre d'Affaires</div>
          <div className="text-lg font-bold">{formatAmount(compteResultat.revenue, currency)}</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Résultat d'Exploitation</div>
          <div className="text-lg font-bold">{formatAmount(compteResultat.operatingIncome, currency)}</div>
        </div>
        <div className="bg-white p-3 rounded border">
          <div className="text-xs text-gray-500">Résultat Avant Impôt</div>
          <div className="text-lg font-bold">{formatAmount(compteResultat.incomeBeforeTax, currency)}</div>
        </div>
        <div className="bg-white p-3 rounded border border-green-200">
          <div className="text-xs text-gray-500">Résultat Net</div>
          <div className={`text-lg font-bold ${compteResultat.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatAmount(compteResultat.netIncome, currency)}
          </div>
        </div>
      </div>
    </div>
  )
}
