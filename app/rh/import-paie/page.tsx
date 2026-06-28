"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Download, Users, Banknote, ChevronDown } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

type Step = "upload" | "preview" | "result"

export default function ImportPaiePage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState("")
  const [step, setStep] = useState<Step>("upload")
  // Mode d'import : 'mensuel' (paie normale) ou 'eoy' (13ème mois — fichier
  // supplémentaire qui crée un bulletin EOY séparé sur décembre).
  const [importMode, setImportMode] = useState<'mensuel' | 'eoy'>('mensuel')

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
    setFileName(file.name)
    setParsing(true)
    setParseError("")
    try {
      if (file.size > 10 * 1024 * 1024) {
        setParseError(t('rha.a.import.file_too_large', locale))
        return
      }
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/rh/import-paie", { method: "POST", body: fd })

      if (!res.ok) {
        const text = await res.text()
        try {
          const errData = JSON.parse(text)
          setParseError(errData.error || t('uirh.importpaie.server_error', locale).replace('{x}', String(res.status)))
        } catch {
          setParseError(t('uirh.importpaie.server_error_body', locale).replace('{x}', String(res.status)).replace('{y}', text.substring(0, 200)))
        }
        return
      }

      const data = await res.json()

      if (data.error) { setParseError(data.error); return }
      if (!data.employes || data.employes.length === 0) {
        setParseError(t('rha.a.import.no_employees_detected', locale))
        return
      }

      setColumns(data.columns || [])
      setEmployes(data.employes || [])
      if (data.periode_detected && !periode) setPeriode(data.periode_detected)
      setStep("preview")
    } catch (e: any) {
      // Sprint 1 — l'utilisateur voit déjà le message via setParseError ;
      // on n'expose plus la stack/exception détaillée en console pour
      // éviter la pollution des logs prod.
      setParseError(t('uirh.importpaie.error_prefix', locale) + (e.message || t('uirh.importpaie.connection_failed', locale)))
    }
    finally { setParsing(false) }
  }

  const handleImport = async () => {
    if (!societe) { alert(t('rha.a.import.veuillez_societe', locale)); return }
    if (!periode) { alert(t('rha.a.import.veuillez_periode', locale)); return }
    if (employes.length === 0) { alert(t('rha.a.import.aucun_employe_importer', locale)); return }
    setImporting(true)
    try {
      const res = await fetch("/api/rh/import-paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: importMode === 'eoy' ? "import_eoy" : "import",
          societe_id: societe, periode, employes,
        }),
      })
      const data = await res.json()
      if (data.error) { alert(t('uirh.importpaie.error_prefix', locale) + data.error); return }
      setResult(data)
      setStep("result")
      loadHistory()
    } catch (e: any) { alert(t('rha.a.import.erreur_reseau', locale) + " " + (e.message || "")) }
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
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.a.import.title', locale)}</h1>
          <p className="text-gray-500 text-sm">{t('rha.a.import.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('rha.a.common.societe', locale)} /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="p-8 space-y-4">
            {/* Sélecteur de mode : paie mensuelle vs 13ème mois (EOY) */}
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setImportMode('mensuel')}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${importMode === 'mensuel' ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
              >
                📋 {t('uirh.importpaie.mode_monthly', locale)}
              </button>
              <button
                type="button"
                onClick={() => setImportMode('eoy')}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${importMode === 'eoy' ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
              >
                🎁 {t('uirh.importpaie.mode_eoy', locale)}
              </button>
            </div>
            {importMode === 'eoy' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                {t('uirh.importpaie.eoy_explain', locale)}
              </div>
            )}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-[#D4AF37] transition-colors"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#D4AF37]', 'bg-[#D4AF37]/5') }}
              onDragLeave={e => { e.currentTarget.classList.remove('border-[#D4AF37]', 'bg-[#D4AF37]/5') }}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#D4AF37]', 'bg-[#D4AF37]/5'); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {parsing ? (
                <div><Loader2 className="h-12 w-12 animate-spin mx-auto mb-3 text-[#D4AF37]" /><p className="text-gray-500">{t('rha.a.import.analyzing_prefix', locale)} <strong>{fileName}</strong> {t('rha.a.import.analyzing_suffix', locale)}</p></div>
              ) : (
                <div>
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-lg font-medium" style={{ color: NAVY }}>{t('rha.a.import.dropzone', locale)}</p>
                  <p className="text-sm text-gray-400 mt-1">{t('rha.a.import.dropzone_or', locale)}</p>
                </div>
              )}
            </div>

            {/* Input fichier visible */}
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#0B0F2E] file:text-white hover:file:bg-[#2a3d66]"
                disabled={parsing}
              />
              {fileName && !parsing && <Badge variant="outline">{fileName}</Badge>}
            </div>

            <p className="text-xs text-gray-400 text-center">{t('rha.a.import.format_expected', locale)}</p>

            {parseError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm font-medium">{t('rha.a.import.error_label', locale)}</p>
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
              <Badge variant="outline">{employes.length} {t('rha.a.common.employes', locale)}</Badge>
              <Badge variant="outline">{columns.length} {t('rha.a.import.colonnes_count', locale)}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">{t('rha.a.common.periode', locale)} :</Label>
              <select value={periode} onChange={e => setPeriode(e.target.value)}
                className="border rounded px-3 py-2 text-sm">
                <option value="">{t('rha.a.common.choisir', locale)}</option>
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
              <Button variant="outline" onClick={() => { setStep("upload"); setEmployes([]); setColumns([]) }}>{t('rha.a.common.annuler', locale)}</Button>
              <Button onClick={handleImport} disabled={importing || !periode || !societe}
                style={{ backgroundColor: !periode || !societe ? '#999' : NAVY }}
                className="text-white">
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {!periode ? t('rha.a.import.choose_month_first', locale) : !societe ? t('rha.a.import.choose_societe', locale) : `${t('rha.a.import.importer_n', locale)} ${employes.length} ${t('rha.a.import.suffix_employes', locale)}`}
              </Button>
            </div>
          </div>

          {/* KPIs — indicateurs clés */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">{t('rha.a.import.masse_brute', locale)}</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(totals.brut)}</p>
              <p className="text-xs text-gray-400 mt-1">{employes.length} {t('rha.a.common.employes', locale)} • {t('rha.a.common.base', locale)}: {fmt(totals.basic)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">{t('rha.a.import.net_payer', locale)}</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(totals.net)}</p>
              {totals.net === 0 && totals.brut > 0 && <p className="text-xs text-red-500 mt-1">{t('rha.a.import.col_net_pay_missing', locale)}</p>}
              {totals.net > 0 && <p className="text-xs text-gray-400 mt-1">{Math.round(totals.net / totals.brut * 100)}% {t('rha.a.import.de_brut', locale)}</p>}
            </CardContent></Card>
            <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">{t('rha.a.import.retenues_salariales', locale)}</p>
              <p className="text-2xl font-bold text-red-600">{fmt(totals.deductions)}</p>
              <p className="text-xs text-gray-400 mt-1">CSG {fmt(totals.csg)} • NSF {fmt(totals.nsf)} • PAYE {fmt(totals.paye)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
              <p className="text-xs text-gray-400">{t('rha.a.import.charges_patronales', locale)}</p>
              <p className="text-2xl font-bold text-orange-600">{fmt(totals.charges)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('rha.a.import.cout_total', locale)}: <strong>{fmt(totals.brut + totals.charges)}</strong></p>
            </CardContent></Card>
          </div>

          {/* Vérification cohérence */}
          {totals.brut > 0 && Math.abs(totals.brut - totals.deductions - totals.net) > 100 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              {t('rha.a.import.verif_coherence', locale)} : {t('rha.a.common.brut', locale)} ({fmt(totals.brut)}) - {t('rha.a.import.verif_deductions', locale)} ({fmt(totals.deductions)}) = {fmt(totals.brut - totals.deductions)} ≠ {t('rha.a.common.net', locale)} ({fmt(totals.net)}) — {t('rha.a.import.verif_ecart', locale)} {fmt(Math.abs(totals.brut - totals.deductions - totals.net))}
            </div>
          )}

          {/* Colonnes détectées */}
          <details className="text-xs">
            <summary className="text-gray-400 cursor-pointer">{t('rha.a.import.colonnes_detectees', locale)} ({columns.length})</summary>
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
                      <th className="px-2 py-2 text-left font-medium border-b">{t('uirh.importpaie.th_code', locale)}</th>
                      <th className="px-2 py-2 text-left font-medium border-b">{t('uirh.importpaie.th_lastname', locale)}</th>
                      <th className="px-2 py-2 text-left font-medium border-b">{t('uirh.importpaie.th_firstname', locale)}</th>
                      <th className="px-2 py-2 text-left font-medium border-b">{t('uirh.importpaie.th_position', locale)}</th>
                      <th className="px-2 py-2 text-left font-medium border-b">{t('uirh.importpaie.th_dept', locale)}</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">Basic</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">OT 1.5x</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-blue-50">OT 2x</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Special</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Internet</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Prime</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Elec</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-green-50">Meal</th>
                      <th className="px-2 py-2 text-right font-medium border-b bg-purple-50 font-semibold">EOY 13e</th>
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
                        <td className="px-2 py-1 text-right font-mono text-purple-700 font-medium">{fmt(e.eoy_bonus)}</td>
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
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>{t('rha.a.import.import_termine', locale)}</h2>
            <div className="flex justify-center gap-6">
              <div><p className="text-3xl font-bold text-emerald-600">{result.created}</p><p className="text-sm text-gray-500">{t('rha.a.import.crees', locale)}</p></div>
              <div><p className="text-3xl font-bold text-blue-600">{result.updated}</p><p className="text-sm text-gray-500">{t('rha.a.import.mis_a_jour', locale)}</p></div>
              <div><p className="text-3xl font-bold text-red-600">{result.errors.length}</p><p className="text-sm text-gray-500">{t('rha.a.import.erreurs', locale)}</p></div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left text-sm max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <p key={i} className="text-red-700">{e}</p>)}
              </div>
            )}
            <p className="text-sm text-gray-500">{t('rha.a.import.ecritures_generees', locale)}</p>
            <Button variant="outline" onClick={() => { setStep("upload"); setEmployes([]); setResult(null) }}>
              {t('rha.a.import.importer_autre', locale)}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <Banknote className="inline h-5 w-5 mr-2" style={{ color: GOLD }} />
            {t('rha.a.import.historique', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-gray-400 text-center py-6">{t('rha.a.import.aucun_import', locale)}</p>
          ) : (
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.periode}>
                  <button onClick={() => loadDetail(h.periode)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 text-left">
                    <div className="flex items-center gap-3">
                      <Badge style={{ backgroundColor: h.is_eoy ? '#7e22ce' : NAVY }} className="text-white text-xs">
                        {new Date(h.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                      </Badge>
                      {h.is_eoy && <Badge className="bg-purple-100 text-purple-800 text-[10px] border border-purple-300">🎁 {t('uirh.importpaie.badge_eoy', locale)}</Badge>}
                      <span className="text-sm"><Users className="inline h-4 w-4 mr-1 text-gray-400" />{h.nb} {t('rha.a.common.employes', locale)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-mono">
                      <span>{t('rha.a.common.brut', locale)}: {fmt(h.total_brut)}</span>
                      <span className="text-emerald-600">{t('rha.a.common.net', locale)}: {fmt(h.total_net)}</span>
                      <span className="text-orange-600">{t('rha.a.common.charges', locale)}: {fmt(h.total_charges)}</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${historyDetail === h.periode ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {historyDetail === h.periode && (
                    <div className="ml-4 mb-3 border-l-2 pl-4" style={{ borderColor: GOLD }}>
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-400"><th className="text-left py-1">{t('rha.a.common.employe', locale)}</th><th className="text-right py-1">{t('rha.a.common.base', locale)}</th><th className="text-right py-1">{t('rha.a.common.net', locale)}</th><th className="text-right py-1">CSG</th><th className="text-right py-1">PAYE</th></tr></thead>
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
    </ClientPageShell>
  )
}
