"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Download, Users, Banknote, ChevronDown } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

type Step = "upload" | "preview" | "result"

export default function ImportPaiePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState("")
  const [step, setStep] = useState<Step>("upload")

  // Parse results
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState("")
  const [columns, setColumns] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [fileName, setFileName] = useState("")

  // Import results
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[]; total: number } | null>(null)

  // History
  const [history, setHistory] = useState<any[]>([])
  const [historyDetail, setHistoryDetail] = useState<any>(null)
  const [detailBulletins, setDetailBulletins] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const res = await fetch("/api/rh/import-paie?action=history").then(r => r.json()).catch(() => ({ history: [] }))
    setHistory(res.history || [])
  }

  const handleFile = async (file: File) => {
    if (!file) return
    console.log("[import-paie] Selected file:", file.name, file.size, file.type)
    setFileName(file.name)
    setParsing(true)
    setParseError("")
    try {
      if (file.size > 10 * 1024 * 1024) {
        setParseError("Fichier trop volumineux (max 10 MB)")
        return
      }
      const fd = new FormData()
      fd.append("file", file)
      console.log("[import-paie] Uploading to API...")
      const res = await fetch("/api/rh/import-paie", { method: "POST", body: fd })
      console.log("[import-paie] Response status:", res.status)

      if (!res.ok) {
        const text = await res.text()
        console.error("[import-paie] Error response:", text)
        try {
          const errData = JSON.parse(text)
          setParseError(errData.error || `Erreur serveur (${res.status})`)
        } catch {
          setParseError(`Erreur serveur (${res.status}): ${text.substring(0, 200)}`)
        }
        return
      }

      const data = await res.json()
      console.log("[import-paie] Parsed:", data.nb_rows, "rows,", data.columns?.length, "columns")

      if (data.error) { setParseError(data.error); return }
      if (!data.employes || data.employes.length === 0) {
        setParseError("Aucun employé détecté dans le fichier. Vérifiez que le fichier contient des colonnes: Basic Salary, Net Pay, CSG, etc.")
        return
      }

      setColumns(data.columns || [])
      setEmployes(data.employes || [])
      if (data.periode_detected && !periode) setPeriode(data.periode_detected)
      setStep("preview")
    } catch (e: any) {
      console.error("[import-paie] Exception:", e)
      setParseError("Erreur: " + (e.message || "Connexion échouée. Vérifiez votre connexion internet."))
    }
    finally { setParsing(false) }
  }

  const handleImport = async () => {
    if (!societe) { alert("Veuillez sélectionner une société"); return }
    if (!periode) { alert("Veuillez sélectionner la période (mois)"); return }
    if (employes.length === 0) { alert("Aucun employé à importer"); return }
    setImporting(true)
    try {
      console.log(`[import] Importing ${employes.length} employees for ${societe} period ${periode}`)
      const res = await fetch("/api/rh/import-paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", societe_id: societe, periode, employes }),
      })
      const data = await res.json()
      console.log("[import] Result:", data)
      if (data.error) { alert("Erreur: " + data.error); return }
      setResult(data)
      setStep("result")
      loadHistory()
    } catch (e: any) { alert("Erreur réseau: " + (e.message || "")) }
    finally { setImporting(false) }
  }

  const loadDetail = async (p: string) => {
    if (historyDetail === p) { setHistoryDetail(null); return }
    setHistoryDetail(p)
    const res = await fetch(`/api/rh/import-paie?action=detail&periode=${p}`).then(r => r.json()).catch(() => ({ bulletins: [] }))
    setDetailBulletins(res.bulletins || [])
  }

  const totals = employes.reduce((s, e) => ({
    basic: s.basic + (e.salaire_base || 0),
    brut: s.brut + (e.total_payments || e.salaire_base || 0),
    net: s.net + (e.net_pay || 0),
    charges: s.charges + (e.total_er || 0),
    csg: s.csg + (e.csg || 0),
    nsf: s.nsf + (e.nsf || 0),
    paye: s.paye + (e.paye || 0),
    deductions: s.deductions + (e.total_deductions || 0),
    ot: s.ot + (e.overtime_1_5x || 0) + (e.overtime_2x || 0),
  }), { basic: 0, brut: 0, net: 0, charges: 0, csg: 0, nsf: 0, paye: 0, deductions: 0, ot: 0 })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Import Paie Excel</h1>
          <p className="text-gray-500 text-sm">Importez vos rapports de paie — alimente RH + comptabilité</p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="p-8 space-y-4">
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-[#C9A84C] transition-colors"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#C9A84C]', 'bg-[#C9A84C]/5') }}
              onDragLeave={e => { e.currentTarget.classList.remove('border-[#C9A84C]', 'bg-[#C9A84C]/5') }}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#C9A84C]', 'bg-[#C9A84C]/5'); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {parsing ? (
                <div><Loader2 className="h-12 w-12 animate-spin mx-auto mb-3 text-[#C9A84C]" /><p className="text-gray-500">Analyse du fichier <strong>{fileName}</strong> en cours...</p></div>
              ) : (
                <div>
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-lg font-medium" style={{ color: NAVY }}>Glissez votre fichier Excel ici</p>
                  <p className="text-sm text-gray-400 mt-1">ou utilisez le bouton ci-dessous</p>
                </div>
              )}
            </div>

            {/* Input fichier visible */}
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#1E2A4A] file:text-white hover:file:bg-[#2a3d66]"
                disabled={parsing}
              />
              {fileName && !parsing && <Badge variant="outline">{fileName}</Badge>}
            </div>

            <p className="text-xs text-gray-400 text-center">Format attendu : Payroll Report avec colonnes Basic Salary, CSG, NSF, PAYE, Net Pay (.xlsx, .xls, .csv)</p>

            {parseError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm font-medium">Erreur</p>
                <p className="text-red-500 text-sm mt-1">{parseError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Badge style={{ backgroundColor: NAVY }} className="text-white">{fileName}</Badge>
              <Badge variant="outline">{employes.length} employés</Badge>
              <Badge variant="outline">{columns.length} colonnes</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Période :</Label>
              <select value={periode} onChange={e => setPeriode(e.target.value)}
                className="border rounded px-3 py-2 text-sm">
                <option value="">-- Choisir --</option>
                {(() => {
                  const opts = []
                  for (let y = 2026; y >= 2020; y--) {
                    for (let m = 12; m >= 1; m--) {
                      const val = `${y}-${String(m).padStart(2, '0')}`
                      const d = new Date(y, m - 1)
                      const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      opts.push(<option key={val} value={val}>{label}</option>)
                    }
                  }
                  return opts
                })()}
              </select>
              <Button variant="outline" onClick={() => { setStep("upload"); setEmployes([]); setColumns([]) }}>Annuler</Button>
              <Button onClick={handleImport} disabled={importing || !periode || !societe}
                style={{ backgroundColor: !periode || !societe ? '#999' : NAVY }}
                className="text-white">
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {!periode ? "Choisir le mois d'abord" : !societe ? "Choisir la société" : `Importer ${employes.length} employés`}
              </Button>
            </div>
          </div>

          {/* KPIs — indicateurs clés */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">Masse salariale brute</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(totals.brut)}</p>
              <p className="text-xs text-gray-400 mt-1">{employes.length} employés • Basic: {fmt(totals.basic)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">Net à payer</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(totals.net)}</p>
              {totals.net === 0 && totals.brut > 0 && <p className="text-xs text-red-500 mt-1">Colonne "NET Pay" non détectée</p>}
              {totals.net > 0 && <p className="text-xs text-gray-400 mt-1">{Math.round(totals.net / totals.brut * 100)}% du brut</p>}
            </CardContent></Card>
            <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">Retenues salariales</p>
              <p className="text-2xl font-bold text-red-600">{fmt(totals.deductions)}</p>
              <p className="text-xs text-gray-400 mt-1">CSG {fmt(totals.csg)} • NSF {fmt(totals.nsf)} • PAYE {fmt(totals.paye)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">Charges patronales</p>
              <p className="text-2xl font-bold text-orange-600">{fmt(totals.charges)}</p>
              <p className="text-xs text-gray-400 mt-1">Coût total: <strong>{fmt(totals.brut + totals.charges)}</strong></p>
            </CardContent></Card>
          </div>

          {/* Vérification cohérence */}
          {totals.brut > 0 && Math.abs(totals.brut - totals.deductions - totals.net) > 100 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              Vérification : Brut ({fmt(totals.brut)}) - Déductions ({fmt(totals.deductions)}) = {fmt(totals.brut - totals.deductions)} ≠ Net ({fmt(totals.net)}) — Écart de {fmt(Math.abs(totals.brut - totals.deductions - totals.net))}
            </div>
          )}

          {/* Colonnes détectées */}
          <details className="text-xs">
            <summary className="text-gray-400 cursor-pointer">Colonnes détectées ({columns.length})</summary>
            <div className="flex flex-wrap gap-1 mt-1">
              {columns.map((c: any) => (
                <Badge key={c.field} variant="outline" className="text-[10px]">{c.field}: col {c.index}</Badge>
              ))}
            </div>
          </details>

          {/* Preview table — ALL columns */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium border-b">Code</th>
                      <th className="px-2 py-2 text-left font-medium border-b">Nom</th>
                      <th className="px-2 py-2 text-left font-medium border-b">Prénom</th>
                      <th className="px-2 py-2 text-left font-medium border-b">Poste</th>
                      <th className="px-2 py-2 text-left font-medium border-b">Dept</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">Basic</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">OT 1.5x</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">OT 2x</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Special</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Internet</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Prime</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Elec</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Meal</th>
                      <th className="px-2 py-2 text-right font-medium border-b font-bold">Total Brut</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-red-50">Absence</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-red-50">CSG</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-red-50">NSF</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-red-50">PAYE</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-red-50">Tot. Déd.</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-orange-50">ER CSG</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-orange-50">ER NSF</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-orange-50">ER Levy</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-orange-50">ER PRGF</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-orange-50">Tot. ER</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-emerald-50 font-bold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {employes.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1 font-mono">{e.code || "—"}</td>
                        <td className="px-2 py-1 font-medium">{e.nom}</td>
                        <td className="px-2 py-1">{e.prenom}</td>
                        <td className="px-2 py-1 text-gray-500">{e.poste || "—"}</td>
                        <td className="px-2 py-1 text-gray-500">{e.departement || "—"}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.salaire_base)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.overtime_1_5x)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.overtime_2x)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.special_allowance)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.internet_allowance)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.prime_production)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.electricity)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(e.meal_allowance)}</td>
                        <td className="px-2 py-1 text-right font-mono font-medium">{fmt(e.total_payments || e.salaire_base)}</td>
                        <td className="px-2 py-1 text-right font-mono text-red-500">{fmt(e.absence_deductions)}</td>
                        <td className="px-2 py-1 text-right font-mono text-red-600">{fmt(e.csg)}</td>
                        <td className="px-2 py-1 text-right font-mono text-red-600">{fmt(e.nsf)}</td>
                        <td className="px-2 py-1 text-right font-mono text-red-600">{fmt(e.paye)}</td>
                        <td className="px-2 py-1 text-right font-mono text-red-700 font-medium">{fmt(e.total_deductions)}</td>
                        <td className="px-2 py-1 text-right font-mono text-orange-500">{fmt(e.er_csg)}</td>
                        <td className="px-2 py-1 text-right font-mono text-orange-500">{fmt(e.er_nsf)}</td>
                        <td className="px-2 py-1 text-right font-mono text-orange-500">{fmt(e.er_levy)}</td>
                        <td className="px-2 py-1 text-right font-mono text-orange-500">{fmt(e.er_prgf)}</td>
                        <td className="px-2 py-1 text-right font-mono text-orange-700 font-medium">{fmt(e.total_er)}</td>
                        <td className="px-2 py-1 text-right font-mono font-bold text-emerald-700">{fmt(e.net_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Result */}
      {step === "result" && result && (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-emerald-500" />
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>Import terminé</h2>
            <div className="flex justify-center gap-6">
              <div><p className="text-3xl font-bold text-emerald-600">{result.created}</p><p className="text-sm text-gray-500">Créés</p></div>
              <div><p className="text-3xl font-bold text-blue-600">{result.updated}</p><p className="text-sm text-gray-500">Mis à jour</p></div>
              <div><p className="text-3xl font-bold text-red-600">{result.errors.length}</p><p className="text-sm text-gray-500">Erreurs</p></div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left text-sm max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <p key={i} className="text-red-700">{e}</p>)}
              </div>
            )}
            <p className="text-sm text-gray-500">Les écritures comptables (641, 645, 421, 431, 444, 432) ont été générées automatiquement.</p>
            <Button variant="outline" onClick={() => { setStep("upload"); setEmployes([]); setResult(null) }}>
              Importer un autre fichier
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <Banknote className="inline h-5 w-5 mr-2" style={{ color: GOLD }} />
            Historique des imports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-gray-400 text-center py-6">Aucun import effectué</p>
          ) : (
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.periode}>
                  <button onClick={() => loadDetail(h.periode)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 text-left">
                    <div className="flex items-center gap-3">
                      <Badge style={{ backgroundColor: NAVY }} className="text-white text-xs">
                        {new Date(h.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                      </Badge>
                      <span className="text-sm"><Users className="inline h-4 w-4 mr-1 text-gray-400" />{h.nb} employés</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-mono">
                      <span>Brut: {fmt(h.total_brut)}</span>
                      <span className="text-emerald-600">Net: {fmt(h.total_net)}</span>
                      <span className="text-orange-600">Charges: {fmt(h.total_charges)}</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${historyDetail === h.periode ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {historyDetail === h.periode && (
                    <div className="ml-4 mb-3 border-l-2 pl-4" style={{ borderColor: GOLD }}>
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-400"><th className="text-left py-1">Employé</th><th className="text-right py-1">Base</th><th className="text-right py-1">Net</th><th className="text-right py-1">CSG</th><th className="text-right py-1">PAYE</th></tr></thead>
                        <tbody>
                          {detailBulletins.map((b: any) => (
                            <tr key={b.id} className="border-t border-gray-100">
                              <td className="py-1">{b.employe?.prenom} {b.employe?.nom}</td>
                              <td className="py-1 text-right font-mono">{fmt(b.salaire_base || 0)}</td>
                              <td className="py-1 text-right font-mono text-emerald-600">{fmt(b.salaire_net || 0)}</td>
                              <td className="py-1 text-right font-mono">{fmt(b.csg_salarie || 0)}</td>
                              <td className="py-1 text-right font-mono">{fmt(b.paye || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
