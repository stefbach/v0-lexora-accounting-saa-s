"use client"

/**
 * CatalogueImportDialog — import en masse de produits/services dans le
 * catalogue (factures_catalogue, mig 239) depuis un fichier CSV ou Excel.
 *
 * Workflow :
 *   1. L'utilisateur dépose un fichier (CSV/XLSX)
 *   2. xlsx parse en JSON
 *   3. Mapping souple des colonnes (description / prix / devise / etc.)
 *      → on accepte les variantes de noms en français comme en anglais
 *   4. Preview tabulaire avec validation ligne par ligne
 *   5. Confirmation → POST /api/client/catalogue avec { items: [...] }
 *      (endpoint bulk déjà en place depuis la PR #54, max 500 items)
 */

import { useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import * as XLSX from "xlsx"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  societeId: string | null
  /** Appelé après import réussi pour rafraîchir la liste parent. */
  onImported?: (count: number) => void
}

interface ParsedRow {
  description: string
  prix_unitaire: number
  devise: string
  tva_applicable: boolean
  categorie: string | null
  unite: string
  // Validation
  _valid: boolean
  _error: string | null
  _rowIndex: number
}

const DEVISES_OK = ["MUR", "EUR", "USD", "GBP"] as const

/**
 * Mapping souple : on accepte plusieurs variantes de noms de colonnes
 * (case insensitive, espaces tolérés). L'utilisateur peut exporter
 * depuis Excel/Google Sheets sans s'inquiéter du format exact.
 */
