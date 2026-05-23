'use client'

import { useState, useMemo } from 'react'
import { useChartOfAccounts } from '@/lib/jurisdictions/use-jurisdiction'

interface Account {
  number: string
  label: string
  labelFr: string
  classNumber: number
  category: string
  isAuxiliary: boolean
  normalBalance: string
  isReconcilable: boolean
}

interface AccountClass {
  number: number
  code: string
  label: string
  labelFr: string
  category: string
}

export function ChartOfAccountsViewer({ framework = 'SYSCOHADA' }: { framework?: 'SYSCOHADA' | 'PCM' }) {
  const { chart, loading } = useChartOfAccounts(framework)
  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState<number | null>(null)

  const accounts: Account[] = chart?.accounts || []
  const classes: AccountClass[] = chart?.classes || []

  const filtered = useMemo(() => {
    let result = accounts
    if (selectedClass !== null) {
      result = result.filter(a => a.classNumber === selectedClass)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.number.includes(search) ||
        a.label.toLowerCase().includes(q) ||
        a.labelFr.toLowerCase().includes(q)
      )
    }
    return result
  }, [accounts, search, selectedClass])

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement du plan comptable...</div>
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <h2 className="text-xl font-bold">Plan Comptable {framework}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {accounts.length} comptes • {classes.length} classes
        </p>
      </div>

      <div className="p-4 border-b bg-gray-50">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="search"
            placeholder="Rechercher un compte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <select
            value={selectedClass ?? ''}
            onChange={(e) => setSelectedClass(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => (
              <option key={c.number} value={c.number}>
                Classe {c.number} - {c.labelFr}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">N°</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Libellé</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Classe</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Solde</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Tiers</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Lettrable</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((account) => (
              <tr key={account.number} className="border-t hover:bg-blue-50">
                <td className="px-3 py-1.5 text-sm font-mono">{account.number}</td>
                <td className="px-3 py-1.5 text-sm">{account.labelFr}</td>
                <td className="px-3 py-1.5 text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-gray-100 rounded">
                    {account.classNumber}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    account.normalBalance === 'DEBIT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {account.normalBalance === 'DEBIT' ? 'D' : 'C'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  {account.isAuxiliary && <span className="text-blue-600">✓</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {account.isReconcilable && <span className="text-green-600">✓</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  Aucun compte trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-600">
        {filtered.length} comptes affichés sur {accounts.length} total
      </div>
    </div>
  )
}
