"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Loader2, Plus, CheckCircle, XCircle, AlertTriangle,
  Calendar, Thermometer, Clock, ShieldAlert, Users, FileWarning
} from "lucide-react"

// ─── Constants ───────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  AL: "Congé annuel",
  SL: "Congé maladie",
  UL: "Sans solde",
  MAT: "Maternité (14 sem.)",
  PAT: "Paternité (5j)",
  CAR: "Soins famille",
  WI: "Accident travail",
  COM: "Décès proche",
  PH: "Jour férié travaillé",
  ABS: "Absence",
}

const TYPE_COLORS: Record<string, string> = {
  AL: "bg-blue-100 text-blue-800",
  SL: "bg-orange-100 text-orange-800",
  MAT: "bg-pink-100 text-pink-800",
  PAT: "bg-indigo-100 text-indigo-800",
  UL: "bg-yellow-100 text-yellow-800",
  CAR: "bg-purple-100 text-purple-800",
  ABS: "bg-red-100 text-red-800",
  WI: "bg-gray-100 text-gray-800",
  COM: "bg-gray-100 text-gray-600",
  PH: "bg-emerald-100 text-emerald-800",
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuve",
  refuse: "Refuse",
  annule: "Annule",
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
  annule: "bg-gray-100 text-gray-600",
}

// ─── Types ───────────────────────────────────────────────────────
interface BalanceRow {
  employe_id: string
  nom: string
  prenom: string
  poste: string
  societe_id: string
  sexe: string
  date_arrivee: string | null
  al_droit: number
  al_pris: number
  al_solde: number
  sl_droit: number
  sl_pris: number
  sl_solde: number
  status_color: string
  sick_cert_alert: boolean
}

interface KPIs {
  total_al_taken: number
  total_sl_taken: number
  pending_requests: number
  alerts: number
}

interface CongeRecord {
  id: string
  employe_id: string
  type_conge: string
  date_debut: string
  date_fin: string
  nb_jours: number
  statut: string
  motif: string | null
  document_url: string | null
  commentaire_manager: string | null
  date_approbation: string | null
  created_at: string
  employe?: {
    nom: string
    prenom: string
    poste: string
    societe_id: string
  } | null
}

// ─── Helper ──────────────────────────────────────────────────────
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function statusDot(color: string) {
  const cls =
    color === "green" ? "bg-green-500" :
    color === "orange" ? "bg-orange-400" :
    "bg-red-500"
  return <span className={`inline-block w-3 h-3 rounded-full ${cls}`} />
}

