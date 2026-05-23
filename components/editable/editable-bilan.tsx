'use client'

import { useState } from 'react'

interface BilanLine {
  code: string
  label: string
  amount: number
  comparativeAmount?: number
  isEditable: boolean
  notes?: string  // Adjustment notes by expert
}

interface BilanSection {
  title: string
  lines: BilanLine[]
}

interface EditableBilanProps {
  actif: BilanSection[]
  passif: BilanSection[]
  onLineEdit?: (sectionType: 'actif' | 'passif', code: string, newAmount: number, notes: string) => void
  readOnly?: boolean
  currency?: string
  showAuditMode?: boolean  // Show all editable controls
}

function formatAmount(n: number, currency: string = 'MUR'): string {
  if (n === 0) return '–'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n) + ' ' + currency
}

function EditableLine({
  line,
  onEdit,
  readOnly,
  currency,
}: {
  line: BilanLine
  onEdit?: (newAmount: number, notes: string) => void
  readOnly: boolean
  currency: string
}) {
  const [editing, setEditing] = useState(false)
  const [editAmount, setEditAmount] = useState(line.amount)
  const [editNotes, setEditNotes] = useState(line.notes || '')
  const adjusted = line.notes && line.notes.length > 0

  const handleSave = () => {
    if (onEdit) onEdit(editAmount, editNotes)
    setEditing(false)
  }

  return (
    <tr className={`border-t hover:bg-blue-50/30 ${adjusted ? 'bg-yellow-50/40' : ''}`}>
      <td className="px-3 py-1.5 text-xs font-mono text-gray-500 w-12">{line.code}</td>
      <td className="px-3 py-1.5 text-sm">
        {line.label}
        {adjusted && (
          <span className="ml-2 inline-block w-2 h-2 rounded-full bg-orange-400" title={`Ajustement: ${line.notes}`}></span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        {editing ? (
          <div className="flex gap-1 items-center">
            <input
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(Number(e.target.value))}
              className="w-28 px-2 py-1 border rounded text-right font-mono text-sm"
              autoFocus
            />
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-700 text-sm"
              title="Sauvegarder"
            >
              ✓
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-red-500 hover:text-red-700 text-sm"
              title="Annuler"
            >
              ✕
            </button>
          </div>
        ) : (
          <span className={`font-mono text-sm ${adjusted ? 'text-orange-700 font-medium' : ''}`}>
            {formatAmount(line.amount, currency)}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">
        {line.comparativeAmount !== undefined ? formatAmount(line.comparativeAmount, currency) : ''}
      </td>
      {!readOnly && line.isEditable && (
        <td className="px-2 w-8">
          {!editing && (
            <button
              onClick={() => {
                setEditAmount(line.amount)
                setEditNotes(line.notes || '')
                setEditing(true)
              }}
              className="text-gray-400 hover:text-blue-600 text-sm"
              title="Modifier"
            >
              ✏
            </button>
          )}
        </td>
      )}
    </tr>
  )
}

export function EditableBilan({
  actif,
  passif,
  onLineEdit,
  readOnly = false,
  currency = 'MUR',
  showAuditMode = false,
}: EditableBilanProps) {
  const totalActif = actif.reduce((s, sec) => s + sec.lines.reduce((ss, l) => ss + l.amount, 0), 0)
  const totalPassif = passif.reduce((s, sec) => s + sec.lines.reduce((ss, l) => ss + l.amount, 0), 0)
  const balanced = Math.abs(totalActif - totalPassif) < 1

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Bilan {showAuditMode && '(Mode Audit)'}</h2>
            <p className="text-xs text-gray-600">Lignes ajustables par l&apos;expert-comptable</p>
          </div>
          <div className="flex items-center gap-2">
            {balanced ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                ✓ Équilibré
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                ⚠ Déséquilibre: {formatAmount(totalActif - totalPassif, currency)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
        {/* ACTIF */}
        <div className="bg-white">
          <table className="w-full">
            <thead className="bg-blue-100">
              <tr>
                <th colSpan={5} className="px-3 py-2 text-left text-sm font-bold">ACTIF</th>
              </tr>
              <tr className="bg-blue-50 text-xs">
                <th className="px-3 py-1 text-left w-12">Code</th>
                <th className="px-3 py-1 text-left">Libellé</th>
                <th className="px-3 py-1 text-right w-32">N</th>
                <th className="px-3 py-1 text-right w-28">N-1</th>
                {!readOnly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {actif.map((section, si) => (
                <>
                  <tr key={`s-${si}`} className="bg-gray-100 border-t">
                    <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase text-gray-700">
                      {section.title}
                    </td>
                  </tr>
                  {section.lines.map((line, li) => (
                    <EditableLine
                      key={`a-${si}-${li}`}
                      line={line}
                      readOnly={readOnly}
                      currency={currency}
                      onEdit={(amount, notes) => onLineEdit?.('actif', line.code, amount, notes)}
                    />
                  ))}
                </>
              ))}
              <tr className="border-t-2 border-blue-500 bg-blue-50">
                <td colSpan={2} className="px-3 py-2 font-bold text-sm">TOTAL ACTIF</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-sm">
                  {formatAmount(totalActif, currency)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PASSIF */}
        <div className="bg-white">
          <table className="w-full">
            <thead className="bg-purple-100">
              <tr>
                <th colSpan={5} className="px-3 py-2 text-left text-sm font-bold">PASSIF</th>
              </tr>
              <tr className="bg-purple-50 text-xs">
                <th className="px-3 py-1 text-left w-12">Code</th>
                <th className="px-3 py-1 text-left">Libellé</th>
                <th className="px-3 py-1 text-right w-32">N</th>
                <th className="px-3 py-1 text-right w-28">N-1</th>
                {!readOnly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {passif.map((section, si) => (
                <>
                  <tr key={`p-${si}`} className="bg-gray-100 border-t">
                    <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase text-gray-700">
                      {section.title}
                    </td>
                  </tr>
                  {section.lines.map((line, li) => (
                    <EditableLine
                      key={`p-${si}-${li}`}
                      line={line}
                      readOnly={readOnly}
                      currency={currency}
                      onEdit={(amount, notes) => onLineEdit?.('passif', line.code, amount, notes)}
                    />
                  ))}
                </>
              ))}
              <tr className="border-t-2 border-purple-500 bg-purple-50">
                <td colSpan={2} className="px-3 py-2 font-bold text-sm">TOTAL PASSIF</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-sm">
                  {formatAmount(totalPassif, currency)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-600 flex items-center justify-between">
        <span>📌 Lignes en jaune = ajustements de l&apos;expert</span>
        <span>{readOnly ? 'Mode lecture seule' : 'Mode édition active'}</span>
      </div>
    </div>
  )
}
