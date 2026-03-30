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

const STEPS = [
  { num: 1, label: "Periode", icon: Calendar },
  { num: 2, label: "Employes", icon: Users },
  { num: 3, label: "Variables", icon: Calculator },
  { num: 4, label: "Resultat", icon: FileText },
  { num: 5, label: "Bulletins", icon: FileSpreadsheet },
  { num: 6, label: "Exports", icon: Download },
]
const MONTHS = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"]

export default function ElaborationPaiePage() {
  const { profile, loading: profileLoading } = useProfile()
  const [step, setStep] = useState(1)
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
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
    fetch("/api/client/societes").then(r => r.json()).then(data => {
      const list = data.societes || data || []
      setSocietes(list)
      if (list.length > 0) setSelectedSociete(list[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [profile, profileLoading])

  const loadEmployes = useCallback(async () => {
    if (!selectedSociete) return
    setProcessing(true)
    try {
      const data = await fetch(`/api/rh/employes?societe_id=${selectedSociete}`).then(r => r.json())
      const list: Employe[] = data.employes || data || []
      setEmployes(list)
      setSelected(new Set(list.map(e => e.id)))
    } catch { /* ignore */ }
    setProcessing(false)
  }, [selectedSociete])

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
          action: "calculer_batch", societe_id: selectedSociete, periode,
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
        body: JSON.stringify({ action: `export_${type}`, societe_id: selectedSociete, periode })
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
        body: JSON.stringify({ action: "cloturer_periode", societe_id: selectedSociete, periode })
      })
      setExports(prev => ({ ...prev, cloture: true }))
    } catch { /* ignore */ }
    setProcessing(false)
  }

  if (profileLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" /></div>
  }

  const societeNom = societes.find(s => s.id === selectedSociete)?.nom || ""
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
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Elaboration de la Paie</h1>
          <p className="text-sm text-gray-500 mt-1">
            {societeNom && <span className="font-medium">{societeNom}</span>}
            {periode && <span className="ml-2">-- Periode : {MONTHS[parseInt(month) - 1]} {year}</span>}
          </p>
        </div>
        {societes.length > 1 && (
          <Select value={selectedSociete} onValueChange={setSelectedSociete}>
            <SelectTrigger className="w-56"><Building2 className="w-4 h-4 mr-2" /><SelectValue placeholder="Societe" /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between bg-white rounded-xl border p-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon; const done = step > s.num; const active = step === s.num
          return (
            <div key={s.num} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done ? "bg-green-500 border-green-500 text-white" : active ? "bg-[#1E2A4A] border-[#C9A84C] text-[#C9A84C]" : "bg-gray-100 border-gray-300 text-gray-400"
                }`}>
                  {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className={`text-xs mt-1 font-medium ${active ? "text-[#1E2A4A]" : done ? "text-green-600" : "text-gray-400"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Periode */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><Calendar className="w-5 h-5 text-[#C9A84C]" />Selectionner la periode de paie</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Mois</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Annee</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleStart} className="bg-[#1E2A4A] hover:bg-[#1E2A4A]/90 text-white">
                <ArrowRight className="w-4 h-4 mr-2" />Demarrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Employes */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><Users className="w-5 h-5 text-[#C9A84C]" />Selection des employes</CardTitle></CardHeader>
          <CardContent>
            {processing ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /><span className="ml-2 text-gray-500">Chargement...</span></div>
            ) : (<>
              <div className="mb-3 flex items-center gap-3">
                <Badge variant="outline" className="text-[#1E2A4A]">{selected.size} / {employes.length} selectionnes</Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(employes.map(e => e.id)))}>Tout selectionner</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Tout deselectionner</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50">
                    <TableHead className="w-10"></TableHead><TableHead>Nom</TableHead><TableHead>Poste</TableHead>
                    <TableHead className="text-right">Salaire de base</TableHead><TableHead>Banque</TableHead>
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
                    {employes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-8">Aucun employe trouve</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>Retour</Button>
                <Button onClick={handleValidateEmployees} disabled={selected.size === 0} className="bg-[#1E2A4A] hover:bg-[#1E2A4A]/90 text-white">
                  <CheckCircle className="w-4 h-4 mr-2" />Valider ({selected.size})
                </Button>
              </div>
            </>)}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Variables */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><Calculator className="w-5 h-5 text-[#C9A84C]" />Saisie des variables de paie</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead className="min-w-[160px]">Employe</TableHead>
                  <TableHead className="text-center w-24">Jours</TableHead><TableHead className="text-center w-24">Absences</TableHead>
                  <TableHead className="text-center w-24">HS 1.5x</TableHead><TableHead className="text-center w-24">HS 2x</TableHead>
                  <TableHead className="text-center w-28">Primes</TableHead><TableHead className="text-center w-28">Avance</TableHead>
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
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button onClick={handleCalculate} disabled={processing} className="bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-[#1E2A4A] font-semibold">
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}Calculer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Resultat */}
      {step === 4 && (<>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Masse salariale brute", val: summary.masse, border: "border-l-[#1E2A4A]", color: "text-[#1E2A4A]" },
            { label: "Total net a payer", val: summary.totalNet, border: "border-l-green-500", color: "text-green-700" },
            { label: "Charges patronales", val: summary.charges, border: "border-l-[#C9A84C]", color: "text-[#C9A84C]" },
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
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><FileText className="w-5 h-5 text-[#C9A84C]" />Resultats du calcul</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50">
                  <TableHead>Employe</TableHead><TableHead className="text-right">Brut</TableHead>
                  <TableHead className="text-right">CSG</TableHead><TableHead className="text-right">NSF</TableHead>
                  <TableHead className="text-right">PAYE</TableHead><TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Ch. Pat.</TableHead><TableHead className="text-right">Cout total</TableHead>
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
              <Button variant="outline" onClick={() => setStep(3)}>Retour</Button>
              <Button onClick={() => { setStep(5) }} className="bg-[#1E2A4A] hover:bg-[#1E2A4A]/90 text-white">
                <CheckCircle className="w-4 h-4 mr-2" />Valider bulletins
              </Button>
            </div>
          </CardContent>
        </Card>
      </>)}

      {/* Step 5: Bulletins */}
      {step === 5 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><FileSpreadsheet className="w-5 h-5 text-[#C9A84C]" />Bulletins de paie -- {MONTHS[parseInt(month) - 1]} {year}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resultats.map(r => (
                <div key={r.employe_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium text-[#1E2A4A]">{r.prenom} {r.nom}</p>
                      <p className="text-sm text-gray-500">Net : {fmt(r.net)}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open(
                    `/api/rh/paie/bulletin-pdf?societe_id=${selectedSociete}&periode=${periode}&employe_id=${r.employe_id}`, "_blank"
                  )}><Eye className="w-4 h-4 mr-1" />Voir PDF</Button>
                </div>
              ))}
              {resultats.length === 0 && <p className="text-center text-gray-400 py-8">Aucun bulletin</p>}
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)}>Retour</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.open(
                  `/api/rh/paie/bulletins-zip?societe_id=${selectedSociete}&periode=${periode}`, "_blank"
                )}><Download className="w-4 h-4 mr-2" />Telecharger tout</Button>
                <Button onClick={() => setStep(6)} className="bg-[#1E2A4A] hover:bg-[#1E2A4A]/90 text-white">
                  <ChevronRight className="w-4 h-4 mr-2" />Exports
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Exports */}
      {step === 6 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E2A4A]"><Download className="w-5 h-5 text-[#C9A84C]" />Exports et cloture -- {MONTHS[parseInt(month) - 1]} {year}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exportBtn("virement", <Banknote className="w-5 h-5 mr-3 text-[#1E2A4A]" />, "Fichier de virement bancaire", "Format bancaire standard")}
              {exportBtn("csg", <Calculator className="w-5 h-5 mr-3 text-[#1E2A4A]" />, "Declaration CSG (MRA)", "Contribution Sociale Generalisee")}
              {exportBtn("paye", <FileText className="w-5 h-5 mr-3 text-[#1E2A4A]" />, "Declaration PAYE (MRA)", "Pay As You Earn")}
              {exportBtn("compta", <FileSpreadsheet className="w-5 h-5 mr-3 text-[#1E2A4A]" />, "Comptabilisation", "Ecritures comptables de paie")}
            </div>
            <div className="mt-6 pt-4 border-t flex justify-between items-center">
              <Button variant="outline" onClick={() => setStep(5)}>Retour</Button>
              <Button onClick={handleCloture} disabled={exports.cloture || processing}
                className={exports.cloture ? "bg-green-600 text-white cursor-not-allowed" : "bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-[#1E2A4A] font-semibold"}>
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                {exports.cloture ? "Periode cloturee" : "Cloturer periode"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
