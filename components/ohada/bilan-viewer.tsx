'use client'

import type { BalanceSheet, BalanceSheetGroup } from '@/lib/jurisdictions/core/financial-statements.interface'

interface BilanViewerProps {
  bilan: BalanceSheet
  currency?: string
  societeName?: string
  showComparative?: boolean
}

function formatAmount(amount: number, currency: string = 'F CFA'): string {
  if (amount === 0) return '–'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(amount) + ' ' + currency
}

function GroupRow({ group, currency }: { group: BalanceSheetGroup; currency: string }) {
  return (
    <>
      <tr className="border-t bg-gray-50">
        <td className="px-3 py-1.5 text-xs font-mono text-gray-500">{group.code}</td>
        <td className="px-3 py-1.5 text-sm font-semibold">{group.label}</td>
        <td className="px-3 py-1.5 text-sm text-right font-mono font-semibold">{formatAmount(group.amount, currency)}</td>
        <td className="px-3 py-1.5 text-sm text-right font-mono text-gray-500">
          {group.comparativeAmount !== undefined ? formatAmount(group.comparativeAmount, currency) : ''}
        </td>
      </tr>
      {group.lines && group.lines.length > 0 && group.lines.map((line, i) => (
        <tr key={i} className="border-t hover:bg-gray-50">
          <td className="px-6 py-1 text-xs font-mono text-gray-400">{line.accountCode}</td>
          <td className="px-6 py-1 text-xs text-gray-700">{line.label}</td>
          <td className="px-3 py-1 text-xs text-right font-mono">{formatAmount(line.amount, currency)}</td>
          <td className="px-3 py-1 text-xs text-right font-mono text-gray-500">
            {line.comparativeAmount !== undefined ? formatAmount(line.comparativeAmount, currency) : ''}
          </td>
        </tr>
      ))}
    </>
  )
}

export function BilanViewer({ bilan, currency = 'F CFA', societeName, showComparative = true }: BilanViewerProps) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Bilan SYSCOHADA</h2>
            {societeName && <p className="text-sm text-gray-600">{societeName}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-600">Au {bilan.periodEnd.toLocaleDateString('fr-FR')}</div>
            {bilan.comparative && <div className="text-gray-500">(N-1: {bilan.comparative.toLocaleDateString('fr-FR')})</div>}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {bilan.balanced ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
              ✓ Bilan équilibré
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
              ⚠ Bilan déséquilibré
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-200">
        {/* ACTIF */}
        <div className="bg-white">
          <table className="w-full">
            <thead className="bg-blue-100">
              <tr>
                <th colSpan={2} className="px-3 py-2 text-left text-sm font-bold">ACTIF</th>
                <th className="px-3 py-2 text-right text-sm font-bold">N</th>
                {showComparative && <th className="px-3 py-2 text-right text-sm font-bold">N-1</th>}
              </tr>
            </thead>
            <tbody>
              {bilan.assets.groups.map((group, i) => (
                <GroupRow key={i} group={group} currency={currency} />
              ))}
              <tr className="border-t-2 border-blue-500 bg-blue-50">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm font-bold">TOTAL ACTIF</td>
                <td className="px-3 py-2 text-sm text-right font-mono font-bold">{formatAmount(bilan.totalAssets, currency)}</td>
                {showComparative && <td className="px-3 py-2 text-sm text-right font-mono"></td>}
              </tr>
            </tbody>
          </table>
        </div>

        {/* PASSIF */}
        <div className="bg-white">
          <table className="w-full">
            <thead className="bg-purple-100">
              <tr>
                <th colSpan={2} className="px-3 py-2 text-left text-sm font-bold">PASSIF</th>
                <th className="px-3 py-2 text-right text-sm font-bold">N</th>
                {showComparative && <th className="px-3 py-2 text-right text-sm font-bold">N-1</th>}
              </tr>
            </thead>
            <tbody>
              {bilan.equity.groups.map((group, i) => (
                <GroupRow key={`eq-${i}`} group={group} currency={currency} />
              ))}
              {bilan.liabilities.groups.map((group, i) => (
                <GroupRow key={`li-${i}`} group={group} currency={currency} />
              ))}
              <tr className="border-t-2 border-purple-500 bg-purple-50">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm font-bold">TOTAL PASSIF</td>
                <td className="px-3 py-2 text-sm text-right font-mono font-bold">{formatAmount(bilan.totalLiabilitiesAndEquity, currency)}</td>
                {showComparative && <td className="px-3 py-2 text-sm text-right font-mono"></td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
