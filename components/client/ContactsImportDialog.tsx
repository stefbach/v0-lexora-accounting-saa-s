"use client"

/**
 * ContactsImportDialog — import en masse de contacts clients depuis
 * un fichier CSV ou Excel.
 *
 * Mêmes principes que CatalogueImportDialog : mapping souple FR/EN,
 * validation ligne par ligne, preview avant import, modèle XLSX
 * téléchargeable. Appelle POST /api/client/factures-contacts en mode
 * bulk { items: [...] } (endpoint créé en PR #55, max 500 items).
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
  onImported?: (count: number) => void
}

interface ParsedRow {
  nom: string
  entreprise: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  pays: string | null
  email: string | null
  telephone: string | null
  mobile: string | null
  fax: string | null
  vat_number: string | null
  brn: string | null
  kbis: string | null
  site_web: string | null
  devise: string
  conditions_paiement: number
  offshore: boolean
  _valid: boolean
  _error: string | null
  _rowIndex: number
}

const DEVISES_OK = ["MUR", "EUR", "USD", "GBP"] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COL_ALIASES: Record<string, string[]> = {
  nom: ['nom', 'name', 'contact', 'client', 'prenom nom'],
  entreprise: ['entreprise', 'company', 'societe', 'société', 'raison sociale'],
  adresse: ['adresse', 'address', 'rue', 'street'],
  code_postal: ['code postal', 'code_postal', 'cp', 'zip', 'zipcode', 'postcode'],
  ville: ['ville', 'city', 'commune'],
  pays: ['pays', 'country'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'téléphone fixe', 'fixe'],
  mobile: ['mobile', 'gsm', 'portable', 'cellphone'],
  fax: ['fax'],
  vat_number: ['vat', 'vat number', 'vat_number', 'n. tva', 'tva', 'numero tva'],
  brn: ['brn', 'business registration', 'numero brn'],
  kbis: ['kbis', 'siren', 'siret', 'rcs', 'identifiant legal'],
  site_web: ['site web', 'site_web', 'website', 'web', 'url'],
  devise: ['devise', 'currency'],
  conditions_paiement: ['conditions paiement', 'conditions_paiement', 'délai paiement', 'delai paiement', 'payment terms', 'payment_terms'],
  offshore: ['offshore', 'export', 'zero rated', 'tva 0'],
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function pickValue(row: Record<string, any>, aliases: string[]): any {
  const normalized: Record<string, any> = {}
  for (const k of Object.keys(row)) normalized[normalizeKey(k)] = row[k]
  for (const a of aliases) {
    const v = normalized[normalizeKey(a)]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}
function parseBoolean(v: any): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v || '').trim().toLowerCase()
  return ['oui', 'yes', 'true', '1', 'y', 'x', '✓'].includes(s)
}

function parseRow(row: Record<string, any>, idx: number): ParsedRow {
  const nom = String(pickValue(row, COL_ALIASES.nom) || '').trim()
  const email = String(pickValue(row, COL_ALIASES.email) || '').trim()
  const deviseRaw = String(pickValue(row, COL_ALIASES.devise) || 'MUR').trim().toUpperCase()
  const devise = (DEVISES_OK as readonly string[]).includes(deviseRaw) ? deviseRaw : 'MUR'
  const cpRaw = pickValue(row, COL_ALIASES.conditions_paiement)
  const cp = cpRaw === null ? 30 : Number(cpRaw)
  const conditions_paiement = Number.isFinite(cp) && cp >= 0 && cp <= 365 ? Math.floor(cp) : 30

  let error: string | null = null
  let valid = true
  if (!nom) {
    error = 'nom manquant'
    valid = false
  } else if (nom.length > 200) {
    error = 'nom trop long (max 200)'
    valid = false
  } else if (email && !EMAIL_RE.test(email)) {
    error = `email invalide : ${email}`
    valid = false
  }

  const str = (key: string, max: number): string | null => {
    const v = pickValue(row, COL_ALIASES[key])
    return v ? String(v).trim().slice(0, max) || null : null
  }

  return {
    nom,
    entreprise: str('entreprise', 200),
    adresse: str('adresse', 500),
    code_postal: str('code_postal', 20),
    ville: str('ville', 100),
    pays: str('pays', 100),
    email: email || null,
    telephone: str('telephone', 50),
    mobile: str('mobile', 50),
    fax: str('fax', 50),
    vat_number: str('vat_number', 50),
    brn: str('brn', 50),
    kbis: str('kbis', 50),
    site_web: str('site_web', 200),
    devise,
    conditions_paiement,
    offshore: parseBoolean(pickValue(row, COL_ALIASES.offshore)),
    _valid: valid,
    _error: error,
    _rowIndex: idx + 2,
  }
}

export function ContactsImportDialog({ open, onOpenChange, societeId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  const stats = useMemo(() => {
    const valid = rows.filter(r => r._valid).length
    return { total: rows.length, valid, invalid: rows.length - valid }
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
      setRows(data.map((row, i) => parseRow(row, i)))
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
      const items = validRows.map(({ _valid, _error, _rowIndex, ...r }) => ({ ...r, actif: true }))
      const res = await fetch(`/api/client/factures-contacts`, {
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
    const ws = XLSX.utils.json_to_sheet([
      {
        nom: 'John Doe',
        entreprise: 'ACME Ltd',
        adresse: '12 Royal Road',
        code_postal: '11328',
        ville: 'Port Louis',
        pays: 'Maurice',
        email: 'john@acme.mu',
        telephone: '+230 1 234 5678',
        mobile: '+230 5 123 4567',
        vat_number: 'VAT12345',
        brn: 'C12345678',
        kbis: '',
        site_web: 'https://acme.mu',
        devise: 'MUR',
        conditions_paiement: 30,
        offshore: 'non',
      },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
    XLSX.writeFile(wb, 'lexora-contacts-template.xlsx')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-sky-600" />
            Importer un carnet de contacts
          </DialogTitle>
          <DialogDescription>
            Importez en masse vos contacts clients depuis un fichier CSV ou Excel.
            Max 500 contacts par import.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 && !result && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-sky-300 rounded-lg p-8 text-center hover:bg-sky-50/50 transition cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-sky-600 mb-2" />
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
              <p className="font-semibold">📋 Colonnes acceptées (variantes possibles) :</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 list-disc list-inside">
                <li><strong>nom</strong> · name · contact (obligatoire)</li>
                <li><strong>entreprise</strong> · company · société</li>
                <li><strong>adresse</strong> · address · rue</li>
                <li><strong>code_postal</strong> · cp · zip</li>
                <li><strong>ville</strong> · city</li>
                <li><strong>pays</strong> · country</li>
                <li><strong>email</strong> · mail</li>
                <li><strong>telephone</strong> · tel · phone · fixe</li>
                <li><strong>mobile</strong> · gsm · portable</li>
                <li><strong>fax</strong></li>
                <li><strong>vat_number</strong> · tva · n. tva</li>
                <li><strong>brn</strong> (Maurice)</li>
                <li><strong>kbis</strong> · siren · siret · rcs</li>
                <li><strong>site_web</strong> · website</li>
                <li><strong>devise</strong> · MUR/EUR/USD/GBP</li>
                <li><strong>conditions_paiement</strong> · délai (0-365 j)</li>
                <li><strong>offshore</strong> · oui/non</li>
              </ul>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="w-full">
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
                    <th className="text-left p-2">Nom</th>
                    <th className="text-left p-2">Entreprise</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Ville</th>
                    <th className="text-left p-2">VAT / BRN</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r._valid ? '' : 'bg-red-50'}`}>
                      <td className="p-2 text-gray-400">L{r._rowIndex}</td>
                      <td className="p-2">
                        {r.nom || <span className="text-red-600 italic">manquant</span>}
                        {r._error && <div className="text-[10px] text-red-600 mt-0.5">⚠ {r._error}</div>}
                      </td>
                      <td className="p-2 text-gray-600">{r.entreprise || '—'}</td>
                      <td className="p-2 text-gray-600">{r.email || '—'}</td>
                      <td className="p-2 text-gray-600">{[r.code_postal, r.ville].filter(Boolean).join(' ') || '—'}</td>
                      <td className="p-2 text-gray-600 text-[10px]">
                        {r.vat_number && <div>VAT: {r.vat_number}</div>}
                        {r.brn && <div>BRN: {r.brn}</div>}
                        {!r.vat_number && !r.brn && '—'}
                      </td>
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

        {result && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
            <p className="text-lg font-semibold text-emerald-700">Import terminé</p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>{result.inserted}</strong> contact(s) ajouté(s) au carnet.
              {result.skipped > 0 && <> {result.skipped} ligne(s) ignorée(s).</>}
            </p>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          {rows.length > 0 && !result && (
            <Button variant="ghost" onClick={reset}>Changer de fichier</Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
              {result ? 'Fermer' : 'Annuler'}
            </Button>
            {rows.length > 0 && !result && (
              <Button
                onClick={handleImport}
                disabled={importing || stats.valid === 0}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Importer {stats.valid} contact(s)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
