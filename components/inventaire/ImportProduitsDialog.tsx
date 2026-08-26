"use client"

/**
 * ImportProduitsDialog — import en masse de produits (CSV / Excel).
 *
 * Flux : fichier → parse client (SheetJS) → auto-mapping des colonnes →
 * aperçu + ajustement du mapping → envoi à /api/client/inventaire/produits/import
 * → rapport (créés / stock initialisé / erreurs ligne par ligne).
 *
 * La logique pure (mapping, parsing nombres, coercition) vit dans
 * lib/import/products-import.ts (testée) ; ce composant n'est que l'UI.
 */

import { useCallback, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, UploadCloud, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react"
import { parseSpreadsheet, aoaToXlsxBuffer } from "@/lib/import/spreadsheet"
import {
  PRODUCT_IMPORT_FIELDS, autoMapHeaders, coerceProductRow, buildTemplateAoA,
  type CanonicalField,
} from "@/lib/import/products-import"

type Step = "choose" | "map" | "result"

interface ImportResult {
  created: number
  stock_seeded: number
  failed: number
  total: number
  errors: Array<{ ligne: number; sku?: string; error: string }>
}

const PREVIEW_ROWS = 8

export function ImportProduitsDialog({
  societeId, open, onOpenChange, onImported,
}: {
  societeId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: (summary: string) => void
}) {
  const [step, setStep] = useState<Step>("choose")
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<(CanonicalField | null)[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep("choose"); setFileName(""); setHeaders([]); setRows([])
    setMapping([]); setParseError(null); setResult(null); setImporting(false)
  }, [])

  const close = useCallback((v: boolean) => { if (!v) reset(); onOpenChange(v) }, [onOpenChange, reset])

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setParseError(null); setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseSpreadsheet(buf)
      if (!parsed.headers.length) { setParseError("Aucune colonne détectée dans le fichier."); return }
      if (!parsed.rows.length) { setParseError("Le fichier ne contient aucune ligne de données."); return }
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(autoMapHeaders(parsed.headers))
      setStep("map")
    } catch (e: any) {
      setParseError(e?.message || "Impossible de lire le fichier (formats acceptés : .csv, .xlsx, .xls).")
    }
  }, [])

  const skuMapped = mapping.includes("sku")
  const designationMapped = mapping.includes("designation")
  const canImport = skuMapped && designationMapped && rows.length > 0

  // Aperçu coercé (premières lignes) pour montrer ce qui sera importé.
  const preview = useMemo(() => {
    if (step !== "map") return []
    return rows.slice(0, PREVIEW_ROWS).map((r) => coerceProductRow(r, headers, mapping))
  }, [rows, headers, mapping, step])

  const setColumn = (index: number, value: string) => {
    setMapping((prev) => {
      const next = [...prev]
      const field = (value || null) as CanonicalField | null
      // Une colonne canonique ne peut être affectée qu'une fois.
      if (field) next.forEach((f, i) => { if (i !== index && f === field) next[i] = null })
      next[index] = field
      return next
    })
  }

  const downloadTemplate = useCallback(() => {
    const buf = aoaToXlsxBuffer(buildTemplateAoA(), "Produits")
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "modele_import_produits.xlsx"; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  const runImport = useCallback(async () => {
    if (!societeId || !canImport) return
    setImporting(true)
    try {
      const payloadRows: Record<string, unknown>[] = rows
        .map((r): Record<string, unknown> => {
          const { payload, stock_initial, cout_unitaire_initial } = coerceProductRow(r, headers, mapping)
          return { ...payload, stock_initial, cout_unitaire_initial }
        })
        .filter((r) => r.sku || r.designation) // ignore les lignes totalement vides
      const res = await fetch("/api/client/inventaire/produits/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, rows: payloadRows }),
      })
      const data = await res.json()
      if (!res.ok) { setParseError(data?.error || "Échec de l'import"); setImporting(false); return }
      setResult(data as ImportResult)
      setStep("result")
      onImported(`${data.created} produit(s) importé(s)${data.failed ? `, ${data.failed} en erreur` : ""}`)
    } catch (e: any) {
      setParseError(e?.message || "Erreur réseau")
    } finally {
      setImporting(false)
    }
  }, [societeId, canImport, rows, headers, mapping, onImported])

  const downloadErrors = useCallback(() => {
    if (!result?.errors?.length) return
    const aoa: (string | number)[][] = [["Ligne", "SKU", "Erreur"],
      ...result.errors.map((e) => [e.ligne, e.sku || "", e.error])]
    const buf = aoaToXlsxBuffer(aoa, "Erreurs")
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "erreurs_import_produits.xlsx"; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [result])

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Importer des produits (CSV / Excel)
          </DialogTitle>
        </DialogHeader>

        {/* Étape 1 — choix du fichier */}
        {step === "choose" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
            >
              <UploadCloud className="h-10 w-10 mx-auto text-slate-400 mb-2" />
              <p className="font-medium">Glissez un fichier ici ou cliquez pour parcourir</p>
              <p className="text-sm text-slate-500 mt-1">Formats acceptés : .csv, .xlsx, .xls — jusqu'à 1000 produits</p>
              <input
                ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
            {parseError && (
              <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {parseError}</p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Pas de fichier ? Partez du modèle prérempli.</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Télécharger le modèle
              </Button>
            </div>
          </div>
        )}

        {/* Étape 2 — mapping + aperçu */}
        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <span className="font-medium">{fileName}</span> — {rows.length} ligne(s) détectée(s)
              </div>
              <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4 mr-1" /> Changer de fichier</Button>
            </div>

            {!canImport && (
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Associez au minimum les colonnes <strong>SKU</strong> et <strong>Désignation</strong>.
              </p>
            )}

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-medium">Colonne du fichier</th>
                    <th className="text-left p-2 font-medium">→ Champ Lexora</th>
                    <th className="text-left p-2 font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono text-xs">{h}</td>
                      <td className="p-2">
                        <select
                          className="border rounded px-2 py-1 text-sm bg-white"
                          value={mapping[i] || ""}
                          onChange={(e) => setColumn(i, e.target.value)}
                        >
                          <option value="">— Ignorer —</option>
                          {PRODUCT_IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-slate-500 truncate max-w-[180px]">{String(rows[0]?.[h] ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Aperçu ({Math.min(PREVIEW_ROWS, rows.length)} première(s) ligne(s))</p>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2">SKU</th><th className="text-left p-2">Désignation</th>
                      <th className="text-right p-2">Prix HT</th><th className="text-right p-2">Stock init.</th>
                      <th className="text-right p-2">Coût</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => {
                      const ok = p.payload.sku && p.payload.designation
                      return (
                        <tr key={i} className="border-t">
                          <td className="p-2 font-mono">{String(p.payload.sku ?? "") || <span className="text-red-500">manquant</span>}</td>
                          <td className="p-2">{String(p.payload.designation ?? "") || <span className="text-red-500">manquant</span>}</td>
                          <td className="p-2 text-right">{p.payload.prix_vente_ht != null ? String(p.payload.prix_vente_ht) : "—"}</td>
                          <td className="p-2 text-right">{p.stock_initial || "—"}</td>
                          <td className="p-2 text-right">{p.cout_unitaire_initial != null ? String(p.cout_unitaire_initial) : "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {parseError && (
              <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {parseError}</p>
            )}
          </div>
        )}

        {/* Étape 3 — résultat */}
        {step === "result" && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{result.created}</div>
                <div className="text-xs text-slate-500">Produits créés</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-sky-600">{result.stock_seeded}</div>
                <div className="text-xs text-slate-500">Stock initialisé</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className={`text-2xl font-bold ${result.failed ? "text-red-600" : "text-slate-400"}`}>{result.failed}</div>
                <div className="text-xs text-slate-500">En erreur</div>
              </div>
            </div>
            {result.failed > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-red-700 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Lignes non importées
                  </span>
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <Download className="h-4 w-4 mr-1" /> Exporter les erreurs
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-mono text-slate-500">L{e.ligne}</span>
                      <span className="font-mono">{e.sku || "—"}</span>
                      <span className="text-red-700">{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Tous les produits ont été importés avec succès.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset} disabled={importing}>Annuler</Button>
              <Button onClick={runImport} disabled={!canImport || importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
                Importer {rows.length} ligne(s)
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => close(false)}>Terminé</Button>
          )}
          {step === "choose" && (
            <Button variant="outline" onClick={() => close(false)}>Fermer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
