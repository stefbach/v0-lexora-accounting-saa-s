"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Users, FileText, Building2, Calculator, Download, Upload,
  Eye, CheckCircle, DollarSign, TrendingUp, AlertCircle,
  Clock, Lock, Banknote, ArrowRight, AlertTriangle
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-yellow-100 text-yellow-800",
  valide: "bg-blue-100 text-blue-800",
  paye: "bg-green-100 text-green-800",
}

const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  valide: "Valid\u00e9",
  paye: "Pay\u00e9",
}

interface Societe { id: string; nom: string }
interface Employe { id: string; code: string; nom: string; prenom: string; poste?: string }
interface Bulletin {
  id: string
  employe_id: string
  societe_id: string
  periode: string
  salaire_brut: number
  salaire_net: number
  total_charges_patronales: number
  paye: number
  csg_salarie: number
  nsf_salarie: number
  statut: string
  employe?: { code: string; nom: string; prenom: string; poste?: string }
}

export default function ClientSalairesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [employes, setEmployes] = useState<Employe[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [totaux, setTotaux] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [selectedPeriode, setSelectedPeriode] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [exportLoading, setExportLoading] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("bulletins")
  const [periodClosed, setPeriodClosed] = useState(false)
  const [periodClosing, setPeriodClosing] = useState(false)
  const [periodOpening, setPeriodOpening] = useState(false)
  const [virementDone, setVirementDone] = useState(false)
  const [csgExported, setCsgExported] = useState(false)
  const [payeExported, setPayeExported] = useState(false)
  const [prgfDone, setPrgfDone] = useState(false)
  const [prevBulletins, setPrevBulletins] = useState<Bulletin[]>([])

  // Fetch societes
  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then((json) => {
        const list = json.societes || json.data || []
        setSocietes(list)
        if (list.length > 0 && !selectedSociete) {
          setSelectedSociete(list[0].id)
        }
      })
      .catch(() => setSocietes([]))
  }, [])

  // Fetch bulletins and employees when societe or periode changes
  const fetchData = useCallback(async () => {
    if (!selectedSociete) return
    setFetching(true)
    try {
      const [bulletinsRes, employesRes] = await Promise.all([
        fetch(`/api/rh/paie?societe_id=${selectedSociete}&periode=${selectedPeriode}`),
        fetch(`/api/rh/employes?societe_id=${selectedSociete}`),
      ])
      const bulletinsJson = await bulletinsRes.json()
      const employesJson = await employesRes.json()
      setBulletins(bulletinsJson.bulletins || [])
      setTotaux(bulletinsJson.totaux || null)
      setEmployes(employesJson.employes || employesJson.data || [])
      // Fetch previous period bulletins for variance alerts
      try {
        const [y, m] = selectedPeriode.split("-").map(Number)
        const prevDate = new Date(y, m - 2, 1)
        const prevPeriode = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`
        const prevRes = await fetch(`/api/rh/paie?societe_id=${selectedSociete}&periode=${prevPeriode}`)
        const prevJson = await prevRes.json()
        setPrevBulletins(prevJson.bulletins || [])
      } catch { setPrevBulletins([]) }
    } catch {
      setBulletins([])
      setEmployes([])
      setPrevBulletins([])
    } finally {
      setFetching(false)
    }
  }, [selectedSociete, selectedPeriode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // KPI calculations
  const masseSalariale = totaux?.masse_salariale_brute || bulletins.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0)
  const masseNette = totaux?.masse_salariale_nette || bulletins.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0)
  const chargesPatronales = totaux?.total_charges_patronales || bulletins.reduce((s, b) => s + (Number(b.total_charges_patronales) || 0), 0)
  const nbEmployes = employes.length

  // Batch calculation
  async function handleCalculerPaie() {
    if (!selectedSociete || !selectedPeriode) return
    setCalculating(true)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calculer_batch",
          societe_id: selectedSociete,
          periode: selectedPeriode,
        }),
      })
      const json = await res.json()
      if (json.error && json.nb === 0) {
        alert("Erreur: " + json.error + (json.debug ? `\n\nDebug: ${JSON.stringify(json.debug)}` : ''))
      } else {
        let msg = `Paie calculee pour ${json.nb || 0} employe(s) sur ${json.nb_employes || '?'}`
        if (json.erreurs && json.erreurs.length > 0) {
          msg += `\n\n${json.erreurs.length} erreur(s):\n${json.erreurs.join('\n')}`
        }
        alert(msg)
        fetchData()
      }
    } catch {
      alert("Erreur lors du calcul")
    } finally {
      setCalculating(false)
    }
  }

  // Validate bulletin
  async function handleValider(employe_id: string) {
    try {
      await fetch("/api/rh/paie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valider",
          employe_id,
          periode: selectedPeriode,
        }),
      })
      fetchData()
    } catch {
      alert("Erreur lors de la validation")
    }
  }

  // Export functions
  async function handleExport(type: string) {
    if (!selectedSociete || !selectedPeriode) return
    setExportLoading(type)
    try {
      const endpoint = type === "csg" ? "/api/rh/exports/csg-mra" :
                       type === "paye" ? "/api/rh/exports/paye-mra" :
                       "/api/rh/exports/virement"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: selectedSociete, periode: selectedPeriode }),
      })
      const json = await res.json()
      if (json.error) {
        alert("Erreur: " + json.error)
        return
      }
      // Download CSV
      const csvContent = json.detail_csv || json.csv || json.recap_csv || ""
      if (csvContent) {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = json.filename_detail || json.filename || `export_${type}_${selectedPeriode}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
      // Track workflow step completion
      if (type === "csg") setCsgExported(true)
      if (type === "paye") setPayeExported(true)
      if (type === "virement") setVirementDone(true)
    } catch {
      alert("Erreur export")
    } finally {
      setExportLoading(null)
    }
  }

  // Import payroll
  async function handleImport() {
    if (!importFile || !selectedSociete || !selectedPeriode) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append("file", importFile)
      formData.append("societe_id", selectedSociete)
      formData.append("periode", selectedPeriode)
      const res = await fetch("/api/rh/paie/import", { method: "POST", body: formData })
      const json = await res.json()
      setImportResult(json)
      if (!json.error) fetchData()
    } catch {
      setImportResult({ error: "Erreur lors de l'import" })
    } finally {
      setImportLoading(false)
    }
  }

  // Period management
  function getPeriodeDates(periode: string) {
    const [y, m] = periode.split("-").map(Number)
    // Standard: 25th of previous month to 24th of current month
    const prevMonth = m === 1 ? 12 : m - 1
    const prevYear = m === 1 ? y - 1 : y
    const dateDebut = `${prevYear}-${String(prevMonth).padStart(2, "0")}-25`
    const dateFin = `${y}-${String(m).padStart(2, "0")}-24`
    const MOIS_FR = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"]
    const label = `${MOIS_FR[m - 1]}, ${y} -- ${String(prevMonth).padStart(2, "0")}/${prevYear} to ${String(m).padStart(2, "0")}/${y}`
    return { dateDebut, dateFin, label }
  }

  async function handleCloturerPeriode() {
    if (!selectedSociete || !selectedPeriode) return
    if (!confirm("Cloturer la periode ? Les bulletins ne pourront plus etre modifies.")) return
    setPeriodClosing(true)
    try {
      // Validate all bulletins
      for (const b of bulletins) {
        if (b.statut === "brouillon") {
          await fetch("/api/rh/paie", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "valider",
              employe_id: b.employe_id,
              periode: selectedPeriode,
            }),
          })
        }
      }
      setPeriodClosed(true)
      fetchData()
    } catch {
      alert("Erreur lors de la cloture")
    } finally {
      setPeriodClosing(false)
    }
  }

  async function handleOuvrirPeriode() {
    if (!confirm("Ouvrir la periode ? Les bulletins pourront etre modifies. (Admin uniquement)")) return
    setPeriodOpening(true)
    try {
      setPeriodClosed(false)
    } finally {
      setPeriodOpening(false)
    }
  }

  const periodeInfo = getPeriodeDates(selectedPeriode)

  // View PDF
  function openPDF(bulletinId: string) {
    window.open(`/api/rh/paie/pdf?bulletin_id=${bulletinId}`, "_blank")
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Vous n&apos;avez pas acc&egrave;s &agrave; cette section.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Workflow steps computation
  const hasBulletins = bulletins.length > 0
  const workflowSteps = [
    { label: "Pointage", icon: Clock, done: true },
    { label: "Calcul", icon: Calculator, done: hasBulletins },
    { label: "Cloture", icon: Lock, done: periodClosed },
    { label: "Virement", icon: Banknote, done: virementDone },
    { label: "NSF/CSG", icon: FileText, done: csgExported },
    { label: "PAYE", icon: FileText, done: payeExported },
    { label: "PRGF", icon: FileText, done: prgfDone },
  ]
  const currentStepIdx = workflowSteps.findIndex(s => !s.done)

  // Net pay variance alerts computation
  const varianceAlerts: { text: string; color: string }[] = []
  if (hasBulletins && prevBulletins.length > 0) {
    const prevMap = new Map<string, Bulletin>()
    prevBulletins.forEach(b => prevMap.set(b.employe_id, b))
    let drop20 = 0, drop10 = 0, rise10 = 0
    const anomalies: string[] = []
    bulletins.forEach(b => {
      const prev = prevMap.get(b.employe_id)
      if (!prev) return
      const prevNet = Number(prev.salaire_net) || 0
      const curNet = Number(b.salaire_net) || 0
      if (prevNet === 0) return
      const pct = ((curNet - prevNet) / prevNet) * 100
      if (pct <= -20) { drop20++; anomalies.push(`${b.employe?.nom || ""} ${b.employe?.prenom || ""}`) }
      else if (pct <= -10) drop10++
      else if (pct >= 10) rise10++
    })
    if (drop20 > 0) varianceAlerts.push({ text: `${drop20} employe(s) avec baisse de net > 20%`, color: "red" })
    if (drop10 > 0) varianceAlerts.push({ text: `${drop10} employe(s) avec baisse de net > 10%`, color: "orange" })
    if (rise10 > 0) varianceAlerts.push({ text: `${rise10} employe(s) avec hausse de net > 10%`, color: "green" })
    anomalies.forEach(name => varianceAlerts.push({ text: `Anomalie salaire de base: ${name} a une diminution anormale`, color: "red" }))
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Gestion de la paie
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulletins de paie, calcul et exports MRA
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="S&eacute;lectionner une soci&eacute;t&eacute;" />
                </SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={selectedPeriode}
              onChange={(e) => setSelectedPeriode(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
        </div>
      </div>

      {/* Payroll Workflow Timeline */}
      <Card className="border border-gray-200">
        <CardContent className="py-4 px-6 overflow-x-auto">
          <div className="flex items-center justify-between">
            {workflowSteps.map((step, idx) => {
              const StepIcon = step.icon
              const isDone = step.done
              const isCurrent = idx === currentStepIdx
              const bgColor = isDone ? "bg-green-500" : isCurrent ? "bg-[#C9A84C]" : "bg-gray-300"
              const textColor = isDone ? "text-green-700" : isCurrent ? "text-[#C9A84C]" : "text-gray-400"
              const toggleStep = () => {
                if (idx === 2) setPeriodClosed(!periodClosed)
                else if (idx === 3) setVirementDone(!virementDone)
                else if (idx === 4) setCsgExported(!csgExported)
                else if (idx === 5) setPayeExported(!payeExported)
                else if (idx === 6) setPrgfDone(!prgfDone)
              }
              return (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center cursor-pointer" onClick={toggleStep} title={idx >= 2 ? `Cliquer pour basculer ${step.label}` : ""}>
                    <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center transition-colors`}>
                      {isDone ? (
                        <CheckCircle className="w-5 h-5 text-white" />
                      ) : (
                        <StepIcon className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${textColor}`}>{step.label}</span>
                  </div>
                  {idx < workflowSteps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-1 mt-[-14px] ${idx < currentStepIdx || (currentStepIdx === -1) ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Alertes Paie - Net Pay Variance */}
      {varianceAlerts.length > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Alertes Paie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {varianceAlerts.map((alert, i) => {
              const colors = alert.color === "red"
                ? "bg-red-50 border-red-200 text-red-700"
                : alert.color === "orange"
                ? "bg-orange-50 border-orange-200 text-orange-700"
                : "bg-green-50 border-green-200 text-green-700"
              const Icon = alert.color === "green" ? TrendingUp : AlertTriangle
              return (
                <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${colors}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{alert.text}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Masse salariale brute</CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{fmt(masseSalariale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employ&eacute;s</CardTitle>
            <Users className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{nbEmployes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Charges patronales</CardTitle>
            <TrendingUp className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#C9A84C" }}>{fmt(chargesPatronales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Masse nette</CardTitle>
            <FileText className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{fmt(masseNette)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Period Settings */}
      <Card className="border border-gray-200">
        <CardContent className="py-4 px-6 overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Current Period</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "#1E2A4A" }}>
                  {periodeInfo.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {periodeInfo.dateDebut} to {periodeInfo.dateFin}
                </p>
              </div>
              <Badge className={periodClosed
                ? "bg-red-100 text-red-800 border-red-300"
                : "bg-green-100 text-green-800 border-green-300"
              }>
                {periodClosed ? (
                  <><Lock className="h-3 w-3 mr-1" /> Closed</>
                ) : (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Open</>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {!periodClosed ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloturerPeriode}
                  disabled={periodClosing || bulletins.length === 0}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {periodClosing ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Cloture en cours...</>
                  ) : (
                    <><Lock className="mr-1 h-3 w-3" /> Cloturer la periode</>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOuvrirPeriode}
                  disabled={periodOpening || profile?.role !== "admin" && profile?.role !== "client_admin"}
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  {periodOpening ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Opening...</>
                  ) : (
                    <><CheckCircle className="mr-1 h-3 w-3" /> Ouvrir la periode</>
                  )}
                </Button>
              )}
            </div>
          </div>
          {periodClosed && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <Lock className="h-4 w-4 flex-shrink-0" />
              <span>Periode cloturee. Les bulletins sont valides et ne peuvent plus etre modifies. Seul un administrateur peut rouvrir la periode.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bulletins">Bulletins</TabsTrigger>
          <TabsTrigger value="calculer">Calculer</TabsTrigger>
          <TabsTrigger value="exports">Exports & Import</TabsTrigger>
        </TabsList>

        {/* Tab: Bulletins */}
        <TabsContent value="bulletins">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>
                Bulletins de paie &mdash; {selectedPeriode} ({bulletins.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fetching ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#C9A84C" }} />
                </div>
              ) : bulletins.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun bulletin pour cette p&eacute;riode.</p>
                  <p className="text-sm mt-1">Allez dans l&apos;onglet &quot;Calculer&quot; pour g&eacute;n&eacute;rer les bulletins.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employ&eacute;</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.employe?.nom || ""} {b.employe?.prenom || ""}
                        </TableCell>
                        <TableCell>{b.employe?.code || ""}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.salaire_brut) || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.salaire_net) || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.paye) || 0)}</TableCell>
                        <TableCell>
                          <Badge className={STATUT_COLORS[b.statut] || "bg-gray-100 text-gray-600"}>
                            {STATUT_LABELS[b.statut] || b.statut}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPDF(b.id)}
                              title="Voir PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {b.statut === "brouillon" && !periodClosed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleValider(b.employe_id)}
                                title="Valider"
                              >
                                <CheckCircle className="h-4 w-4" style={{ color: "#22c55e" }} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Calculer */}
        <TabsContent value="calculer">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Calcul de paie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Lancez le calcul de paie pour tous les employ&eacute;s actifs de la soci&eacute;t&eacute; s&eacute;lectionn&eacute;e
                pour la p&eacute;riode <strong>{selectedPeriode}</strong>.
              </p>
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Soci&eacute;t&eacute; :</span>{" "}
                  <strong>{societes.find((s) => s.id === selectedSociete)?.nom || "---"}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">P&eacute;riode :</span>{" "}
                  <strong>{selectedPeriode}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Employ&eacute;s actifs :</span>{" "}
                  <strong>{nbEmployes}</strong>
                </div>
              </div>
              <Button
                onClick={handleCalculerPaie}
                disabled={calculating || !selectedSociete || periodClosed}
                style={{ backgroundColor: "#1E2A4A" }}
                className="text-white"
              >
                {calculating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calcul en cours...
                  </>
                ) : periodClosed ? (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Periode cloturee
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Calculer paie
                  </>
                )}
              </Button>
              {bulletins.length > 0 && (
                <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: "#C9A84C33" }}>
                  <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                    R&eacute;sultat du dernier calcul
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Bulletins</p>
                      <p className="font-semibold">{bulletins.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Masse brute</p>
                      <p className="font-semibold">{fmt(masseSalariale)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Masse nette</p>
                      <p className="font-semibold">{fmt(masseNette)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Charges patronales</p>
                      <p className="font-semibold">{fmt(chargesPatronales)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Exports & Import */}
        <TabsContent value="exports">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Exports */}
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Exports MRA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  G&eacute;n&eacute;rez les fichiers CSV pour les d&eacute;clarations MRA.
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("csg")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "csg" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export CSG / NSF MRA
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("paye")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "paye" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export PAYE MRA
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("virement")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "virement" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Virement bancaire
                </Button>
              </CardContent>
            </Card>

            {/* Import */}
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Importer paie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Importez des bulletins de paie pr&eacute;-calcul&eacute;s depuis un logiciel externe (CSV).
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="import-file" className="text-sm">Fichier CSV</Label>
                    <Input
                      id="import-file"
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="mt-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Colonnes attendues : employe_code, periode, salaire_brut, salaire_net, csg_salarie,
                    csg_patronal, nsf_salarie, nsf_patronal, paye, training_levy
                  </p>
                  <Button
                    onClick={handleImport}
                    disabled={!importFile || importLoading || !selectedSociete}
                    style={{ backgroundColor: "#C9A84C" }}
                    className="text-white w-full"
                  >
                    {importLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Importer paie
                      </>
                    )}
                  </Button>
                  {importResult && (
                    <div className={`p-3 rounded-lg text-sm ${importResult.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                      {importResult.error ? (
                        <p>{importResult.error}</p>
                      ) : (
                        <>
                          <p className="font-medium">{importResult.imported || 0} bulletin(s) import&eacute;(s)</p>
                          {importResult.errors?.length > 0 && (
                            <ul className="mt-1 list-disc list-inside">
                              {importResult.errors.map((err: string, i: number) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
