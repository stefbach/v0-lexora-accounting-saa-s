'use client'

import { useState, useMemo } from 'react'

interface Account {
  number: string
  label: string
  labelFr: string
  classNumber: number
  category: string
  normalBalance: 'DEBIT' | 'CREDIT'
  isAuxiliary: boolean
  isReconcilable: boolean
  parentAccount?: string
  taxCode?: string
  isCustom?: boolean  // Created by user
  notes?: string
}

interface EditableChartOfAccountsProps {
  accounts: Account[]
  onSave: (accounts: Account[]) => Promise<void>
  framework: 'PCM' | 'SYSCOHADA'
  readOnly?: boolean
}

const CATEGORIES = [
  'BALANCE_SHEET_ASSET',
  'BALANCE_SHEET_LIABILITY',
  'BALANCE_SHEET_EQUITY',
  'INCOME_STATEMENT_EXPENSE',
  'INCOME_STATEMENT_REVENUE',
  'OFF_BALANCE',
  'ANALYTICAL',
]

export function EditableChartOfAccounts({ accounts: initialAccounts, onSave, framework, readOnly = false }: EditableChartOfAccountsProps) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Account | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [dirty, setDirty] = useState(false)

  const filtered = useMemo(() => {
    if (!search) return accounts
    const q = search.toLowerCase()
    return accounts.filter(a =>
      a.number.includes(search) ||
      a.labelFr.toLowerCase().includes(q) ||
      a.label.toLowerCase().includes(q)
    )
  }, [accounts, search])

  const startEdit = (account: Account) => {
    setEditingId(account.number)
    setEditForm({ ...account })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
  }

  const saveEdit = () => {
    if (!editForm) return
    setAccounts(prev => prev.map(a => a.number === editingId ? editForm : a))
    setDirty(true)
    cancelEdit()
  }

  const deleteAccount = (number: string) => {
    if (!confirm(`Supprimer le compte ${number} ?`)) return
    setAccounts(prev => prev.filter(a => a.number !== number))
    setDirty(true)
  }

  const addAccount = (newAccount: Account) => {
    if (accounts.some(a => a.number === newAccount.number)) {
      alert(`Le compte ${newAccount.number} existe déjà`)
      return
    }
    setAccounts(prev => [...prev, { ...newAccount, isCustom: true }])
    setShowAddForm(false)
    setDirty(true)
  }

  const handleSaveAll = async () => {
    await onSave(accounts)
    setDirty(false)
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
        <div>
          <h2 className="font-bold">Plan Comptable {framework}</h2>
          <p className="text-xs text-gray-600">{accounts.length} comptes • Modifiable par l'expert</p>
        </div>
        <div className="flex gap-2">
          {!readOnly && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              + Nouveau compte
            </button>
          )}
          {dirty && (
            <button
              onClick={handleSaveAll}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Sauvegarder les modifs
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b bg-gray-50">
        <input
          type="search"
          placeholder="Rechercher par numéro ou libellé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>

      {/* Add form */}
      {showAddForm && (
        <AccountFormModal
          onSave={addAccount}
          onCancel={() => setShowAddForm(false)}
          framework={framework}
        />
      )}

      {/* Table */}
      <div className="max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs">N°</th>
              <th className="px-3 py-2 text-left text-xs">Libellé FR</th>
              <th className="px-3 py-2 text-left text-xs">Classe</th>
              <th className="px-3 py-2 text-center text-xs">Solde</th>
              <th className="px-3 py-2 text-center text-xs">Tiers</th>
              <th className="px-3 py-2 text-center text-xs">Lettrable</th>
              {!readOnly && <th className="px-3 py-2 w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(account => (
              editingId === account.number && editForm ? (
                <tr key={account.number} className="border-t bg-yellow-50">
                  <td className="px-2 py-1">
                    <input
                      value={editForm.number}
                      onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                      className="w-20 px-1 py-0.5 border rounded text-sm font-mono"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={editForm.labelFr}
                      onChange={(e) => setEditForm({ ...editForm, labelFr: e.target.value })}
                      className="w-full px-1 py-0.5 border rounded text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={editForm.classNumber}
                      onChange={(e) => setEditForm({ ...editForm, classNumber: Number(e.target.value) })}
                      className="w-16 px-1 py-0.5 border rounded text-sm"
                    >
                      {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <select
                      value={editForm.normalBalance}
                      onChange={(e) => setEditForm({ ...editForm, normalBalance: e.target.value as 'DEBIT' | 'CREDIT' })}
                      className="px-1 py-0.5 border rounded text-sm"
                    >
                      <option value="DEBIT">D</option>
                      <option value="CREDIT">C</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={editForm.isAuxiliary}
                      onChange={(e) => setEditForm({ ...editForm, isAuxiliary: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={editForm.isReconcilable}
                      onChange={(e) => setEditForm({ ...editForm, isReconcilable: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1 flex gap-1">
                    <button onClick={saveEdit} className="text-green-600 hover:text-green-700">&#10003;</button>
                    <button onClick={cancelEdit} className="text-red-500 hover:text-red-700">&#10005;</button>
                  </td>
                </tr>
              ) : (
                <tr key={account.number} className={`border-t hover:bg-blue-50/30 ${account.isCustom ? 'bg-green-50/30' : ''}`}>
                  <td className="px-3 py-1.5 font-mono text-xs">{account.number}</td>
                  <td className="px-3 py-1.5 text-sm">{account.labelFr}{account.isCustom && <span className="ml-2 text-xs text-green-600">custom</span>}</td>
                  <td className="px-3 py-1.5 text-xs"><span className="px-2 py-0.5 bg-gray-100 rounded">{account.classNumber}</span></td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${account.normalBalance === 'DEBIT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {account.normalBalance === 'DEBIT' ? 'D' : 'C'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center text-xs">{account.isAuxiliary && '✓'}</td>
                  <td className="px-3 py-1.5 text-center text-xs">{account.isReconcilable && '✓'}</td>
                  {!readOnly && (
                    <td className="px-2 py-1.5 flex gap-1">
                      <button onClick={() => startEdit(account)} className="text-blue-500 hover:text-blue-700 text-sm">&#9998;</button>
                      {account.isCustom && (
                        <button onClick={() => deleteAccount(account.number)} className="text-red-500 hover:text-red-700 text-sm">&#128465;</button>
                      )}
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-2 bg-gray-50 border-t text-xs text-gray-600">
        {filtered.length} comptes affichés • {accounts.filter(a => a.isCustom).length} custom
      </div>
    </div>
  )
}

function AccountFormModal({ onSave, onCancel, framework }: { onSave: (a: Account) => void; onCancel: () => void; framework: string }) {
  const [form, setForm] = useState<Account>({
    number: '',
    label: '',
    labelFr: '',
    classNumber: 6,
    category: 'INCOME_STATEMENT_EXPENSE',
    normalBalance: 'DEBIT',
    isAuxiliary: false,
    isReconcilable: false,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-bold mb-4">Nouveau Compte ({framework})</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">Numéro</label>
            <input
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder="611"
              className="w-full px-3 py-2 border rounded font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Libellé Français</label>
            <input
              value={form.labelFr}
              onChange={(e) => setForm({ ...form, labelFr: e.target.value, label: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Classe</label>
              <select
                value={form.classNumber}
                onChange={(e) => setForm({ ...form, classNumber: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              >
                {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Solde Normal</label>
              <select
                value={form.normalBalance}
                onChange={(e) => setForm({ ...form, normalBalance: e.target.value as 'DEBIT' | 'CREDIT' })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="DEBIT">Débit</option>
                <option value="CREDIT">Crédit</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAuxiliary}
                onChange={(e) => setForm({ ...form, isAuxiliary: e.target.checked })}
              />
              Tiers (auxiliaire)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isReconcilable}
                onChange={(e) => setForm({ ...form, isReconcilable: e.target.checked })}
              />
              Lettrable
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border rounded">Annuler</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded">Créer</button>
        </div>
      </div>
    </div>
  )
}