// ─── Page component ──────────────────────────────────────────────
export default function CongesPage() {
  // State
  const [tab, setTab] = useState("dashboard")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])

  // Balances tab
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [kpis, setKpis] = useState<KPIs>({ total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 })
  const [loadingBalances, setLoadingBalances] = useState(true)

  // Demandes tab
  const [conges, setConges] = useState<CongeRecord[]>([])
  const [loadingConges, setLoadingConges] = useState(true)

  // Absents today tab
  const [absentsAvecConge, setAbsentsAvecConge] = useState<any[]>([])
  const [employesSansConge, setEmployesSansConge] = useState<any[]>([])
  const [loadingAbsents, setLoadingAbsents] = useState(true)

  // Historique tab
  const [allConges, setAllConges] = useState<CongeRecord[]>([])
  const [loadingHisto, setLoadingHisto] = useState(true)
  const [histoFilter, setHistoFilter] = useState("all")

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employe_id: "", type_conge: "AL", date_debut: "", date_fin: "", motif: ""
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [refusDialog, setRefusDialog] = useState<string | null>(null)
  const [refusMotif, setRefusMotif] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Search
  const [searchBal, setSearchBal] = useState("")
  const [searchHisto, setSearchHisto] = useState("")

  // ─── Data fetching ─────────────────────────────────────────────
  const socParam = societe !== "all" ? `societe_id=${societe}` : ""

  const loadSocietes = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/societes")
      const data = await res.json()
      setSocietes(data.societes || [])
    } catch (e) { console.error(e) }
  }, [])

  const loadEmployes = useCallback(async () => {
    try {
      const res = await fetch(`/api/rh/employes${societe !== "all" ? `?societe_id=${societe}` : ""}`)
      const data = await res.json()
      setEmployes(data.employes || [])
    } catch (e) { console.error(e) }
  }, [societe])

  const loadBalances = useCallback(async () => {
    setLoadingBalances(true)
    try {
      const params = new URLSearchParams({ action: "balances" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setBalances(data.balances || [])
      setKpis(data.kpis || { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 })
    } catch (e) { console.error(e) }
    finally { setLoadingBalances(false) }
  }, [societe])

  const loadDemandes = useCallback(async () => {
    setLoadingConges(true)
    try {
      const params = new URLSearchParams({ statut: "en_attente" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setConges(data.conges || [])
    } catch (e) { console.error(e) }
    finally { setLoadingConges(false) }
  }, [societe])

  const loadAbsentsToday = useCallback(async () => {
    setLoadingAbsents(true)
    try {
      const params = new URLSearchParams({ action: "absents_today" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setAbsentsAvecConge(data.absents_avec_conge || [])
      setEmployesSansConge(data.employes_sans_conge || [])
    } catch (e) { console.error(e) }
    finally { setLoadingAbsents(false) }
  }, [societe])

  const loadHistorique = useCallback(async () => {
    setLoadingHisto(true)
    try {
      const params = new URLSearchParams()
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setAllConges(data.conges || [])
    } catch (e) { console.error(e) }
    finally { setLoadingHisto(false) }
  }, [societe])

  // Initial load
  useEffect(() => { loadSocietes() }, [loadSocietes])
  useEffect(() => { loadEmployes() }, [loadEmployes])

  // Load data per tab
  useEffect(() => {
    if (tab === "dashboard") loadBalances()
    else if (tab === "demandes") loadDemandes()
    else if (tab === "absents") loadAbsentsToday()
    else if (tab === "historique") loadHistorique()
  }, [tab, societe, loadBalances, loadDemandes, loadAbsentsToday, loadHistorique])

  // ─── Societe map ──────────────────────────────────────────────
  const societeMap = new Map(societes.map((s: any) => [s.id, s.nom]))

  // ─── Actions ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.employe_id || !form.date_debut || !form.date_fin) {
      setFormError("Champs requis manquants")
      return
    }
    if (form.date_fin < form.date_debut) {
      setFormError("La date de fin doit etre apres la date de debut")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setDialogOpen(false)
      setForm({ employe_id: "", type_conge: "AL", date_debut: "", date_fin: "", motif: "" })
      // Reload current tab data
      if (tab === "dashboard") loadBalances()
      if (tab === "demandes") loadDemandes()
      if (tab === "historique") loadHistorique()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSaving(false)
    }
  }

  const approuver = async (id: string) => {
    setActionLoading(id)
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approuver", id }),
      })
      loadDemandes()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const refuser = async () => {
    if (!refusDialog || !refusMotif.trim()) return
    setActionLoading(refusDialog)
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refuser", id: refusDialog, motif_refus: refusMotif }),
      })
      setRefusDialog(null)
      setRefusMotif("")
      loadDemandes()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const sickRetroactif = async (empId: string) => {
    setActionLoading(empId)
    const today = new Date().toISOString().split("T")[0]
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sick_retroactif",
          employe_id: empId,
          date_debut: today,
          date_fin: today,
          motif: "Absence justifiee retroactivement (SL)",
        }),
      })
      loadAbsentsToday()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const absenceInjustifiee = async (empId: string) => {
    setActionLoading(empId)
    const today = new Date().toISOString().split("T")[0]
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "absence_injustifiee",
          employe_id: empId,
          date_debut: today,
          date_fin: today,
          motif: "Absence injustifiee - deduction salaire",
        }),
      })
      loadAbsentsToday()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  // ─── Filtered data ────────────────────────────────────────────
  const filteredBalances = balances.filter(b => {
    if (!searchBal) return true
    const q = searchBal.toLowerCase()
    return `${b.prenom} ${b.nom}`.toLowerCase().includes(q) || (b.poste || "").toLowerCase().includes(q)
  })

  const filteredHisto = allConges.filter(c => {
    const matchType = histoFilter === "all" || c.type_conge === histoFilter
    const matchSearch = !searchHisto || (
      `${c.employe?.prenom || ""} ${c.employe?.nom || ""}`.toLowerCase().includes(searchHisto.toLowerCase())
    )
    return matchType && matchSearch
  })

  // ─── Spinner component ────────────────────────────────────────
  const Spinner = () => (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Absences & Conges</h1>
          <p className="text-sm text-gray-500">
            Gestion des conges - Workers&apos; Rights Act 2019 (Maurice)
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Toutes societes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les societes</SelectItem>
              {societes.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { setDialogOpen(true); setFormError(null) }} className="bg-[#1E2A4A] text-white">
            <Plus className="w-4 h-4 mr-2" />Nouvelle demande
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">AL pris (total)</p>
                <p className="text-2xl font-bold text-blue-700">{kpis.total_al_taken}<span className="text-sm font-normal text-gray-400"> jours</span></p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">SL pris (total)</p>
                <p className="text-2xl font-bold text-orange-600">{kpis.total_sl_taken}<span className="text-sm font-normal text-gray-400"> jours</span></p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Thermometer className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Demandes en attente</p>
                <p className="text-2xl font-bold text-yellow-600">{kpis.pending_requests}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Alertes certificat</p>
                <p className="text-2xl font-bold text-red-600">{kpis.alerts}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
          <TabsTrigger value="demandes" className="relative">
            Demandes
            {kpis.pending_requests > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {kpis.pending_requests}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="absents">Absences aujourd&apos;hui</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: TABLEAU DE BORD ═══ */}
        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1E2A4A]">
                  Soldes de conges par employe - {new Date().getFullYear()}
                </CardTitle>
                <Input
                  placeholder="Rechercher un employe..."
                  value={searchBal}
                  onChange={e => setSearchBal(e.target.value)}
                  className="w-64"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                AL = Conge annuel (20j/an) | SL = Conge maladie (15j/an) | Prorata applique pour les nouveaux employes
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {loadingBalances ? <Spinner /> : filteredBalances.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucun employe trouve
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">Statut</TableHead>
                        <TableHead>Employe</TableHead>
                        <TableHead>Poste</TableHead>
                        <TableHead className="text-center">AL Droit</TableHead>
                        <TableHead className="text-center">AL Pris</TableHead>
                        <TableHead className="text-center">AL Solde</TableHead>
                        <TableHead className="text-center">SL Droit</TableHead>
                        <TableHead className="text-center">SL Pris</TableHead>
                        <TableHead className="text-center">SL Solde</TableHead>
                        <TableHead>Alertes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBalances.map(b => (
                        <TableRow key={b.employe_id}>
                          <TableCell>{statusDot(b.status_color)}</TableCell>
                          <TableCell className="font-medium">{b.prenom} {b.nom}</TableCell>
                          <TableCell className="text-sm text-gray-500">{b.poste || "---"}</TableCell>
                          <TableCell className="text-center text-sm">{b.al_droit}</TableCell>
                          <TableCell className="text-center text-sm">{b.al_pris}</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${b.al_solde <= 0 ? "text-red-600" : b.al_solde <= 5 ? "text-orange-500" : "text-green-600"}`}>
                              {b.al_solde}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm">{b.sl_droit}</TableCell>
                          <TableCell className="text-center text-sm">{b.sl_pris}</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${b.sl_solde <= 0 ? "text-red-600" : b.sl_solde <= 3 ? "text-orange-500" : "text-green-600"}`}>
                              {b.sl_solde}
                            </span>
                          </TableCell>
                          <TableCell>
                            {b.sick_cert_alert && (
                              <Badge variant="destructive" className="text-xs whitespace-nowrap">
                                <FileWarning className="w-3 h-3 mr-1" />
                                Certificat medical requis
                              </Badge>
                            )}
                            {b.al_solde <= 0 && (
                              <Badge variant="outline" className="text-xs text-red-600 border-red-300 ml-1 whitespace-nowrap">
                                AL epuise
                              </Badge>
                            )}
                            {b.sl_solde <= 0 && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 ml-1 whitespace-nowrap">
                                SL epuise
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 2: DEMANDES EN ATTENTE ═══ */}
        <TabsContent value="demandes">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#1E2A4A]">
                Demandes en attente de validation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingConges ? <Spinner /> : conges.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucune demande en attente
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employe</TableHead>
                      <TableHead>Societe</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Nb jours</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conges.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.employe?.prenom} {c.employe?.nom}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {c.employe?.societe_id ? societeMap.get(c.employe.societe_id) || "---" : "---"}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || "bg-gray-100 text-gray-800"}`}>
                            {TYPE_LABELS[c.type_conge] || c.type_conge}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{c.nb_jours}j</span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-40 truncate">
                          {c.motif || "---"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 h-8"
                              disabled={actionLoading === c.id}
                              onClick={() => approuver(c.id)}
                            >
                              {actionLoading === c.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-1" />
                              )}
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 h-8"
                              onClick={() => { setRefusDialog(c.id); setRefusMotif("") }}
                            >
                              <XCircle className="w-4 h-4 mr-1" />Refuser
                            </Button>
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

        {/* ═══ TAB 3: ABSENCES AUJOURD'HUI ═══ */}
        <TabsContent value="absents">
          <div className="space-y-4">
            {/* Employees on approved leave today */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  En conge aujourd&apos;hui ({new Date().toLocaleDateString("fr-FR")})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingAbsents ? <Spinner /> : absentsAvecConge.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Aucun employe en conge aujourd&apos;hui
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Motif</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absentsAvecConge.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.employe?.prenom} {c.employe?.nom}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || ""}`}>
                              {TYPE_LABELS[c.type_conge] || c.type_conge}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{c.motif || "---"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Employees with no leave (potential unplanned absences) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Employes sans conge approuve ({employesSansConge.length})
                </CardTitle>
                <p className="text-xs text-gray-400">
                  Utilisez les actions pour justifier ou marquer les absences non planifiees
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {loadingAbsents ? <Spinner /> : societe === "all" ? (
                  <div className="text-center py-8 text-gray-500">
                    Selectionnez une societe pour voir les absences du jour
                  </div>
                ) : employesSansConge.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Tous les employes sont en conge approuve
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Poste</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employesSansConge.map((emp: any) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.prenom} {emp.nom}</TableCell>
                          <TableCell className="text-sm text-gray-500">{emp.poste || "---"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={actionLoading === emp.id}
                                onClick={() => sickRetroactif(emp.id)}
                              >
                                {actionLoading === emp.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Thermometer className="w-3 h-3 mr-1" />
                                )}
                                Creer SL retroactif
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 border-red-300"
                                disabled={actionLoading === emp.id}
                                onClick={() => absenceInjustifiee(emp.id)}
                              >
                                {actionLoading === emp.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                )}
                                Absence injustifiee
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 4: HISTORIQUE ═══ */}
        <TabsContent value="historique">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1E2A4A]">Historique des conges</CardTitle>
                <div className="flex gap-2">
                  <Input
                    placeholder="Rechercher..."
                    value={searchHisto}
                    onChange={e => setSearchHisto(e.target.value)}
                    className="w-48"
                  />
                  <Select value={histoFilter} onValueChange={setHistoFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Filtrer par type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHisto ? <Spinner /> : filteredHisto.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucun enregistrement
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Nb jours</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Motif</TableHead>
                        <TableHead>Commentaire</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHisto.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.employe?.prenom} {c.employe?.nom}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || "bg-gray-100 text-gray-800"}`}>
                              {TYPE_LABELS[c.type_conge] || c.type_conge}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{c.nb_jours}j</span>
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[c.statut] || ""}`}>
                              {STATUT_LABELS[c.statut] || c.statut}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">
                            {c.motif || "---"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">
                            {c.commentaire_manager || "---"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOG: Nouvelle demande ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle demande de conge</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{formError}</p>
              </div>
            )}
            <div>
              <Label>Employe *</Label>
              <Select value={form.employe_id} onValueChange={v => setForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir un employe..." /></SelectTrigger>
                <SelectContent>
                  {employes.map((e: any) => {
                    const socName = societeMap.get(e.societe_id)
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        {e.prenom} {e.nom}{socName ? ` (${socName})` : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type de conge *</Label>
              <Select value={form.type_conge} onValueChange={v => setForm(f => ({ ...f, type_conge: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {form.type_conge === "AL" && "Conge annuel: 20 jours ouvrables/an (prorata si embauche en cours d'annee)"}
                {form.type_conge === "SL" && "Conge maladie: 15 jours ouvrables/an. Certificat medical requis si > 3 jours consecutifs"}
                {form.type_conge === "MAT" && "Maternite: 14 semaines (98 jours calendaires). Reserves aux femmes."}
                {form.type_conge === "PAT" && "Paternite: 5 jours ouvrables. Reserves aux hommes."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date debut *</Label>
                <Input
                  type="date"
                  value={form.date_debut}
                  onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date fin *</Label>
                <Input
                  type="date"
                  value={form.date_fin}
                  onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Motif</Label>
              <Input
                value={form.motif}
                onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                placeholder="Raison du conge (optionnel)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Soumettre la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Refus avec motif ═══ */}
      <Dialog open={!!refusDialog} onOpenChange={open => { if (!open) setRefusDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Motif de refus *</Label>
            <Textarea
              value={refusMotif}
              onChange={e => setRefusMotif(e.target.value)}
              placeholder="Ex: Pas assez d'effectif ce jour, periode bloquee..."
              className="mt-1"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusDialog(null)}>Annuler</Button>
            <Button
              onClick={refuser}
              disabled={!refusMotif.trim() || !!actionLoading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <XCircle className="w-4 h-4 mr-2" />Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
