"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calculator, Download, FileText, BookOpen, AlertTriangle, CheckCircle, Lock, Unlock, ShieldCheck, ArrowRight, Clock, CreditCard, FileSpreadsheet, Receipt } from "lucide-react"
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
        const periods = [...new Set(allBulletins.map((b: any) => (b.periode || "").slice(0, 7)).filter(Boolean))]
        periods.sort((a: string, b: string) => b.localeCompare(a))
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
  const isLocked = workflow?.tous_verrouilles || false
  const allValidated = workflow?.tous_valides || false

  // ─── Workflow Stepper ──────────────────────────────────────────
  const steps = [
    {
      id: "planning",
      label: "Planning",
      desc: "Planning publie et valide",
      done: workflow?.planning_publie,
      icon: Clock,
      link: "/rh/planning",
    },
    {
      id: "pointage",
      label: "Pointage",
      desc: workflow?.pointage_count ? `${workflow.pointage_count} pointage(s)` : "Heures et presences",
      done: workflow?.pointage_valide || workflow?.bulletins_generes,
      icon: Clock,
      link: "/rh/pointage/mensuel",
    },
    {
      id: "ot",
      label: "Heures Sup",
      desc: workflow?.ot_present ? "OT detectes dans bulletins" : "Aucun OT ce mois",
      done: workflow?.ot_valide || workflow?.bulletins_generes,
      icon: AlertTriangle,
      link: "/rh/pointage/mensuel",
    },
    {
      id: "primes",
      label: "Primes",
      desc: workflow?.primes_count ? `${workflow.primes_count} prime(s) saisie(s)` : "Aucune prime ce mois",
      done: workflow?.primes_validees || workflow?.bulletins_generes,
      icon: Receipt,
      link: "/rh/paie/primes",
    },
    {
      id: "calcul",
      label: "Calcul paie",
      desc: `${workflow?.bulletins_total || 0} bulletin(s)`,
      done: workflow?.bulletins_generes,
      icon: Calculator,
      action: calculerBatch,
      actionLabel: "Calculer",
      actionDisabled: calculating || isLocked,
    },
    {
      id: "validation",
      label: "Validation",
      desc: `${workflow?.bulletins_valides || 0}/${workflow?.bulletins_total || 0} valide(s)`,
      done: allValidated,
      icon: CheckCircle,
      action: validerTous,
      actionLabel: "Valider tous",
      actionDisabled: !workflow?.bulletins_generes || allValidated || isLocked,
    },
    {
      id: "verrouillage",
      label: "Verrouillage",
      desc: isLocked ? "Periode verrouillee" : "Verrouiller pour finaliser",
      done: isLocked,
      icon: Lock,
      action: verrouiller,
      actionLabel: "Verrouiller",
      actionDisabled: !allValidated || isLocked,
    },
    {
      id: "virements",
      label: "Virements",
      desc: workflow?.virements_generes ? "Exporte" : "Export banque",
      done: workflow?.virements_generes,
      icon: CreditCard,
      action: exportVirements,
      actionLabel: "Exporter",
      actionDisabled: !isLocked,
    },
    {
      id: "mra",
      label: "MRA",
      desc: workflow?.mra_declare ? "Declare" : "Declarations CSG/NSF/PAYE",
      done: workflow?.mra_declare,
      icon: FileSpreadsheet,
      link: "/rh/exports/paie",
      actionDisabled: !isLocked,
    },
    {
      id: "compta",
      label: "Comptabilite",
      desc: workflow?.tous_comptabilises ? "Ecritures generees" : `${bulletinsNonComptabilises.length} a comptabiliser`,
      done: workflow?.tous_comptabilises,
      icon: Receipt,
      action: comptabiliserPaie,
      actionLabel: "Comptabiliser",
      actionDisabled: !isLocked || comptabilisationLoading || bulletinsNonComptabilises.length === 0,
    },
  ]

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Processus de paie</h1>
            <p className="text-sm text-gray-500">Workflow complet : controle, calcul, validation, verrouillage, exports</p>
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: NAVY }}>
                <ShieldCheck className="w-5 h-5 inline mr-2" />
                Processus de paie — {periode ? new Date(periode + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
                {steps.map((step, i) => {
                  const Icon = step.icon
                  const prevDone = i === 0 || steps[i - 1].done
                  const active = !step.done && prevDone
                  const blocked = !step.done && !prevDone
                  return (
                    <div
                      key={step.id}
                      className={`relative flex flex-col items-center text-center rounded-xl p-3 border-2 transition-all ${
                        step.done
                          ? "border-green-300 bg-green-50"
                          : active
                            ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                            : "border-gray-200 bg-gray-50 opacity-50"
                      }`}
                    >
                      {/* Step number */}
                      <div className={`absolute -top-2 -left-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        step.done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-300 text-white"
                      }`}>
                        {step.done ? "\u2713" : i + 1}
                      </div>

                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-1.5 ${
                        step.done ? "bg-green-100 text-green-700" : active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                      }`}>
                        {step.done ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>

                      {/* Label */}
                      <p className={`text-[11px] font-bold leading-tight ${
                        step.done ? "text-green-700" : active ? "text-blue-700" : "text-gray-400"
                      }`}>
                        {step.label}
                      </p>
                      <p className="text-[9px] text-gray-500 mt-0.5 leading-tight min-h-[22px]">{step.desc}</p>

                      {/* ACTION BUTTON — always visible when relevant */}
                      {step.action && !step.done && !blocked && (
                        <Button
                          size="sm"
                          className="mt-1.5 h-6 text-[10px] px-2 w-full"
                          style={
                            step.id === "verrouillage" ? { backgroundColor: "#dc2626", color: "white" }
                            : step.id === "virements" || step.id === "compta" ? { backgroundColor: GOLD, color: "white" }
                            : { backgroundColor: NAVY, color: "white" }
                          }
                          disabled={step.actionDisabled || !!actionLoading || calculating}
                          onClick={step.action}
                        >
                          {(actionLoading === step.id || (step.id === "calcul" && calculating) || (step.id === "compta" && comptabilisationLoading)) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                          {step.actionLabel}
                        </Button>
                      )}
                      {step.link && !step.done && !blocked && !step.action && (
                        <a href={step.link} className="w-full">
                          <Button size="sm" variant="outline" className="mt-1.5 h-6 text-[10px] px-2 w-full">
                            {step.id === "mra" && isLocked ? "Declarer" : "Ouvrir"}
                          </Button>
                        </a>
                      )}
                      {/* Link for MRA post-lock */}
                      {step.link && isLocked && !step.done && step.id === "mra" && step.action === undefined && blocked && (
                        <a href={step.link} className="w-full">
                          <Button size="sm" className="mt-1.5 h-6 text-[10px] px-2 w-full" style={{ backgroundColor: GOLD, color: "white" }}>
                            Declarer
                          </Button>
                        </a>
                      )}
                      {/* Done badge */}
                      {step.done && (
                        <span className="text-[9px] text-green-600 font-semibold mt-1">Fait</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Unlock button if locked */}
              {isLocked && (
                <div className="mt-3 flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                  <Lock className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-700 font-medium flex-1">Periode verrouillee — les bulletins ne peuvent plus etre modifies.</span>
                  <Button onClick={deverrouiller} variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-100 h-7 text-xs">
                    <Unlock className="w-3 h-3 mr-1" />Deverrouiller
                  </Button>
                </div>
              )}

              {/* Comptabilisation result */}
              {comptabilisationResult && (
                <p className="text-sm font-medium mt-2 p-2 bg-gray-50 rounded">{comptabilisationResult}</p>
              )}
            </CardContent>
          </Card>
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
                    <TableRow key={b.id} className={b.verrouille ? "bg-gray-50" : ""}>
                      <TableCell className="font-medium">
                        {b.employe?.prenom} {b.employe?.nom}
                        {b.employe?.devise_salaire === "EUR" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold cursor-help">EUR</span>
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
                      <TableCell className="text-right font-semibold">{fmt(b.salaire_brut)}</TableCell>
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
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => ouvrirPDF(b.id)} disabled={pdfLoading === b.id}>
                          {pdfLoading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
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
            <p className="text-sm text-gray-500">Estimez l&apos;impact d&apos;un changement de salaire.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Salaire brut mensuel (MUR)</label>
                <Input type="number" placeholder="25000" id="sim-brut" defaultValue="25000" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Heures sup estimees</label>
                <Input type="number" placeholder="0" id="sim-ot" defaultValue="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Primes (MUR)</label>
                <Input type="number" placeholder="0" id="sim-prime" defaultValue="0" />
              </div>
            </div>
            <Button onClick={() => {
              const brut = parseFloat((document.getElementById("sim-brut") as HTMLInputElement)?.value || "0")
              const ot = parseFloat((document.getElementById("sim-ot") as HTMLInputElement)?.value || "0")
              const prime = parseFloat((document.getElementById("sim-prime") as HTMLInputElement)?.value || "0")
              const totalBrut = brut + ot + prime
              const csgRate = totalBrut <= 50000 ? 0.015 : 0.03
              const csg = Math.round(totalBrut * csgRate)
              const nsf = Math.round(totalBrut * 0.015)
              const paye = totalBrut > 25000 ? Math.round((totalBrut - 25000) * 0.10) : 0
              const net = totalBrut - csg - nsf - paye
              const csgP = Math.round(totalBrut * 0.06)
              const nsfP = Math.round(totalBrut * 0.025)
              const tl = Math.round(totalBrut * 0.01)
              const prgf = Math.round(4.5 * 26)
              const totalCharges = csgP + nsfP + tl + prgf
              const el = document.getElementById("sim-result")
              if (el) el.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div class="p-4 bg-blue-50 rounded-lg text-center">
                    <p class="text-xs text-gray-500">Brut total</p>
                    <p class="text-lg font-bold" style="color:${NAVY}">${fmt(totalBrut)}</p>
                  </div>
                  <div class="p-4 bg-red-50 rounded-lg text-center">
                    <p class="text-xs text-gray-500">Deductions</p>
                    <p class="text-lg font-bold text-red-600">-${fmt(csg + nsf + paye)}</p>
                  </div>
                  <div class="p-4 rounded-lg text-center" style="background:rgba(212,175,55,0.1);border:2px solid ${GOLD};">
                    <p class="text-xs text-gray-500">Net estime</p>
                    <p class="text-xl font-bold" style="color:${GOLD};">${fmt(net)}</p>
                  </div>
                  <div class="p-4 bg-orange-50 rounded-lg text-center">
                    <p class="text-xs text-gray-500">Cout employeur</p>
                    <p class="text-lg font-bold text-orange-600">${fmt(totalBrut + totalCharges)}</p>
                  </div>
                </div>
              `
            }} style={{ backgroundColor: NAVY }} className="text-white">
              <Calculator className="w-4 h-4 mr-2" />Simuler
            </Button>
            <div id="sim-result" />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
