'use client'

import { useState, useCallback } from 'react'

interface JournalLine {
  id?: string
  accountNumber: string
  description: string
  debit: number
  credit: number
  auxiliaryAccount?: string
}

interface JournalEntry {
  id?: string
  date: string
  reference: string
  description: string
  journalCode: 'VTE' | 'ACH' | 'BNQ' | 'SAL' | 'OD'
  lines: JournalLine[]
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'POSTED'
}

interface EditableJournalEntryProps {
  entry: JournalEntry
  onChange: (entry: JournalEntry) => void
  onSave?: (entry: JournalEntry) => Promise<void>
  onCancel?: () => void
  readOnly?: boolean
  canApprove?: boolean
  onApprove?: (entry: JournalEntry) => Promise<void>
}

export function EditableJournalEntry({
  entry: initialEntry,
  onChange,
  onSave,
  onCancel,
  readOnly = false,
  canApprove = false,
  onApprove,
}: EditableJournalEntryProps) {
  const [entry, setEntry] = useState<JournalEntry>(initialEntry)
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [history, setHistory] = useState<JournalEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const totalDebit = entry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = entry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01

  const pushHistory = useCallback((next: JournalEntry) => {
    setHistory(h => [...h.slice(0, historyIndex + 1), next])
    setHistoryIndex(i => i + 1)
  }, [historyIndex])

  const updateEntry = useCallback((updater: (e: JournalEntry) => JournalEntry) => {
    setEntry(prev => {
      const next = updater(prev)
      pushHistory(next)
      onChange(next)
      return next
    })
  }, [onChange, pushHistory])

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    updateEntry(prev => ({
      ...prev,
      lines: prev.lines.map((l, i) => i === index ? { ...l, [field]: value } : l),
    }))
  }

  const addLine = () => {
    updateEntry(prev => ({
      ...prev,
      lines: [...prev.lines, { accountNumber: '', description: '', debit: 0, credit: 0 }],
    }))
    setEditingLine(entry.lines.length)
  }

  const removeLine = (index: number) => {
    if (entry.lines.length <= 2) return  // Min 2 lines
    updateEntry(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }))
  }

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(i => i - 1)
      const prev = history[historyIndex - 1]
      setEntry(prev)
      onChange(prev)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(i => i + 1)
      const next = history[historyIndex + 1]
      setEntry(next)
      onChange(next)
    }
  }

  const handleSave = async () => {
    if (!balanced) {
      alert('Écriture non équilibrée. Débit ≠ Crédit (R1)')
      return
    }
    if (onSave) await onSave(entry)
  }

  const handleApprove = async () => {
    if (!balanced) return
    if (onApprove) await onApprove(entry)
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b bg-gradient-to-r from-blue-50 to-cyan-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Écriture Comptable</span>
          <span className={`px-2 py-0.5 rounded text-xs ${
            entry.status === 'POSTED' ? 'bg-green-100 text-green-800' :
            entry.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
            entry.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {entry.status}
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Annuler (Ctrl+Z)"
              className="text-sm px-2 py-1 border rounded hover:bg-white disabled:opacity-30"
            >
              ↶ Undo
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Refaire (Ctrl+Y)"
              className="text-sm px-2 py-1 border rounded hover:bg-white disabled:opacity-30"
            >
              ↷ Redo
            </button>
          </div>
        )}
      </div>

      {/* Meta fields */}
      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b bg-gray-50">
        <div>
          <label className="text-xs text-gray-600 block mb-1">Date</label>
          <input
            type="date"
            value={entry.date}
            onChange={(e) => updateEntry(p => ({ ...p, date: e.target.value }))}
            disabled={readOnly}
            className="w-full px-2 py-1.5 border rounded text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Référence</label>
          <input
            type="text"
            value={entry.reference}
            onChange={(e) => updateEntry(p => ({ ...p, reference: e.target.value }))}
            disabled={readOnly}
            className="w-full px-2 py-1.5 border rounded text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Journal</label>
          <select
            value={entry.journalCode}
            onChange={(e) => updateEntry(p => ({ ...p, journalCode: e.target.value as any }))}
            disabled={readOnly}
            className="w-full px-2 py-1.5 border rounded text-sm"
          >
            <option value="VTE">VTE - Ventes</option>
            <option value="ACH">ACH - Achats</option>
            <option value="BNQ">BNQ - Banque</option>
            <option value="SAL">SAL - Salaires</option>
            <option value="OD">OD - Opérations Diverses</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Description</label>
          <input
            type="text"
            value={entry.description}
            onChange={(e) => updateEntry(p => ({ ...p, description: e.target.value }))}
            disabled={readOnly}
            className="w-full px-2 py-1.5 border rounded text-sm"
          />
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium w-20">Compte</th>
              <th className="px-2 py-2 text-left text-xs font-medium">Description</th>
              <th className="px-2 py-2 text-right text-xs font-medium w-32">Débit</th>
              <th className="px-2 py-2 text-right text-xs font-medium w-32">Crédit</th>
              {!readOnly && <th className="px-2 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line, i) => (
              <tr key={i} className="border-t hover:bg-blue-50/30">
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={line.accountNumber}
                    onChange={(e) => updateLine(i, 'accountNumber', e.target.value)}
                    disabled={readOnly}
                    placeholder="411"
                    className="w-full px-2 py-1 border rounded font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    disabled={readOnly}
                    placeholder="Libellé..."
                    className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={line.debit || ''}
                    onChange={(e) => updateLine(i, 'debit', Number(e.target.value))}
                    disabled={readOnly || line.credit > 0}
                    className="w-full px-2 py-1 border rounded text-right font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    value={line.credit || ''}
                    onChange={(e) => updateLine(i, 'credit', Number(e.target.value))}
                    disabled={readOnly || line.debit > 0}
                    className="w-full px-2 py-1 border rounded text-right font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                {!readOnly && (
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => removeLine(i)}
                      disabled={entry.lines.length <= 2}
                      className="text-red-500 hover:text-red-700 disabled:opacity-30"
                      title="Supprimer ligne"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={2} className="px-2 py-2 text-right text-sm font-bold">TOTAL</td>
              <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${balanced ? '' : 'text-red-600'}`}>
                {totalDebit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </td>
              <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${balanced ? '' : 'text-red-600'}`}>
                {totalCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </td>
              {!readOnly && <td></td>}
            </tr>
            {!balanced && (
              <tr>
                <td colSpan={5} className="px-3 py-1 text-center text-xs text-red-600 bg-red-50">
                  ⚠ Déséquilibre: {(totalDebit - totalCredit).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={addLine}
            className="px-3 py-1.5 text-sm border rounded hover:bg-white"
          >
            + Ajouter ligne
          </button>

          <div className="flex items-center gap-2">
            {onCancel && (
              <button onClick={onCancel} className="px-4 py-1.5 text-sm border rounded hover:bg-white">
                Annuler
              </button>
            )}
            {onSave && (
              <button
                onClick={handleSave}
                disabled={!balanced}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Enregistrer
              </button>
            )}
            {canApprove && onApprove && entry.status === 'PENDING' && (
              <button
                onClick={handleApprove}
                disabled={!balanced}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                ✓ Approuver
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
