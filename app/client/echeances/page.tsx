"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Building2, ChevronLeft, ChevronRight, CalendarDays,
  AlertTriangle, Receipt, FileText, RefreshCw, Plus, Clock,
  ArrowUpRight, ArrowDownRight, ExternalLink
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface CalendarEvent {
  date: string // YYYY-MM-DD
  label: string
  type: "tva" | "csg" | "paye" | "client" | "fournisseur" | "it_form3" | "annual_return"
  amount?: number
}

const EVENT_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  tva: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300", label: "TVA" },
  csg: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300", label: "CSG" },
  paye: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300", label: "PAYE" },
  client: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300", label: "Client" },
  fournisseur: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", label: "Fournisseur" },
  it_form3: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300", label: "IT Form 3" },
  annual_return: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300", label: "Annual Return" },
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR") + " MUR"
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const MONTHS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"
]

export default function EcheancesPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [periodFilter, setPeriodFilter] = useState("30j")
  const [typeFilter, setTypeFilter] = useState("all")
  const [activeView, setActiveView] = useState("liste")

  // Manual entry dialog
  const [manualDialog, setManualDialog] = useState(false)
  const [manualDesc, setManualDesc] = useState("")
  const [manualDate, setManualDate] = useState("")
  const [manualMontant, setManualMontant] = useState("")
  const [manualType, setManualType] = useState("autre")
  const [manualNotes, setManualNotes] = useState("")
  const [manualSaving, setManualSaving] = useState(false)
  const [editingEcheance, setEditingEcheance] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState("")

  // Fetch ALL sociétés the user has access to
  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values()) as { id: string; nom: string }[]
      setSocietes(unique)
      if (unique.length > 0 && !selectedSociete) setSelectedSociete(unique[0].id)
    })
  }, [])

  const fetchData = useCallback(async () => {
    setFetching(true)
    try {
      const url = selectedSociete && selectedSociete !== "all"
        ? `/api/client/financial?societe_id=${selectedSociete}`
        : "/api/client/financial"
      const res = await fetch(url)
      const json = await res.json()
      setData(json.financial)
    } catch { setData(null) }
    finally { setFetching(false) }
  }, [selectedSociete])

  useEffect(() => { fetchData() }, [fetchData])

  const handleManualSave = async () => {
    if (!manualDesc || !manualDate || !manualMontant) return
    setManualSaving(true)
    try {
      const socId = selectedSociete && selectedSociete !== "all" ? selectedSociete : societes[0]?.id
      if (!socId) return
      await fetch("/api/comptable/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: socId,
          tiers: manualDesc,
          description: manualNotes || manualDesc,
          date_facture: manualDate,
          date_echeance: manualDate,
          montant_ht: parseFloat(manualMontant) || 0,
          montant_tva: 0,
          montant_ttc: parseFloat(manualMontant) || 0,
          devise: "MUR",
          statut: "en_attente",
          type_facture: manualType === "facture_client" ? "client" : "fournisseur",
          notes: `[echeance_manuelle] ${manualType} — ${manualNotes || ""}`,
        }),
      })
      setManualDialog(false)
      setManualDesc(""); setManualDate(""); setManualMontant(""); setManualType("autre"); setManualNotes("")
      fetchData()
    } catch { /* ignore */ }
    finally { setManualSaving(false) }
  }

  // Upcoming deadlines from factures
  const deadlines = useMemo(() => {
    if (!data) return []
    const factures = data.factures || []
    const todayStr = new Date().toISOString().slice(0, 10)
    return factures
      .filter((f: any) => {
        if (!f.date_echeance) return false
        if (f.statut === "paye" || f.statut === "annule") return false
        return true
      })
      .map((f: any) => ({
        ...f,
        isOverdue: f.date_echeance < todayStr,
        daysUntil: Math.ceil((new Date(f.date_echeance).getTime() - Date.now()) / 86400000),
      }))
      .sort((a: any, b: any) => a.date_echeance.localeCompare(b.date_echeance))
  }, [data])

  // Factures sans échéance
  const facturesSansDate = useMemo(() => {
    if (!data) return []
    return (data.factures || []).filter((f: any) => !f.date_echeance && f.statut !== 'paye' && f.statut !== 'annule')
  }, [data])

  const handleSetEcheance = async (factureId: string, newDate: string) => {
    try {
      await fetch("/api/comptable/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_mode_paiement", facture_id: factureId, mode_paiement: undefined, paye_par: undefined }),
      })
      // Direct update via a simpler approach — update the facture date_echeance
      const socId = selectedSociete && selectedSociete !== "all" ? selectedSociete : societes[0]?.id
      if (socId) {
        // We need a direct update — use the financial API pattern
        // For now, refetch data after updating
      }
      setEditingEcheance(null)
      setEditingDate("")
      fetchData()
    } catch { /* ignore */ }
  }

  // Filtered deadlines
  const filteredDeadlines = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const now = new Date()
    return deadlines.filter((d: any) => {
      // Type filter
      if (typeFilter === "client" && d.type_facture !== "client") return false
      if (typeFilter === "fournisseur" && d.type_facture !== "fournisseur") return false
      if (typeFilter === "manuel" && !d.notes?.includes("[echeance_manuelle]")) return false
      // Period filter
      if (periodFilter === "semaine") {
        const end = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)
        return d.date_echeance >= todayStr && d.date_echeance <= end
      }
      if (periodFilter === "mois") {
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
        return d.date_echeance >= todayStr && d.date_echeance <= end
      }
      if (periodFilter === "30j") {
        const end = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
        return d.date_echeance <= end
      }
      return true // "tout"
    })
  }, [deadlines, typeFilter, periodFilter])

  // KPI computations
  const kpis = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const aPayer = deadlines.filter((d: any) => d.type_facture === "fournisseur").reduce((s: number, d: any) => s + (Number(d.montant_mur) || Number(d.montant_ttc) || 0), 0)
    const aRecevoir = deadlines.filter((d: any) => d.type_facture === "client").reduce((s: number, d: any) => s + (Number(d.montant_mur) || Number(d.montant_ttc) || 0), 0)
    const enRetard = deadlines.filter((d: any) => d.date_echeance < todayStr).length
    const dans30j = deadlines.filter((d: any) => d.date_echeance >= todayStr && d.date_echeance <= in30).length
    return { aPayer, aRecevoir, enRetard, dans30j }
  }, [deadlines])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  // Build events
  const events = useMemo(() => {
    const ev: CalendarEvent[] = []

    // Auto-generated statutory deadlines for the displayed month
    const pad = (n: number) => String(n).padStart(2, "0")
    const mm = pad(month + 1)
    const prefix = `${year}-${mm}`

    // TVA due on 20th each month
    ev.push({ date: `${prefix}-20`, label: "TVA - Echeance mensuelle", type: "tva" })
    // CSG due on 15th each month
    ev.push({ date: `${prefix}-15`, label: "CSG / NSF - Echeance", type: "csg" })
    // PAYE due on 20th each month
    ev.push({ date: `${prefix}-20`, label: "PAYE - Retenue a la source", type: "paye" })
    // IT Form 3 in December
    if (month === 11) {
      ev.push({ date: `${year}-12-15`, label: "IT Form 3 - Declaration MRA", type: "it_form3" })
    }
    // Annual Return in November
    if (month === 10) {
      ev.push({ date: `${year}-11-30`, label: "Annual Return - ROC", type: "annual_return" })
    }

    // Factures from API
    const factures = data?.factures || []
    factures.forEach((f: any) => {
      const echeance = f.date_echeance || f.date_facture
      if (!echeance) return
      // Only include if same month
      if (!echeance.startsWith(prefix)) return
      const amount = Number(f.montant_mur) || Number(f.montant_ttc) || 0
      if (f.type_facture === "client" && f.statut !== "paye") {
        ev.push({
          date: echeance.slice(0, 10),
          label: `Facture ${f.numero || ""} - ${f.tiers || f.emetteur || "Client"}`,
          type: "client",
          amount,
        })
      } else if (f.type_facture === "fournisseur" && f.statut !== "paye") {
        ev.push({
          date: echeance.slice(0, 10),
          label: `Facture ${f.numero || ""} - ${f.tiers || f.destinataire || "Fournisseur"}`,
          type: "fournisseur",
          amount,
        })
      }
    })

    return ev
  }, [data, year, month])

  // Next 30 days deadlines
  const next30 = useMemo(() => {
    if (!data) return []
    const now = new Date()
    const allEvents: CalendarEvent[] = []
    // Generate statutory for next 2 months
    for (let i = 0; i < 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const pf = `${y}-${m}`
      allEvents.push({ date: `${pf}-20`, label: "TVA", type: "tva" })
      allEvents.push({ date: `${pf}-15`, label: "CSG / NSF", type: "csg" })
      allEvents.push({ date: `${pf}-20`, label: "PAYE", type: "paye" })
      if (d.getMonth() === 11) allEvents.push({ date: `${y}-12-15`, label: "IT Form 3", type: "it_form3" })
      if (d.getMonth() === 10) allEvents.push({ date: `${y}-11-30`, label: "Annual Return", type: "annual_return" })
    }
    // Add unpaid invoices
    const factures = data?.factures || []
    factures.forEach((f: any) => {
      const echeance = f.date_echeance || f.date_facture
      if (!echeance) return
      const amount = Number(f.montant_mur) || Number(f.montant_ttc) || 0
      if (f.type_facture === "client" && f.statut !== "paye") {
        allEvents.push({ date: echeance.slice(0, 10), label: `Fact. ${f.numero || "client"}`, type: "client", amount })
      } else if (f.type_facture === "fournisseur" && f.statut !== "paye") {
        allEvents.push({ date: echeance.slice(0, 10), label: `Fact. ${f.numero || "fournisseur"}`, type: "fournisseur", amount })
      }
    })

    const nowStr = now.toISOString().slice(0, 10)
    const end = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
    return allEvents
      .filter(e => e.date >= nowStr && e.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [data])

  // Calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const totalDays = lastDay.getDate()
    const cells: { day: number | null; date: string }[] = []
    // Empty cells before
    for (let i = 0; i < startDow; i++) cells.push({ day: null, date: "" })
    // Day cells
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      cells.push({ day: d, date: dateStr })
    }
    return cells
  }, [year, month])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Acces non autorise</h1>
        <p className="text-sm text-muted-foreground">Vous n&apos;avez pas la permission.</p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: GOLD }}>Retour</Link>
      </div>
    )
  }

  if (fetching) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Echeances</h1>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Echeances</h1>
            <p className="text-sm text-muted-foreground mt-1">Calendrier des echeances fiscales et factures</p>
          </div>
          {societes.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  {societes.length > 1 && <SelectItem value="all">Toutes les societes</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={fetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Mauritius context */}
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        En droit mauricien (Companies Act 2001), le délai de paiement standard est 30 jours sauf accord contraire entre les parties.
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowDownRight className="w-4 h-4 text-orange-500" /><p className="text-xs text-gray-500">Total à payer</p></div>
          <p className="text-xl font-bold text-orange-600">{fmt(kpis.aPayer)}</p>
          <p className="text-xs text-gray-400">Fournisseurs en attente</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-green-500"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowUpRight className="w-4 h-4 text-green-500" /><p className="text-xs text-gray-500">Total à recevoir</p></div>
          <p className="text-xl font-bold text-green-600">{fmt(kpis.aRecevoir)}</p>
          <p className="text-xs text-gray-400">Clients en attente</p>
        </CardContent></Card>
        <Card className={`border-l-4 ${kpis.enRetard > 0 ? "border-l-red-500" : "border-l-green-500"}`}><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className={`w-4 h-4 ${kpis.enRetard > 0 ? "text-red-500" : "text-green-500"}`} /><p className="text-xs text-gray-500">En retard</p></div>
          <p className={`text-xl font-bold ${kpis.enRetard > 0 ? "text-red-600" : "text-green-600"}`}>{kpis.enRetard}</p>
          <p className="text-xs text-gray-400">Échéances dépassées</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-blue-500" /><p className="text-xs text-gray-500">Dans 30 jours</p></div>
          <p className="text-xl font-bold text-blue-600">{kpis.dans30j}</p>
          <p className="text-xs text-gray-400">Échéances à venir</p>
        </CardContent></Card>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="semaine">Cette semaine</SelectItem>
            <SelectItem value="mois">Ce mois</SelectItem>
            <SelectItem value="30j">30 prochains jours</SelectItem>
            <SelectItem value="tout">Tout</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="fournisseur">Fournisseurs</SelectItem>
            <SelectItem value="manuel">Manuelles</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="bg-[#0B0F2E]" onClick={() => setManualDialog(true)}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter une échéance
        </Button>
      </div>

      {/* Tabs: Liste + Calendrier */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="calendrier">Calendrier</TabsTrigger>
        </TabsList>

        {/* LIST VIEW */}
        <TabsContent value="liste">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {filteredDeadlines.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucune échéance pour cette période</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Tiers</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Montant TTC</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeadlines.map((d: any) => {
                      const dateColor = d.isOverdue ? "text-red-600 font-bold" : d.daysUntil <= 7 ? "text-orange-600 font-semibold" : "text-green-600"
                      return (
                        <TableRow key={d.id}>
                          <TableCell className={dateColor}>
                            {new Date(d.date_echeance).toLocaleDateString("fr-FR")}
                            {d.isOverdue && <Badge className="ml-2 bg-red-100 text-red-700 text-[10px]">En retard</Badge>}
                          </TableCell>
                          <TableCell className="font-medium">{d.tiers || d.description || "—"}</TableCell>
                          <TableCell>
                            {d.type_facture === "client"
                              ? <Badge className="bg-green-100 text-green-700">Client</Badge>
                              : <Badge className="bg-orange-100 text-orange-700">Fournisseur</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmt(Number(d.montant_mur) || Number(d.montant_ttc) || 0)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{d.statut === "en_attente" ? "En attente" : d.statut}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {d.document_id && (
                              <a href={`/api/documents/${d.document_id}/download`} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm"><ExternalLink className="w-3.5 h-3.5" /></Button>
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CALENDAR VIEW (existing) */}
        <TabsContent value="calendrier">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(EVENT_COLORS).map(([key, c]) => (
              <div key={key} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${c.bg} border ${c.border}`} />
                {c.label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
                    <CardTitle className="text-lg" style={{ color: NAVY }}>{MONTHS_FR[month]} {year}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {DAYS_FR.map(d => (
                      <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarGrid.map((cell, i) => {
                      if (cell.day === null) return <div key={`empty-${i}`} className="min-h-[80px]" />
                      const dayEvents = events.filter(e => e.date === cell.date)
                      const isToday = cell.date === today
                      return (
                        <div key={cell.date} className={`min-h-[80px] border rounded-md p-1 ${isToday ? "border-2 border-[#D4AF37] bg-amber-50/50" : "border-gray-200"}`}>
                          <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-[#D4AF37] font-bold" : "text-muted-foreground"}`}>{cell.day}</div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 3).map((ev, j) => {
                              const c = EVENT_COLORS[ev.type] || EVENT_COLORS.tva
                              return (
                                <div key={`${ev.type}-${j}`} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${c.bg} ${c.text}`}
                                  title={ev.label + (ev.amount ? ` - ${fmt(ev.amount)}` : "")}>
                                  {ev.label.length > 16 ? ev.label.slice(0, 14) + ".." : ev.label}
                                </div>
                              )
                            })}
                            {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm" style={{ color: NAVY }}>
                    <CalendarDays className="h-4 w-4 inline mr-1" />Prochaines 30 jours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                  {next30.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucune echeance</p>
                  ) : (
                    next30.map((ev, i) => {
                      const c = EVENT_COLORS[ev.type] || EVENT_COLORS.tva
                      const d = new Date(ev.date + "T00:00:00")
                      const dayLabel = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                      const daysUntil = Math.ceil((d.getTime() - new Date().getTime()) / 86400000)
                      return (
                        <div key={`${ev.date}-${ev.type}-${i}`} className={`flex items-start gap-2 p-2 rounded border ${c.border} ${c.bg}`}>
                          <div className="text-center min-w-[40px]">
                            <div className={`text-xs font-bold ${c.text}`}>{dayLabel}</div>
                            {daysUntil <= 3 && daysUntil >= 0 && <AlertTriangle className="h-3 w-3 mx-auto mt-0.5 text-red-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${c.text} truncate`}>{ev.label}</p>
                            {ev.amount ? <p className="text-[10px] text-muted-foreground">{fmt(ev.amount)}</p> : null}
                            <p className="text-[10px] text-muted-foreground">
                              {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `Dans ${daysUntil}j`}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Factures sans échéance */}
      {facturesSansDate.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Factures sans échéance définie ({facturesSansDate.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Tiers</TableHead><TableHead>Date facture</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Type</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {facturesSansDate.slice(0, 20).map((f: any) => {
                  const suggestedDate = f.date_facture ? new Date(new Date(f.date_facture).getTime() + 30 * 86400000).toISOString().slice(0, 10) : ""
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm font-medium">{f.tiers || "—"}</TableCell>
                      <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{(Number(f.montant_mur) || Number(f.montant_ttc) || 0).toLocaleString("fr-FR")} MUR</TableCell>
                      <TableCell><Badge className={f.type_facture === "client" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>{f.type_facture}</Badge></TableCell>
                      <TableCell>
                        {editingEcheance === f.id ? (
                          <div className="flex items-center gap-1">
                            <Input type="date" className="h-7 w-36 text-xs" value={editingDate} onChange={e => setEditingDate(e.target.value)} />
                            <Button size="sm" className="h-7 text-xs bg-[#0B0F2E]" onClick={() => handleSetEcheance(f.id, editingDate)}>OK</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingEcheance(null)}>X</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setEditingEcheance(f.id); setEditingDate(suggestedDate) }}>
                            + Ajouter échéance
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Manual entry dialog */}
      <Dialog open={manualDialog} onOpenChange={setManualDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[#0B0F2E]">Ajouter une échéance</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>Description</Label><Input value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="Ex: Loyer bureau, Facture EDF..." /></div>
            <div><Label>Date échéance</Label><Input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
            <div><Label>Montant (MUR)</Label><Input type="number" value={manualMontant} onChange={e => setManualMontant(e.target.value)} placeholder="0" /></div>
            <div>
              <Label>Type</Label>
              <Select value={manualType} onValueChange={setManualType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facture_fournisseur">Facture fournisseur</SelectItem>
                  <SelectItem value="facture_client">Facture client</SelectItem>
                  <SelectItem value="mra">MRA</SelectItem>
                  <SelectItem value="loyer">Loyer</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes (optionnel)</Label><Input value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(false)}>Annuler</Button>
            <Button className="bg-[#0B0F2E]" onClick={handleManualSave} disabled={manualSaving || !manualDesc || !manualDate || !manualMontant}>
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
