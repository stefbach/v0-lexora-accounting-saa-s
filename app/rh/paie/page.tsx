"use client"
import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calculator, Download, FileText, BookOpen, AlertTriangle, CheckCircle, Lock, Unlock, ShieldCheck, ArrowRight, Clock, CreditCard, FileSpreadsheet, Receipt, Pencil, X, Save, RefreshCw } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }
const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide: "bg-blue-100 text-blue-700",
  paye: "bg-green-100 text-green-700",
  declare_mra: "bg-purple-100 text-purple-700"
}

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function PaiePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState("")
  const [periodeReady, setPeriodeReady] = useState(false)
  const [availablePeriodes, setAvailablePeriodes] = useState<string[]>([])
  const [bulletins, setBulletins] = useState<any[]>([])
  const [totaux, setTotaux] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Workflow
  const [workflow, setWorkflow] = useState<any>(null)
  const [audit, setAudit] = useState<any[]>([])

  // Comptabilisation
  const [comptabilisationLoading, setComptabilisationLoading] = useState(false)
  const [comptabilisationResult, setComptabilisationResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(async ([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      const firstSociete = unique.length >= 1 ? unique[0].id : "all"
      setSociete(firstSociete)
      try {
        const params = new URLSearchParams()
        if (firstSociete !== "all") params.set("societe_id", firstSociete)
        const data = await fetch(`/api/rh/paie?${params}`).then(r => r.json())
        const allBulletins = data.bulletins || []
        const periods = [...new Set(allBulletins.map((b: any) => (b.periode || "").slice(0, 7)).filter(Boolean))] as string[]
        periods.sort((a, b) => b.localeCompare(a))
        setAvailablePeriodes(periods)
        if (periods.length > 0) {
          setPeriode(periods[0])
          setPeriodeReady(true)
          return
        }
      } catch {}
      setPeriode(new Date().toISOString().slice(0, 7))
      setPeriodeReady(true)
    })
  }, [])

  const load = useCallback(async () => {
    if (!periodeReady || !periode) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const data = await fetch(`/api/rh/paie?${params}`).then(r => r.json())
      setBulletins(data.bulletins || [])
      setTotaux(data.totaux || {})
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe, periode, periodeReady])

  const loadWorkflow = useCallback(async () => {
    if (!periode || societe === "all") { setWorkflow(null); return }
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "workflow_status", societe_id: societe, periode })
      })
      if (!res.ok) { setWorkflow(null); return } // tables may not exist yet
      const data = await res.json()
      setWorkflow(data.workflow || null)
      setAudit(data.audit || [])
    } catch { setWorkflow(null) }
  }, [societe, periode])

  useEffect(() => { load(); loadWorkflow() }, [load, loadWorkflow])

  const doAction = async (action: string, extra?: any) => {
    if (societe === "all") return alert("Selectionnez une societe")
    setActionLoading(action)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, societe_id: societe, periode, ...extra })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return data }
      return data
    } catch (e: any) { alert("Erreur reseau: " + (e.message || "")); return null }
    finally { setActionLoading(null); load(); loadWorkflow() }
  }

  const calculerBatch = async () => {
    if (societe === "all") return alert("Selectionnez une societe")
    const calcPeriode = periode || new Date().toISOString().slice(0, 7)
    setCalculating(true)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode: calcPeriode })
      })
      let data: any
      const text = await res.text()
      try { data = JSON.parse(text) } catch { alert("Erreur serveur: " + text.slice(0, 300)); setCalculating(false); return }
      if (!res.ok) {
        alert("Erreur [" + res.status + "]: " + (data.error || JSON.stringify(data).slice(0, 300)))
      } else {
        const nb = data.nb || data.bulletins?.length || 0
        const erreurs = data.erreurs || []
        alert(`${nb} bulletin(s) calcule(s) pour ${calcPeriode}${erreurs.length > 0 ? `\n\n${erreurs.length} erreur(s):\n${erreurs.join("\n")}` : ""}`)
        if (!availablePeriodes.includes(calcPeriode)) {
          setAvailablePeriodes(prev => [calcPeriode, ...prev].sort((a, b) => b.localeCompare(a)))
        }
        setPeriode(calcPeriode); setPeriodeReady(true)
        if (data.bulletins?.length > 0) { setBulletins(data.bulletins); setTotaux(data.totaux || {}) }
        else { load() }
        loadWorkflow()
      }
    } catch (e: any) { alert("Erreur reseau: " + (e.message || "")) } finally { setCalculating(false) }
  }

  const validerTous = () => doAction("valider_tous")
  const verrouiller = () => {
    if (!confirm("Verrouiller la paie de cette periode ?\n\nAucune modification ne sera possible apres le verrouillage.\nLes exports banque, MRA et la comptabilisation seront alors accessibles.")) return
    doAction("verrouiller")
  }
  const deverrouiller = () => {
    const motif = prompt("Motif du deverrouillage (obligatoire) :")
    if (!motif) return
    doAction("deverrouiller", { motif })
  }

  const exportVirements = async () => {
    if (societe === "all") return alert("Selectionnez une societe")
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode, format: "json" })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur export"); return }
      if (data.content) {
        const blob = new Blob([data.content], { type: "text/csv" })
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = data.filename || "export.csv"; a.click()
      } else if (data.fichiers?.length > 0) {
        for (const f of data.fichiers) {
          const blob = new Blob([f.content], { type: "text/csv" })
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = f.filename; a.click()
        }
      } else { alert("Aucun fichier genere.") }
      doAction("mark_step", { step: "virements_generes" })
    } catch (e: any) { alert("Erreur reseau: " + (e.message || "")) }
  }

  const comptabiliserPaie = async () => {
    if (societe === "all") return alert("Selectionnez une societe")
    setComptabilisationLoading(true)
    setComptabilisationResult(null)
    try {
      const data = await fetch("/api/rh/paie/comptabiliser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_periode: true, societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setComptabilisationResult(`${data.nb_ecritures} ecritures generees pour ${data.nb_bulletins} bulletin(s)`)
      doAction("mark_step", { step: "comptabilise" })
      load(); loadWorkflow()
    } catch (e: unknown) {
      setComptabilisationResult(`Erreur : ${e instanceof Error ? e.message : "Erreur inconnue"}`)
    } finally { setComptabilisationLoading(false) }
  }

  const ouvrirPDF = (bulletinId: string) => {
    setPdfLoading(bulletinId)
    window.open(`/api/rh/paie/pdf?bulletin_id=${bulletinId}`, "_blank")
    setPdfLoading(null)
  }

  const bulletinsNonComptabilises = bulletins.filter(b => b.statut === "valide" && !b.comptabilise)

  // Use local bulletins as fallback when workflow API fails (tables not created yet)
  const hasBulletins = bulletins.length > 0 || !!workflow?.bulletins_generes
  const allBrouillon = bulletins.length > 0 && bulletins.every(b => b.statut === "brouillon")
  const localAllValidated = bulletins.length > 0 && bulletins.every(b => b.statut === "valide" || b.verrouille)
  const localAllLocked = bulletins.length > 0 && bulletins.every(b => b.verrouille)

  const isLocked = workflow?.tous_verrouilles || localAllLocked
  const allValidated = workflow?.tous_valides || localAllValidated

  // ─── Workflow Stepper ──────────────────────────────────────────
  const steps: {
    id: string; label: string; desc: string; done: boolean; icon: any;
    link?: string; action?: () => void; actionLabel?: string;
    actionDisabled?: boolean; phase: "process" | "postlock";
  }[] = [
    {
      id: "calcul", label: "Calcul",
      desc: hasBulletins ? `${bulletins.length || workflow?.bulletins_total || 0} bulletin(s)` : "Lancer le calcul",
      done: hasBulletins, icon: Calculator,
      action: calculerBatch, actionLabel: "Calculer la paie",
      actionDisabled: calculating || isLocked, phase: "process",
    },
    {
      id: "validation", label: "Validation",
      desc: hasBulletins ? `${bulletins.filter(b => b.statut === "valide" || b.verrouille).length}/${bulletins.length} valide(s)` : "Apres calcul",
      done: !!allValidated, icon: CheckCircle,
      action: validerTous, actionLabel: "Valider tous",
      actionDisabled: !hasBulletins || allValidated || isLocked, phase: "process",
    },
    {
      id: "verrouillage", label: "Verrouillage",
      desc: isLocked ? "Verrouille" : allValidated ? "Pret a verrouiller" : "Apres validation",
      done: isLocked, icon: Lock,
      action: verrouiller, actionLabel: "Verrouiller",
      actionDisabled: !allValidated || isLocked, phase: "process",
    },
    {
      id: "virements", label: "Virements",
      desc: workflow?.virements_generes ? "Exporte" : "Export banque",
      done: !!workflow?.virements_generes, icon: CreditCard,
      action: exportVirements, actionLabel: "Exporter",
      actionDisabled: !isLocked, phase: "postlock",
    },
    {
      id: "mra", label: "MRA",
      desc: workflow?.mra_declare ? "Declare" : "CSG/NSF/PAYE",
      done: !!workflow?.mra_declare, icon: FileSpreadsheet,
      link: "/rh/exports/paie", phase: "postlock",
    },
    {
      id: "compta", label: "Compta",
      desc: workflow?.tous_comptabilises ? "Ecritures faites" : bulletinsNonComptabilises.length > 0 ? `${bulletinsNonComptabilises.length} a faire` : "Apres verrouillage",
      done: !!workflow?.tous_comptabilises, icon: BookOpen,
      action: comptabiliserPaie, actionLabel: "Comptabiliser",
      actionDisabled: !isLocked || comptabilisationLoading || bulletinsNonComptabilises.length === 0,
      phase: "postlock",
    },
  ]

  // Simulation state
  const [simResult, setSimResult] = useState<{ brut: number; deductions: number; net: number; coutEmployeur: number; detailCSG: string } | null>(null)

  const runSimulation = () => {
    const brut = parseFloat((document.getElementById("sim-brut") as HTMLInputElement)?.value || "0")
    const ot = parseFloat((document.getElementById("sim-ot") as HTMLInputElement)?.value || "0")
    const prime = parseFloat((document.getElementById("sim-prime") as HTMLInputElement)?.value || "0")
    const totalBrut = brut + ot + prime
    const csgRate = totalBrut <= 50000 ? 0.015 : 0.03
    const csg = Math.round(totalBrut * csgRate)
    const nsf = Math.round(totalBrut * 0.015)
    const paye = totalBrut > 25000 ? Math.round((totalBrut - 25000) * 0.10) : 0
    const deductions = csg + nsf + paye
    const net = totalBrut - deductions
    const csgP = Math.round(totalBrut * 0.06)
    const nsfP = Math.round(totalBrut * 0.025)
    const tl = Math.round(totalBrut * 0.01)
    const prgf = Math.round(4.5 * 26)
    const totalCharges = csgP + nsfP + tl + prgf
    setSimResult({
      brut: totalBrut,
      deductions,
      net,
      coutEmployeur: totalBrut + totalCharges,
      detailCSG: `CSG ${(csgRate * 100).toFixed(1)}% + NSF 1.5%${paye > 0 ? " + PAYE " + fmt(paye) : ""}`
    })
  }

  // ─── Inline editing ─────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, number | string>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const startEdit = (b: any) => {
    setEditingId(b.id)
    setEditFields({
      salaire_base: Number(b.salaire_base) || 0,
      heures_sup_montant: Number(b.heures_sup_montant) || 0,
      special_allowance_1: Number(b.special_allowance_1) || 0,
      special_allowance_2: Number(b.special_allowance_2) || 0,
      special_allowance_3: Number(b.special_allowance_3) || 0,
      transport_allowance: Number(b.transport_allowance) || 0,
      petrol_allowance: Number(b.petrol_allowance) || 0,
      jours_absence: Number(b.jours_absence) || 0,
      montant_absence: Number(b.montant_absence) || 0,
      prime_label_1: b.employe?.prime_fixe_1_libelle || "",
      prime_label_2: b.employe?.prime_fixe_2_libelle || "",
      prime_label_3: b.employe?.prime_fixe_3_libelle || "",
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSavingEdit(true)
    try {
      // Save bulletin fields (strip prime_label_ fields which go to employee)
      const bulletinChamps: Record<string, any> = {}
      const empChamps: Record<string, any> = {}
      for (const [k, v] of Object.entries(editFields)) {
        if (k.startsWith("prime_label_")) {
          const n = k.replace("prime_label_", "")
          empChamps[`prime_fixe_${n}_libelle`] = v
        } else {
          bulletinChamps[k] = v
        }
      }
      // Save bulletin
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "modifier_bulletin", bulletin_id: editingId, champs: bulletinChamps })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      // Save prime labels on employee if changed
      const b = bulletins.find(x => x.id === editingId)
      if (b && Object.keys(empChamps).length > 0) {
        await fetch("/api/rh/paie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "modifier_employe", employe_id: b.employe_id, champs: empChamps })
        })
      }
      setEditingId(null)
      load(); loadWorkflow()
    } catch (e: any) { alert("Erreur: " + (e.message || "")) }
    finally { setSavingEdit(false) }
  }

  const [recalcId, setRecalcId] = useState<string | null>(null)
  const recalculerEmploye = async (employe_id: string) => {
    if (societe === "all") return
    setRecalcId(employe_id)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode, employe_ids: [employe_id] })
      })
      const data = await res.json()
      if (!res.ok) alert(data.error || "Erreur")
      load(); loadWorkflow()
    } catch (e: any) { alert("Erreur: " + (e.message || "")) }
    finally { setRecalcId(null) }
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Processus de paie</h1>
            <p className="text-sm text-gray-500">Calcul, validation, verrouillage et exports</p>
          </div>
        </div>

        {/* Period selector */}
        <Card>
          <CardContent className="p-4 flex gap-3 items-center flex-wrap">
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Societe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            {availablePeriodes.length > 0 ? (
              <Select value={periode} onValueChange={setPeriode}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Periode" /></SelectTrigger>
                <SelectContent>
                  {availablePeriodes.map(p => {
                    const d = new Date(p + "-15")
                    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                    return <SelectItem key={p} value={p}>{label.charAt(0).toUpperCase() + label.slice(1)}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            ) : (
              <Input type="month" value={periode || new Date().toISOString().slice(0, 7)} onChange={e => { setPeriode(e.target.value); setPeriodeReady(true) }} className="w-40" />
            )}
            {isLocked && (
              <Badge className="bg-red-100 text-red-700 gap-1"><Lock className="w-3 h-3" />PERIODE VERROUILLEE</Badge>
            )}
          </CardContent>
        </Card>

        {/* ═══ WORKFLOW STEPPER ═══ */}
        {societe !== "all" && (
          <div className="space-y-4">
            {/* Calcul, validation et verrouillage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                  <ShieldCheck className="w-4 h-4 inline mr-1" />
                  Calcul, validation et verrouillage
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {steps.filter(s => s.phase === "process").map(step => {
                    const Icon = step.icon
                    return (
                      <div key={step.id} className={`p-4 rounded-xl border-2 text-center ${
                        step.done
                          ? "border-green-300 bg-green-50"
                          : step.actionDisabled
                            ? "border-gray-200 bg-gray-50"
                            : "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                      }`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          step.done ? "bg-green-100 text-green-700" : step.actionDisabled ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-700"
                        }`}>
                          {step.done ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                        </div>
                        <p className={`text-sm font-bold ${step.done ? "text-green-700" : step.actionDisabled ? "text-gray-400" : "text-blue-700"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                        {step.done ? (
                          <span className="inline-block mt-2 text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full">Fait</span>
                        ) : step.action ? (
                          <Button
                            className="mt-3 h-8 text-xs px-4"
                            style={step.id === "verrouillage" ? { backgroundColor: "#dc2626", color: "white" } : { backgroundColor: NAVY, color: "white" }}
                            disabled={step.actionDisabled || !!actionLoading || calculating}
                            onClick={step.action}
                          >
                            {(actionLoading === step.id || (step.id === "calcul" && calculating)) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {step.actionLabel}
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Post-verrouillage */}
            <Card className={!isLocked ? "opacity-50" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold" style={{ color: GOLD }}>
                  <Lock className="w-4 h-4 inline mr-1" />
                  Apres verrouillage — Exports et comptabilite
                  {!isLocked && <span className="text-xs text-gray-400 font-normal ml-2">— Disponible apres verrouillage</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {steps.filter(s => s.phase === "postlock").map(step => {
                    const Icon = step.icon
                    return (
                      <div key={step.id} className={`p-4 rounded-xl border-2 text-center ${
                        step.done ? "border-green-300 bg-green-50" : isLocked ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"
                      }`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          step.done ? "bg-green-100 text-green-700" : isLocked ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
                        }`}>
                          {step.done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <p className={`text-sm font-bold ${step.done ? "text-green-700" : isLocked ? "text-amber-800" : "text-gray-400"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                        {step.done ? (
                          <span className="inline-block mt-2 text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full">Fait</span>
                        ) : step.action && isLocked ? (
                          <Button
                            className="mt-3 h-8 text-xs px-4"
                            style={{ backgroundColor: GOLD, color: "white" }}
                            disabled={step.actionDisabled || !!actionLoading}
                            onClick={step.action}
                          >
                            {(step.id === "compta" && comptabilisationLoading) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {step.actionLabel}
                          </Button>
                        ) : step.link && isLocked ? (
                          <a href={step.link}>
                            <Button className="mt-3 h-8 text-xs px-4" style={{ backgroundColor: GOLD, color: "white" }}>
                              Declarer MRA
                            </Button>
                          </a>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {comptabilisationResult && (
                  <p className="text-sm font-medium mt-3 p-2 bg-gray-50 rounded border">{comptabilisationResult}</p>
                )}
              </CardContent>
            </Card>

            {/* Lock bar */}
            {isLocked && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <Lock className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs text-red-700 font-medium flex-1">Periode verrouillee — aucune modification possible sur les bulletins.</span>
                <Button onClick={deverrouiller} variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-100 h-7 text-xs shrink-0">
                  <Unlock className="w-3 h-3 mr-1" />Deverrouiller
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        {bulletins.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Masse salariale brute", v: fmt(totaux.masse_salariale_brute || 0), color: `text-[${NAVY}]` },
              { label: "Masse salariale nette", v: fmt(totaux.masse_salariale_nette || 0), color: "text-green-700" },
              { label: "Total deductions", v: fmt((totaux.masse_salariale_brute || 0) - (totaux.masse_salariale_nette || 0)), color: "text-red-600" },
              { label: "Charges patronales", v: fmt(totaux.total_charges_patronales || 0), color: "text-orange-600" },
              { label: "Cout total employeur", v: fmt(totaux.cout_total_employeur || 0), color: "text-[#D4AF37]" },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ BULLETINS TABLE ═══ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle style={{ color: NAVY }}>Bulletins de paie — {periode} ({bulletins.length})</CardTitle>
              <div className="flex gap-2">
                {periode.endsWith("-12") && !isLocked && (
                  <Button onClick={() => {
                    if (societe === "all") return alert("Selectionnez une societe")
                    if (confirm("Calculer le 13eme mois (EOY Bonus) pour tous les employes ?")) {
                      fetch("/api/rh/paie", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode, include_eoy_bonus: true })
                      }).then(() => { load(); loadWorkflow() })
                    }
                  }} variant="outline" className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10" size="sm">
                    13eme mois
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : bulletins.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Aucun bulletin pour cette periode</p>
                <p className="text-sm mt-1">Selectionnez une societe et lancez le calcul via le processus ci-dessus</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employe</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Primes</TableHead>
                    <TableHead className="text-right font-bold">Brut</TableHead>
                    <TableHead className="text-right text-red-600">Deductions</TableHead>
                    <TableHead className="text-right font-bold text-green-700">Net</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulletins.map(b => (
                    <React.Fragment key={b.id}>
                    <TableRow className={b.verrouille ? "bg-gray-50" : ""}>
                      <TableCell className="font-medium">
                        {b.employe?.prenom} {b.employe?.nom}
                        {b.employe?.exclure_mra && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-bold">HORS MRA</span>
                        )}
                        {b.employe?.devise_salaire === "EUR" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold cursor-help">EUR</span>
                            </TooltipTrigger>
                            <TooltipContent><p>Taux: {b.employe?.taux_change_eur || 46.50} MUR</p></TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{b.employe?.poste || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(b.salaire_base)}</TableCell>
                      <TableCell className="text-right text-orange-600 text-sm">
                        {Number(b.heures_sup_montant) > 0 ? fmt(b.heures_sup_montant) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-purple-600 text-sm">
                        {Number(b.special_allowance_1) > 0 ? fmt(b.special_allowance_1) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{fmt(b.salaire_brut)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            <p className="font-bold mb-1">Detail brut :</p>
                            <p>Base: {fmt(b.salaire_base)}</p>
                            {Number(b.transport_allowance) > 0 && <p>Transport: {fmt(b.transport_allowance)}</p>}
                            {Number(b.petrol_allowance) > 0 && <p>Petrol: {fmt(b.petrol_allowance)}</p>}
                            {Number(b.heures_sup_montant) > 0 && <p>OT: {fmt(b.heures_sup_montant)}</p>}
                            {Number(b.special_allowance_1) > 0 && <p>Primes: {fmt(b.special_allowance_1)}</p>}
                            {Number(b.eoy_bonus) > 0 && <p>13eme mois: {fmt(b.eoy_bonus)}</p>}
                            {b.notes && <p className="mt-1 text-gray-400">{b.notes}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right text-red-600 text-sm">{fmt(b.total_deductions)}</TableCell>
                      <TableCell className="text-right font-bold text-green-700">{fmt(b.salaire_net)}</TableCell>
                      <TableCell className="text-right text-orange-500 text-sm">{fmt(b.total_charges_patronales)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[b.statut] || ""}`}>{b.statut}</span>
                          {b.verrouille && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded gap-0.5 flex items-center"><Lock className="w-2.5 h-2.5" />lock</span>}
                          {b.jours_absence > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">{b.jours_absence}j abs.</span>}
                          {b.comptabilise && <span className="px-1.5 py-0.5 bg-green-100 text-green-600 text-xs rounded flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" />cpt.</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {!b.verrouille && b.statut === "brouillon" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => startEdit(b)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Modifier manuellement</TooltipContent>
                            </Tooltip>
                          )}
                          {!b.verrouille && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => recalculerEmploye(b.employe_id)} disabled={recalcId === b.employe_id}>
                                  {recalcId === b.employe_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Recalculer (OT + primes + tout)</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => ouvrirPDF(b.id)} disabled={pdfLoading === b.id}>
                                {pdfLoading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                                PDF
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Telecharger le bulletin PDF</TooltipContent>
                          </Tooltip>
                          {!b.verrouille && !b.employe?.exclure_mra && (
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-amber-600 hover:bg-amber-50 px-1.5" onClick={async () => {
                              if (!confirm(`Marquer ${b.employe?.prenom} ${b.employe?.nom} comme HORS MRA ?\n\nPlus de CSG/NSF/PAYE pour cet employe.`)) return
                              await doAction("modifier_employe", { employe_id: b.employe_id, champs: { exclure_mra: true } })
                            }}>
                              Hors MRA
                            </Button>
                          )}
                          {!b.verrouille && b.statut === "brouillon" && (
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-red-500 hover:bg-red-50 px-1.5" onClick={async () => {
                              if (!confirm(`Supprimer le bulletin de ${b.employe?.prenom} ${b.employe?.nom} ?`)) return
                              await doAction("supprimer_bulletin", { bulletin_id: b.id })
                            }}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Inline edit row */}
                    {editingId === b.id && (
                      <TableRow className="bg-blue-50">
                        <TableCell colSpan={11} className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Pencil className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold text-blue-700">Modifier le bulletin de {b.employe?.prenom} {b.employe?.nom}</span>
                            <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => setEditingId(null)}>
                              <X className="w-3 h-3 mr-1" />Annuler
                            </Button>
                          </div>

                          {/* Salaire et allocations */}
                          <p className="text-[10px] font-bold text-gray-500 mb-1">Salaire et allocations</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                            {[
                              { key: "salaire_base", label: "Salaire base" },
                              { key: "transport_allowance", label: "Transport" },
                              { key: "petrol_allowance", label: "Petrol" },
                              { key: "heures_sup_montant", label: "Heures sup (MUR)" },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-[10px] text-gray-500 block mb-0.5">{f.label}</label>
                                <Input type="number" className="h-8 text-sm"
                                  value={editFields[f.key] ?? 0}
                                  onChange={e => setEditFields(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                                />
                              </div>
                            ))}
                          </div>

                          {/* Primes — libellé libre + montant */}
                          <p className="text-[10px] font-bold text-purple-600 mb-1">Primes (libelle libre)</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                            {[1, 2, 3].map(n => (
                              <div key={n} className="flex gap-2">
                                <div className="flex-1">
                                  <label className="text-[10px] text-gray-500 block mb-0.5">Libelle prime {n}</label>
                                  <Input className="h-8 text-sm" placeholder={`Ex: ${n === 1 ? "Prime fonction" : n === 2 ? "Prime anciennete" : "Autre prime"}`}
                                    value={editFields[`prime_label_${n}`] ?? (b.employe?.[`prime_fixe_${n}_libelle`] || "")}
                                    onChange={e => setEditFields(prev => ({ ...prev, [`prime_label_${n}`]: e.target.value }))}
                                  />
                                </div>
                                <div className="w-28">
                                  <label className="text-[10px] text-gray-500 block mb-0.5">Montant</label>
                                  <Input type="number" className="h-8 text-sm"
                                    value={editFields[`special_allowance_${n}`] ?? 0}
                                    onChange={e => setEditFields(prev => ({ ...prev, [`special_allowance_${n}`]: parseFloat(e.target.value) || 0 }))}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Absences */}
                          <p className="text-[10px] font-bold text-red-500 mb-1">Absences</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">Jours absence</label>
                              <Input type="number" className="h-8 text-sm"
                                value={editFields.jours_absence ?? 0}
                                onChange={e => setEditFields(prev => ({ ...prev, jours_absence: parseFloat(e.target.value) || 0 }))}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">Montant absence</label>
                              <Input type="number" className="h-8 text-sm"
                                value={editFields.montant_absence ?? 0}
                                onChange={e => setEditFields(prev => ({ ...prev, montant_absence: parseFloat(e.target.value) || 0 }))}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <Button size="sm" className="h-8 text-xs" style={{ backgroundColor: NAVY, color: "white" }} onClick={saveEdit} disabled={savingEdit}>
                              {savingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                              Enregistrer
                            </Button>
                            <p className="text-[10px] text-gray-400 self-center">Le bulletin repassera en brouillon apres modification.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ═══ AUDIT LOG ═══ */}
        {audit.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600">Journal d&apos;audit — {periode}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {a.action === "validation" && "Validation"}
                          {a.action === "verrouillage" && "Verrouillage"}
                          {a.action === "deverrouillage" && "Deverrouillage"}
                          {a.action === "export_banque" && "Export banque"}
                          {a.action === "export_mra" && "Export MRA"}
                          {a.action === "comptabilisation" && "Comptabilisation"}
                          {a.action === "calcul" && "Calcul"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{a.user_email || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{a.details ? JSON.stringify(a.details) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Simulation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold" style={{ color: NAVY }}>Simulation de paie</CardTitle>
            <p className="text-sm text-gray-500">Estimez l&apos;impact d&apos;un changement de salaire avant de lancer le calcul officiel.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Salaire brut mensuel (MUR)</label>
                <Input type="number" placeholder="25000" id="sim-brut" defaultValue="25000" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Heures sup estimees (MUR)</label>
                <Input type="number" placeholder="0" id="sim-ot" defaultValue="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Primes (MUR)</label>
                <Input type="number" placeholder="0" id="sim-prime" defaultValue="0" />
              </div>
            </div>
            <Button onClick={runSimulation} style={{ backgroundColor: NAVY }} className="text-white">
              <Calculator className="w-4 h-4 mr-2" />Simuler
            </Button>
            {simResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">Brut total</p>
                  <p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(simResult.brut)}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">Deductions</p>
                  <p className="text-lg font-bold text-red-600">-{fmt(simResult.deductions)}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{simResult.detailCSG}</p>
                </div>
                <div className="p-4 rounded-lg text-center" style={{ background: "rgba(212,175,55,0.1)", border: `2px solid ${GOLD}` }}>
                  <p className="text-xs text-gray-500">Net estime</p>
                  <p className="text-xl font-bold" style={{ color: GOLD }}>{fmt(simResult.net)}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">Cout employeur</p>
                  <p className="text-lg font-bold text-orange-600">{fmt(simResult.coutEmployeur)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
