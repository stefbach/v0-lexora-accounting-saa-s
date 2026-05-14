"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Calendar, Users, Calculator, FileText, Download, CheckCircle,
  ArrowRight, Building2, Banknote, FileSpreadsheet, Lock, Eye, ChevronRight
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"

interface Societe { id: string; nom: string }
interface Employe {
  id: string; code: string; nom: string; prenom: string
  poste?: string; salaire_base?: number; banque?: string; compte_bancaire?: string
}
interface Variable {
  employe_id: string; nom: string; prenom: string
  jours: number; absences: number; hs15: number; hs20: number; primes: number; avance: number
}
interface Resultat {
  employe_id: string; nom: string; prenom: string
  brut: number; csg: number; nsf: number; paye: number
  net: number; charges_pat: number; cout_total: number
}

const MONTHS_FR = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"]
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export default function ElaborationPaiePage() {
  const locale = getLocale()
  const STEPS = [
    { num: 1, label: t('hr.elab.step_period', locale), icon: Calendar },
    { num: 2, label: t('hr.elab.step_employees', locale), icon: Users },
    { num: 3, label: t('hr.elab.step_variables', locale), icon: Calculator },
    { num: 4, label: t('hr.elab.step_result', locale), icon: FileText },
    { num: 5, label: t('hr.elab.step_payslips', locale), icon: FileSpreadsheet },
    { num: 6, label: t('hr.elab.step_exports', locale), icon: Download },
  ]
  const MONTHS = locale === 'fr' ? MONTHS_FR : MONTHS_EN
  const { profile, loading: profileLoading } = useProfile()
  const { societeId, societe } = useSocieteActive()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [employes, setEmployes] = useState<Employe[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [variables, setVariables] = useState<Variable[]>([])
  const [resultats, setResultats] = useState<Resultat[]>([])
  const [summary, setSummary] = useState({ masse: 0, totalNet: 0, charges: 0 })
  const [exports, setExports] = useState({ virement: false, csg: false, paye: false, compta: false, cloture: false })
  const periode = `${year}-${month.padStart(2, "0")}`

  useEffect(() => {
    if (profileLoading || !profile) return
    setLoading(false)
  }, [profile, profileLoading])

  const loadEmployes = useCallback(async () => {
    if (!societeId) return
    setProcessing(true)
    try {
      const data = await fetch(`/api/rh/employes?societe_id=${societeId}`).then(r => r.json())
      const list: Employe[] = data.employes || data || []
      setEmployes(list)
      setSelected(new Set(list.map(e => e.id)))
    } catch { /* ignore */ }
    setProcessing(false)
  }, [societeId])

  const handleStart = () => { loadEmployes(); setStep(2) }

  const handleValidateEmployees = () => {
    setVariables(employes.filter(e => selected.has(e.id)).map(e => ({
      employe_id: e.id, nom: e.nom, prenom: e.prenom,
      jours: 22, absences: 0, hs15: 0, hs20: 0, primes: 0, avance: 0
    })))
    setStep(3)
  }

  const updateVar = (idx: number, field: keyof Variable, value: number) => {
    setVariables(prev => { const c = [...prev]; c[idx] = { ...c[idx], [field]: value }; return c })
  }

  const handleCalculate = async () => {
    setProcessing(true)
    try {
      const data = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calculer_batch", societe_id: societeId, periode,
          variables: variables.map(v => ({
            employe_id: v.employe_id, jours_travailles: v.jours, absences: v.absences,
            heures_sup_150: v.hs15, heures_sup_200: v.hs20, primes: v.primes, avance_salaire: v.avance,
          }))
        })
      }).then(r => r.json())
      const res: Resultat[] = (data.resultats || data.bulletins || []).map((b: any) => ({
        employe_id: b.employe_id,
        nom: b.nom || b.employe?.nom || "", prenom: b.prenom || b.employe?.prenom || "",
        brut: b.salaire_brut || b.brut || 0, csg: b.csg_salarie || b.csg || 0,
        nsf: b.nsf_salarie || b.nsf || 0, paye: b.paye || 0,
        net: b.salaire_net || b.net || 0, charges_pat: b.total_charges_patronales || b.charges_pat || 0,
        cout_total: b.cout_total || (b.salaire_brut || 0) + (b.total_charges_patronales || 0),
      }))
      res.forEach(r => {
        if (!r.nom) { const v = variables.find(v => v.employe_id === r.employe_id); if (v) { r.nom = v.nom; r.prenom = v.prenom } }
      })
      setResultats(res)
      setSummary({
        masse: res.reduce((s, r) => s + r.brut, 0),
        totalNet: res.reduce((s, r) => s + r.net, 0),
        charges: res.reduce((s, r) => s + r.charges_pat, 0),
      })
      setStep(4)
    } catch { /* ignore */ }
    setProcessing(false)
  }

  const handleExport = async (type: string) => {
    setProcessing(true)
    try {
      const r = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: `export_${type}`, societe_id: societeId, periode })
      })
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob())
        Object.assign(document.createElement("a"), { href: url, download: `${type}_${periode}.xlsx` }).click()
        URL.revokeObjectURL(url)
        setExports(prev => ({ ...prev, [type]: true }))
      }
    } catch { /* ignore */ }
    setProcessing(false)
  }

  const handleCloture = async () => {
    setProcessing(true)
    try {
      await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cloturer_periode", societe_id: societeId, periode })
      })
      setExports(prev => ({ ...prev, cloture: true }))
    } catch { /* ignore */ }
    setProcessing(false)
  }

  if (profileLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" /></div>
  }

  const societeNom = societe?.nom || ""
  const VarInput = ({ v, i, field }: { v: Variable; i: number; field: keyof Variable }) => (
    <Input type="number" value={v[field] as number} className="text-center h-8"
      onChange={e => updateVar(i, field, Number(e.target.value))} />
  )
  const exportBtn = (key: string, icon: React.ReactNode, title: string, desc: string) => (
    <Button variant="outline" className="h-auto py-4 justify-start" disabled={exports[key as keyof typeof exports] || processing}
      onClick={() => handleExport(key)}>
      {icon}
      <div className="text-left"><p className="font-medium">{title}</p><p className="text-xs text-gray-500">{desc}</p></div>
      {exports[key as keyof typeof exports] && <CheckCircle className="w-5 h-5 ml-auto text-green-500" />}
    </Button>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('hr.elab.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {societeNom && <span className="font-medium">{societeNom}</span>}
            {periode && <span className="ml-2">-- {t('hr.elab.period', locale)} : {MONTHS[parseInt(month) - 1]} {year}</span>}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between bg-white rounded-xl border p-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon; const done = step > s.num; const active = step === s.num
          return (
            <div key={s.num} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done ? "bg-green-500 border-green-500 text-white" : active ? "bg-[#0B0F2E] border-[#D4AF37] text-[#D4AF37]" : "bg-gray-100 border-gray-300 text-gray-400"
                }`}>
                  {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className={`text-xs mt-1 font-medium ${active ? "text-[#0B0F2E]" : done ? "text-green-600" : "text-gray-400"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Periode */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><Calendar className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.select_period', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">{t('hr.elab.month', locale)}</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">{t('hr.elab.year', locale)}</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleStart} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white">
                <ArrowRight className="w-4 h-4 mr-2" />{t('hr.elab.start', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Employes */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><Users className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.employee_selection', locale)}</CardTitle></CardHeader>
          <CardContent>
            {processing ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /><span className="ml-2 text-gray-500">{t('hr.elab.loading', locale)}</span></div>
            ) : (<>
              <div className="mb-3 flex items-center gap-3">
                <Badge variant="outline" className="text-[#0B0F2E]">{selected.size} / {employes.length} {t('hr.elab.selected', locale)}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(employes.map(e => e.id)))}>{t('hr.elab.select_all', locale)}</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t('hr.elab.deselect_all', locale)}</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50">
                    <TableHead className="w-10"></TableHead><TableHead>{t('hr.elab.name', locale)}</TableHead><TableHead>{t('hr.elab.position', locale)}</TableHead>
                    <TableHead className="text-right">{t('hr.elab.base_salary', locale)}</TableHead><TableHead>{t('hr.elab.bank', locale)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {employes.map(e => (
                      <TableRow key={e.id} className="hover:bg-gray-50">
                        <TableCell><Checkbox checked={selected.has(e.id)} onCheckedChange={(checked) => {
                          const next = new Set(selected); checked ? next.add(e.id) : next.delete(e.id); setSelected(next)
                        }} /></TableCell>
                        <TableCell className="font-medium">{e.prenom} {e.nom}</TableCell>
                        <TableCell className="text-gray-500">{e.poste || "--"}</TableCell>
                        <TableCell className="text-right">{fmt(e.salaire_base || 0)}</TableCell>
                        <TableCell className="text-gray-500">{e.banque || e.compte_bancaire || "--"}</TableCell>
                      </TableRow>
                    ))}
                    {employes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-8">{t('hr.elab.no_employees', locale)}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>{t('hr.elab.back', locale)}</Button>
                <Button onClick={handleValidateEmployees} disabled={selected.size === 0} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white">
                  <CheckCircle className="w-4 h-4 mr-2" />{t('hr.elab.validate', locale)} ({selected.size})
                </Button>
              </div>
            </>)}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Variables */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><Calculator className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.variables_title', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead className="min-w-[160px]">{t('hr.elab.employee', locale)}</TableHead>
                  <TableHead className="text-center w-24">{t('hr.elab.days', locale)}</TableHead><TableHead className="text-center w-24">{t('hr.elab.absences', locale)}</TableHead>
                  <TableHead className="text-center w-24">HS 1.5x</TableHead><TableHead className="text-center w-24">HS 2x</TableHead>
                  <TableHead className="text-center w-28">{t('hr.elab.bonuses', locale)}</TableHead><TableHead className="text-center w-28">{t('hr.elab.advance', locale)}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {variables.map((v, i) => (
                    <TableRow key={v.employe_id}>
                      <TableCell className="font-medium">{v.prenom} {v.nom}</TableCell>
                      {(["jours","absences","hs15","hs20","primes","avance"] as (keyof Variable)[]).map(f => (
                        <TableCell key={f}><VarInput v={v} i={i} field={f} /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>{t('hr.elab.back', locale)}</Button>
              <Button onClick={handleCalculate} disabled={processing} className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B0F2E] font-semibold">
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}{t('hr.elab.calculate', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Resultat */}
      {step === 4 && (<>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: t('hr.elab.gross_mass', locale), val: summary.masse, border: "border-l-[#0B0F2E]", color: "text-[#0B0F2E]" },
            { label: t('hr.elab.net_total', locale), val: summary.totalNet, border: "border-l-green-500", color: "text-green-700" },
            { label: t('hr.elab.employer_charges', locale), val: summary.charges, border: "border-l-[#D4AF37]", color: "text-[#D4AF37]" },
          ].map(c => (
            <Card key={c.label} className={`border-l-4 ${c.border}`}>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{fmt(c.val)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><FileText className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.calc_results', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead>{t('hr.elab.employee', locale)}</TableHead><TableHead className="text-right">{t('hr.elab.gross', locale)}</TableHead>
                  <TableHead className="text-right">CSG</TableHead><TableHead className="text-right">NSF</TableHead>
                  <TableHead className="text-right">PAYE</TableHead><TableHead className="text-right">{t('hr.elab.net', locale)}</TableHead>
                  <TableHead className="text-right">{t('hr.elab.emp_ch', locale)}</TableHead><TableHead className="text-right">{t('hr.elab.total_cost', locale)}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {resultats.map(r => (
                    <TableRow key={r.employe_id}>
                      <TableCell className="font-medium">{r.prenom} {r.nom}</TableCell>
                      <TableCell className="text-right">{fmt(r.brut)}</TableCell>
                      <TableCell className="text-right">{fmt(r.csg)}</TableCell>
                      <TableCell className="text-right">{fmt(r.nsf)}</TableCell>
                      <TableCell className="text-right">{fmt(r.paye)}</TableCell>
                      <TableCell className="text-right font-semibold text-green-700">{fmt(r.net)}</TableCell>
                      <TableCell className="text-right">{fmt(r.charges_pat)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.cout_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>{t('hr.elab.back', locale)}</Button>
              <Button onClick={() => { setStep(5) }} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white">
                <CheckCircle className="w-4 h-4 mr-2" />{t('hr.elab.validate_payslips', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </>)}

      {/* Step 5: Bulletins */}
      {step === 5 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><FileSpreadsheet className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.payslips_title', locale)} -- {MONTHS[parseInt(month) - 1]} {year}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resultats.map(r => (
                <div key={r.employe_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium text-[#0B0F2E]">{r.prenom} {r.nom}</p>
                      <p className="text-sm text-gray-500">{t('hr.elab.net', locale)} : {fmt(r.net)}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open(
                    `/api/rh/paie/pdf?employe_id=${r.employe_id}&periode=${periode}`, "_blank"
                  )}><Eye className="w-4 h-4 mr-1" />{t('hr.elab.view_pdf', locale)}</Button>
                </div>
              ))}
              {resultats.length === 0 && <p className="text-center text-gray-400 py-8">{t('hr.elab.no_payslip', locale)}</p>}
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)}>{t('hr.elab.back', locale)}</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.open(
                  `/api/rh/paie/bulletins-zip?societe_id=${societeId}&periode=${periode}`, "_blank"
                )}><Download className="w-4 h-4 mr-2" />{t('hr.elab.download_all', locale)}</Button>
                <Button onClick={() => setStep(6)} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white">
                  <ChevronRight className="w-4 h-4 mr-2" />{t('hr.elab.step_exports', locale)}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Exports */}
      {step === 6 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F2E]"><Download className="w-5 h-5 text-[#D4AF37]" />{t('hr.elab.exports_close', locale)} -- {MONTHS[parseInt(month) - 1]} {year}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exportBtn("virement", <Banknote className="w-5 h-5 mr-3 text-[#0B0F2E]" />, t('hr.elab.export_bank_title', locale), t('hr.elab.export_bank_desc', locale))}
              {exportBtn("csg", <Calculator className="w-5 h-5 mr-3 text-[#0B0F2E]" />, t('hr.elab.export_csg_title', locale), t('hr.elab.export_csg_desc', locale))}
              {exportBtn("paye", <FileText className="w-5 h-5 mr-3 text-[#0B0F2E]" />, t('hr.elab.export_paye_title', locale), t('hr.elab.export_paye_desc', locale))}
              {exportBtn("compta", <FileSpreadsheet className="w-5 h-5 mr-3 text-[#0B0F2E]" />, t('hr.elab.export_compta_title', locale), t('hr.elab.export_compta_desc', locale))}
            </div>
            <div className="mt-6 pt-4 border-t flex justify-between items-center">
              <Button variant="outline" onClick={() => setStep(5)}>{t('hr.elab.back', locale)}</Button>
              <Button onClick={handleCloture} disabled={exports.cloture || processing}
                className={exports.cloture ? "bg-green-600 text-white cursor-not-allowed" : "bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B0F2E] font-semibold"}>
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                {exports.cloture ? t('hr.elab.period_closed', locale) : t('hr.elab.close_period', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