const COL_ALIASES: Record<keyof Omit<ParsedRow, '_valid' | '_error' | '_rowIndex'>, string[]> = {
  description: ['description', 'nom', 'libellé', 'libelle', 'name', 'item', 'service', 'produit', 'product'],
  prix_unitaire: ['prix', 'prix unitaire', 'prix_unitaire', 'price', 'unit price', 'tarif', 'montant'],
  devise: ['devise', 'currency', 'monnaie'],
  tva_applicable: ['tva', 'tva applicable', 'vat', 'tva_applicable', 'taxable'],
  categorie: ['categorie', 'catégorie', 'category', 'famille', 'group'],
  unite: ['unite', 'unité', 'unit', 'unité de mesure'],
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function pickValue(row: Record<string, any>, aliases: string[]): any {
  const normalizedRow: Record<string, any> = {}
  for (const k of Object.keys(row)) {
    normalizedRow[normalizeKey(k)] = row[k]
  }
  for (const a of aliases) {
    const v = normalizedRow[normalizeKey(a)]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

function parseBoolean(v: any): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v || '').trim().toLowerCase()
  if (['oui', 'yes', 'true', '1', 'y', 'x', '✓'].includes(s)) return true
  if (['non', 'no', 'false', '0', 'n', ''].includes(s)) return false
  return true // défaut TVA applicable
}

function parseRow(row: Record<string, any>, idx: number): ParsedRow {
  const description = String(pickValue(row, COL_ALIASES.description) || '').trim()
  const prixRaw = pickValue(row, COL_ALIASES.prix_unitaire)
  // Tolère "1,500.00", "1 500", "1500.00"
  const prixClean = typeof prixRaw === 'number'
    ? prixRaw
    : parseFloat(String(prixRaw || '0').replace(/[\s,](?=\d{3})/g, '').replace(',', '.'))
  const prix_unitaire = Number.isFinite(prixClean) ? prixClean : NaN
  const deviseRaw = String(pickValue(row, COL_ALIASES.devise) || 'MUR').trim().toUpperCase()
  const devise = (DEVISES_OK as readonly string[]).includes(deviseRaw) ? deviseRaw : 'MUR'
  const tvaRaw = pickValue(row, COL_ALIASES.tva_applicable)
  const tva_applicable = tvaRaw === null ? true : parseBoolean(tvaRaw)
  const categorieRaw = pickValue(row, COL_ALIASES.categorie)
  const categorie = categorieRaw ? String(categorieRaw).trim().slice(0, 100) || null : null
  const uniteRaw = pickValue(row, COL_ALIASES.unite)
  const unite = uniteRaw ? String(uniteRaw).trim().slice(0, 50) || 'Forfait' : 'Forfait'

  let error: string | null = null
  let valid = true
  if (!description) {
    error = 'description manquante'
    valid = false
  } else if (description.length > 500) {
    error = 'description trop longue (max 500)'
    valid = false
  } else if (!Number.isFinite(prix_unitaire) || prix_unitaire < 0) {
    error = 'prix invalide'
    valid = false
  }

  return {
    description,
    prix_unitaire: Number.isFinite(prix_unitaire) ? prix_unitaire : 0,
    devise,
    tva_applicable,
    categorie,
    unite,
    _valid: valid,
    _error: error,
    _rowIndex: idx + 2, // +2 car ligne 1 = header, idx commence à 0
  }
}

export function CatalogueImportDialog({ open, onOpenChange, societeId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  const stats = useMemo(() => {
    const valid = rows.filter(r => r._valid).length
    const invalid = rows.length - valid
    return { total: rows.length, valid, invalid }
  }, [rows])

  function reset() {
    setRows([])
    setError(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) throw new Error('Fichier vide')
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null })
      if (data.length === 0) throw new Error('Aucune ligne trouvée dans le fichier')
      if (data.length > 500) throw new Error(`Max 500 lignes par import. Reçu : ${data.length}`)
      const parsed = data.map((row, i) => parseRow(row, i))
      setRows(parsed)
    } catch (e: any) {
      setError(e?.message || 'Erreur de parsing du fichier')
      setRows([])
    } finally {
      setParsing(false)
    }
  }

  async function handleImport() {
    if (!societeId) return
    const validRows = rows.filter(r => r._valid)
    if (validRows.length === 0) {
      setError('Aucune ligne valide à importer')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const items = validRows.map(r => ({
        description: r.description,
        prix_unitaire: r.prix_unitaire,
        devise: r.devise,
        tva_applicable: r.tva_applicable,
        categorie: r.categorie,
        unite: r.unite,
        actif: true,
      }))
      const res = await fetch(`/api/client/catalogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur import')
      setResult({ inserted: data.inserted || 0, skipped: rows.length - (data.inserted || 0) })
      onImported?.(data.inserted || 0)
    } catch (e: any) {
      setError(e?.message || 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    // Génère un fichier XLSX modèle avec headers + 1 ligne d'exemple
    const ws = XLSX.utils.json_to_sheet([
      {
        description: 'Prestation comptable mensuelle',
        prix_unitaire: 1500,
        devise: 'MUR',
        tva_applicable: 'oui',
        categorie: 'Comptabilité',
        unite: 'Mois',
      },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Catalogue')
    XLSX.writeFile(wb, 'lexora-catalogue-template.xlsx')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Importer un catalogue
          </DialogTitle>
          <DialogDescription>
            Importez en masse vos services/produits depuis un fichier CSV ou Excel.
            Max 500 lignes par import.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1 — file picker */}
        {rows.length === 0 && !result && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:bg-indigo-50/50 transition cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-indigo-600 mb-2" />
              <p className="text-sm font-medium">Cliquez ou déposez votre fichier ici</p>
              <p className="text-xs text-gray-500 mt-1">Formats acceptés : .csv, .xlsx, .xls</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">📋 Colonnes attendues (variantes acceptées) :</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li><strong>description</strong> · nom · libellé · service · produit (obligatoire)</li>
                <li><strong>prix_unitaire</strong> · prix · tarif · montant (obligatoire, ≥ 0)</li>
                <li><strong>devise</strong> · currency : MUR / EUR / USD / GBP (défaut MUR)</li>
                <li><strong>tva_applicable</strong> · vat : oui/non/true/false (défaut oui)</li>
                <li><strong>categorie</strong> · catégorie · family</li>
                <li><strong>unite</strong> · unit : Heure, Jour, Mois, Forfait, Unité…</li>
              </ul>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="w-full"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Télécharger un fichier modèle .xlsx
            </Button>

            {parsing && (
              <p className="text-sm text-center text-gray-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />Analyse du fichier…</p>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertTriangle className="inline w-4 h-4 mr-1" />{error}
              </p>
            )}
          </div>
        )}

        {/* Step 2 — preview */}
        {rows.length > 0 && !result && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-2 text-sm">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {stats.valid} valides
              </Badge>
              {stats.invalid > 0 && (
                <Badge className="bg-red-100 text-red-700 border-red-300">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {stats.invalid} erreurs
                </Badge>
              )}
              <span className="text-xs text-gray-500">{stats.total} lignes au total</span>
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 w-10">Ligne</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2 w-24">Prix</th>
                    <th className="text-left p-2 w-16">Devise</th>
                    <th className="text-left p-2 w-16">TVA</th>
                    <th className="text-left p-2">Catégorie</th>
                    <th className="text-left p-2">Unité</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r._valid ? '' : 'bg-red-50'}`}>
                      <td className="p-2 text-gray-400">L{r._rowIndex}</td>
                      <td className="p-2">
                        {r.description || <span className="text-red-600 italic">manquant</span>}
                        {r._error && <div className="text-[10px] text-red-600 mt-0.5">⚠ {r._error}</div>}
                      </td>
                      <td className="p-2 text-right font-mono">{r.prix_unitaire.toFixed(2)}</td>
                      <td className="p-2">{r.devise}</td>
                      <td className="p-2">{r.tva_applicable ? '15%' : '0%'}</td>
                      <td className="p-2 text-gray-600">{r.categorie || '—'}</td>
                      <td className="p-2 text-gray-600">{r.unite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mt-2">
                <AlertTriangle className="inline w-4 h-4 mr-1" />{error}
              </p>
            )}
          </div>
        )}

        {/* Step 3 — result */}
        {result && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
            <p className="text-lg font-semibold text-emerald-700">Import terminé</p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>{result.inserted}</strong> article(s) ajouté(s) au catalogue.
              {result.skipped > 0 && <> {result.skipped} ligne(s) ignorée(s).</>}
            </p>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          {rows.length > 0 && !result && (
            <Button variant="ghost" onClick={reset}>
              Changer de fichier
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
              {result ? 'Fermer' : 'Annuler'}
            </Button>
            {rows.length > 0 && !result && (
              <Button
                onClick={handleImport}
                disabled={importing || stats.valid === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Importer {stats.valid} article(s)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
