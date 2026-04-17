"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface ParsedRow {
  tiers: string
  numero_facture: string
  date_facture: string
  date_echeance?: string
  montant_ht?: number
  montant_tva?: number
  montant_ttc: number
  devise?: string
  type_facture?: string
  statut?: string
  description?: string
  _error?: string
}

const TEMPLATE_CSV = `tiers,numero_facture,date_facture,date_echeance,montant_ht,montant_tva,montant_ttc,devise,type_facture,statut,description
"Mauritius Telecom","INV-2026-001","2026-01-15","2026-02-14",195.65,29.35,225.00,"MUR","fournisseur","en_attente","Facture telecom janvier"
"Cellplus Mobile","INV-2026-002","2026-01-20","2026-02-19",870.00,130.00,1000.00,"MUR","fournisseur","en_attente","Abonnement mobile"`

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  // Split respecting quoted commas
  const parseRow = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { inQuote = !inQuote }
      else if (c === ',' && !inQuote) { out.push(cur); cur = '' }
      else cur += c
    }
    out.push(cur)
    return out
  }
  const headers = parseRow(lines[0]).map(h => h.trim().toLowerCase())
  const required = ['tiers', 'numero_facture', 'date_facture', 'montant_ttc']
  const missing = required.filter(r => !headers.includes(r))
  if (missing.length > 0) {
    throw new Error(`Colonnes manquantes : ${missing.join(', ')}`)
  }
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i])
    const obj: any = {}
    headers.forEach((h, idx) => { obj[h] = cells[idx]?.trim() })
    const row: ParsedRow = {
      tiers: obj.tiers,
      numero_facture: obj.numero_facture,
      date_facture: obj.date_facture,
      date_echeance: obj.date_echeance || undefined,
      montant_ht: obj.montant_ht ? parseFloat(obj.montant_ht) : undefined,
      montant_tva: obj.montant_tva ? parseFloat(obj.montant_tva) : undefined,
      montant_ttc: parseFloat(obj.montant_ttc) || 0,
      devise: obj.devise || 'MUR',
      type_facture: obj.type_facture || 'fournisseur',
      statut: obj.statut || 'en_attente',
      description: obj.description || undefined,
    }
    if (!row.tiers || !row.numero_facture || !row.date_facture || !row.montant_ttc) {
      row._error = 'Champs requis manquants'
    }
    rows.push(row)
  }
  return rows
}

export default function ImportFacturesPage() {
  const { societeId } = useSocieteActive()
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseCSV(String(reader.result))
        setRows(parsed)
        setToast({ type: 'success', message: `${parsed.length} lignes chargees` })
      } catch (err: any) {
        setToast({ type: 'error', message: err.message })
        setRows([])
      }
    }
    reader.readAsText(file)
  }

  const doImport = async () => {
    if (!societeId || rows.length === 0) return
    const validRows = rows.filter(r => !r._error)
    if (validRows.length === 0) {
      setToast({ type: 'error', message: 'Aucune ligne valide' })
      return
    }
    setImporting(true)
    setResult(null)
    try {
      const res = await fetch("/api/comptable/factures/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, rows: validRows }),
      })
      const d = await res.json()
      setResult(d)
      if (res.ok) {
        setToast({ type: 'success', message: `✓ ${d.imported} factures importees` })
      } else {
        setToast({ type: 'error', message: d.error || 'Erreur import' })
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template_factures.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validCount = rows.filter(r => !r._error).length
  const errorCount = rows.filter(r => !!r._error).length

  return (
    <div className="p-6 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E] flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6" /> Import CSV factures
        </h1>
        <p className="text-sm text-gray-500">Importer des factures fournisseurs ou clients en lot depuis un fichier CSV</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Étapes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-1" /> Télécharger le modèle CSV
            </Button>
            <span className="text-xs text-slate-500">
              Colonnes requises : tiers, numero_facture, date_facture, montant_ttc
            </span>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <label className="flex items-center gap-2 px-3 py-1.5 border rounded cursor-pointer hover:bg-slate-50 text-sm">
              <Upload className="w-4 h-4" />
              <span>{fileName || 'Choisir un CSV'}</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
            {rows.length > 0 && (
              <>
                <Badge className="bg-emerald-100 text-emerald-800 border-0">{validCount} valides</Badge>
                {errorCount > 0 && <Badge className="bg-red-100 text-red-800 border-0">{errorCount} erreurs</Badge>}
                <Button
                  onClick={doImport}
                  disabled={importing || validCount === 0 || !societeId}
                  className="bg-[#D4AF37] text-[#0B0F2E]"
                >
                  {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  Importer {validCount} factures
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setRows([]); setFileName(""); setResult(null) }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.success ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}>
          <CardContent className="p-4 flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {result.success ? `Import réussi : ${result.imported} factures` : `Import échoué : ${result.error}`}
              </p>
              {result.errors?.length > 0 && (
                <ul className="text-xs mt-2 space-y-0.5">
                  {result.errors.map((e: any, i: number) => (
                    <li key={i}>• {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Aperçu ({rows.length} lignes)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Tiers</TableHead>
                  <TableHead>N° facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 100).map((r, i) => (
                  <TableRow key={i} className={r._error ? "bg-red-50" : ""}>
                    <TableCell>
                      {r._error ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.tiers}</TableCell>
                    <TableCell className="font-mono text-sm">{r.numero_facture}</TableCell>
                    <TableCell className="text-sm">{r.date_facture}</TableCell>
                    <TableCell className="text-right text-sm">{r.montant_ttc?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{r.devise}</TableCell>
                    <TableCell className="text-sm">{r.type_facture}</TableCell>
                    <TableCell className="text-sm">{r.statut}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 100 && (
              <div className="p-2 text-xs text-slate-500 border-t">
                ... et {rows.length - 100} lignes supplementaires (non affichees)
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
