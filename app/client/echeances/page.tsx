"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
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
import { ClientPageShell } from "@/components/layout/ClientPageShell"

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

interface AgedReceivables {
  totaux: Record<string, number>
  par_tiers?: Record<string, unknown>[]
}
interface AgedPayables {
  totaux: Record<string, number>
  alertes?: { message: string }[]
}
interface AgedDataState {
  receivables: AgedReceivables | null
  payables: AgedPayables | null
  loading: boolean
}

export default function EcheancesPage() {
  const { profile, loading } = useProfile()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [periodFilter, setPeriodFilter] = useState("30j")
  const [typeFilter, setTypeFilter] = useState("all")
  const [activeView, setActiveView] = useState("liste")

  // Manual entry dialog
  const [manualDialog, setManualDialog] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState<{ found: number; not_found: number } | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number; currentFile: string; found: number; notFound: number } | null>(null)
  const [applying30j, setApplying30j] = useState(false)
  const [selectedFactures, setSelectedFactures] = useState<string[]>([])
  const [dayPopover, setDayPopover] = useState<{ date: string; events: any[] } | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [manualDesc, setManualDesc] = useState("")
  const [manualDate, setManualDate] = useState("")
  const [manualMontant, setManualMontant] = useState("")
  const [manualType, setManualType] = useState("autre")
  const [manualNotes, setManualNotes] = useState("")
  const [manualSaving, setManualSaving] = useState(false)
  const [editingEcheance, setEditingEcheance] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState("")

  // Aged receivables + payables (synthèse consolidée)
  const [agedData, setAgedData] = useState<AgedDataState>({ receivables: null, payables: null, loading: true })

  useEffect(() => {
    async function loadAged() {
      if (!societeId) return
      try {
        const [recRes, payRes] = await Promise.all([
          fetch(`/api/comptable/rapports/aged-receivables?societe_id=${societeId}`),
          fetch(`/api/comptable/rapports/aged-payables?societe_id=${societeId}`)
        ])
        const rec = recRes.ok ? await recRes.json() : null
        const pay = payRes.ok ? await payRes.json() : null
        setAgedData({ receivables: rec, payables: pay, loading: false })
      } catch (err) {
        console.error('[echeances] aged fetch failed', err)
        setAgedData({ receivables: null, payables: null, loading: false })
      }
    }
    loadAged()
  }, [societeId])

  const fetchData = useCallback(async () => {
    if (!societeId) { setFetching(false); return }
    setFetching(true)
    try {
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const json = await res.json()
      setData(json.financial)
    } catch { setData(null) }
    finally { setFetching(false) }
  }, [societeId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleManualSave = async () => {
    if (!manualDesc || !manualDate || !manualMontant) return
    setManualSaving(true)
    try {
      const socId = societeId
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
      // Update date_echeance via the factures API
      await fetch("/api/comptable/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_mode_paiement", facture_id: factureId, mode_paiement: undefined, paye_par: undefined }),
      })
      setEditingEcheance(null)
      setEditingDate("")
      fetchData()
    } catch { /* ignore */ }
  }

  const handleExtractBatch = async () => {
    const socId = societeId
    if (!socId) return
    const toProcess = selectedFactures.length > 0
      ? facturesSansDate.filter((f: any) => selectedFactures.includes(f.id) && f.document_id)
      : facturesSansDate.filter((f: any) => f.document_id)
    if (toProcess.length === 0) { alert("Aucune facture avec document PDF à analyser"); return }

    setExtracting(true)
    setExtractResult(null)
    let found = 0, notFound = 0

    for (let i = 0; i < toProcess.length; i++) {
      const f = toProcess[i]
      setProgress({ current: i + 1, total: toProcess.length, currentFile: f.tiers || f.numero_facture || "Document", found, notFound })
      try {
        const res = await fetch("/api/client/echeances", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: socId, action: "extract_one", facture_id: f.id }),
        })
        const json = await res.json()
        if (json.found) found++; else notFound++
      } catch { notFound++ }
    }

    setProgress(null)
    setExtracting(false)
    setExtractResult({ found, not_found: notFound })
    setSelectedFactures([])
    fetchData()
  }

  const handleApply30Days = async () => {
    const socId = societeId
    if (!socId) return
    const count = selectedFactures.length > 0 ? selectedFactures.length : facturesSansDate.length
    if (!confirm(`Appliquer date_facture + 30 jours à ${count} factures sans échéance ?\n(Délai légal mauricien — Companies Act 2001)`)) return
    setApplying30j(true)
    try {
      const res = await fetch("/api/client/echeances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: socId, action: "apply_30_days", facture_ids: selectedFactures.length > 0 ? selectedFactures : null }),
      })
      const json = await res.json()
      alert(`${json.updated || 0} factures mises à jour avec +30 jours`)
      fetchData()
    } catch { alert("Erreur") }
    finally { setApplying30j(false) }
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
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
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
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Échéances" }]}
      kicker="États financiers"
      title="Échéances"
      subtitle="Calendrier des échéances fiscales (MRA) et des factures fournisseurs / clients. Délai standard Maurice : 30 jours (Companies Act 2001)."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={fetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      {/* Synthèse consolidée — aged receivables & payables */}
      {agedData.loading ? (
        <div>Chargement de la synthèse...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Créances clients (à encaisser)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {agedData.receivables?.totaux?.total?.toLocaleString() ?? 0} MUR
              </div>
              <div className="grid grid-cols-5 gap-2 mt-4 text-sm">
                <div><div className="text-muted-foreground">À échéance</div><div>{agedData.receivables?.totaux?.current?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">1-30j</div><div>{agedData.receivables?.totaux?.['1-30']?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">31-60j</div><div>{agedData.receivables?.totaux?.['31-60']?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">61-90j</div><div>{agedData.receivables?.totaux?.['61-90']?.toLocaleString() ?? 0}</div></div>
                <div className="text-red-600"><div className="text-muted-foreground">&gt;90j</div><div>{agedData.receivables?.totaux?.over_90?.toLocaleString() ?? 0}</div></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dettes fournisseurs (à payer)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {agedData.payables?.totaux?.total?.toLocaleString() ?? 0} MUR
              </div>
              <div className="grid grid-cols-5 gap-2 mt-4 text-sm">
                <div><div className="text-muted-foreground">À échéance</div><div>{agedData.payables?.totaux?.current?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">1-30j</div><div>{agedData.payables?.totaux?.['1-30']?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">31-60j</div><div>{agedData.payables?.totaux?.['31-60']?.toLocaleString() ?? 0}</div></div>
                <div><div className="text-muted-foreground">61-90j</div><div>{agedData.payables?.totaux?.['61-90']?.toLocaleString() ?? 0}</div></div>
                <div className="text-red-600"><div className="text-muted-foreground">&gt;90j</div><div>{agedData.payables?.totaux?.over_90?.toLocaleString() ?? 0}</div></div>
              </div>
              {agedData.payables?.alertes && agedData.payables.alertes.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                  <div className="font-semibold text-red-700 text-sm">⚠️ Alertes</div>
                  {agedData.payables.alertes.map((a, i: number) => (
                    <div key={i} className="text-xs text-red-600 mt-1">{a.message}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Position nette et prévisionnel */}
      {!agedData.loading && agedData.receivables && agedData.payables && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Position nette &amp; prévisionnel trésorerie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg">
              Position nette : <strong className={
                ((agedData.receivables.totaux.total ?? 0) - (agedData.payables.totaux.total ?? 0)) >= 0
                  ? 'text-green-600' : 'text-red-600'
              }>
                {((agedData.receivables.totaux.total ?? 0) - (agedData.payables.totaux.total ?? 0)).toLocaleString()} MUR
              </strong>
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Projection si toutes les échéances sont respectées :
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2 text-sm">
              {['current', '1-30', '31-60', '61-90'].map((tranche, i) => {
                const label = ['Immédiat', 'J+30', 'J+60', 'J+90'][i]
                const net = (agedData.receivables?.totaux?.[tranche] ?? 0) - (agedData.payables?.totaux?.[tranche] ?? 0)
                return (
                  <div key={tranche}>
                    <div className="text-muted-foreground">{label}</div>
                    <div className={net >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {net.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                            {dayEvents.slice(0, 2).map((ev, j) => {
                              const c = EVENT_COLORS[ev.type] || EVENT_COLORS.tva
                              return (
                                <div key={`${ev.type}-${j}`} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${c.bg} ${c.text}`}
                                  title={ev.label + (ev.amount ? ` - ${fmt(ev.amount)}` : "")}>
                                  {ev.label.length > 16 ? ev.label.slice(0, 14) + ".." : ev.label}
                                </div>
                              )
                            })}
                            {dayEvents.length > 2 && (
                              <button onClick={() => setDayPopover({ date: cell.date, events: dayEvents })} className="text-[10px] text-blue-600 hover:text-blue-800 pl-1 cursor-pointer">
                                +{dayEvents.length - 2} autres
                              </button>
                            )}
                            {dayEvents.some(e => e.amount) && (() => {
                              const total = dayEvents.reduce((s, e) => s + (e.amount || 0), 0)
                              const color = total > 100000 ? "text-red-600" : total > 50000 ? "text-orange-600" : "text-gray-400"
                              return total > 0 ? <div className={`text-[9px] font-mono ${color} mt-0.5`}>{Math.round(total).toLocaleString("fr-FR")} MUR</div> : null
                            })()}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Factures sans échéance définie ({facturesSansDate.length})
            </CardTitle>
            <div className="flex gap-2">
              {selectedFactures.length > 0 && <span className="text-xs text-gray-500 mr-2">{selectedFactures.length} sélectionnée(s)</span>}
              <Button variant="outline" size="sm" onClick={handleExtractBatch} disabled={extracting} className="text-xs">
                {extracting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                {extracting && progress ? `Analyse... (${progress.current}/${progress.total})` : "Lancer analyse échéances"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleApply30Days} disabled={applying30j} className="text-xs">
                {applying30j ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                {applying30j ? "Application..." : "Appliquer +30 jours"}
              </Button>
            </div>
          </CardHeader>
          {/* Progress bar during analysis */}
          {progress && (
            <div className="px-4 pb-3 space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Analyse en cours...</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500 truncate">Analyse: {progress.currentFile}</p>
              <p className="text-[10px] text-gray-400">{progress.found} trouvée(s) — {progress.notFound} sans date</p>
            </div>
          )}
          {/* Final result summary */}
          {extractResult && !progress && (
            <div className="px-4 pb-3">
              <div className={`p-3 rounded-lg text-sm ${extractResult.found > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-gray-50 border border-gray-200 text-gray-600"}`}>
                <p className="font-medium">{extractResult.found > 0 ? "Analyse terminée" : "Analyse terminée — aucune date trouvée"}</p>
                <p className="text-xs mt-1">{extractResult.found} échéance(s) trouvée(s) — {extractResult.not_found} sans date explicite dans le PDF</p>
                {extractResult.not_found > 0 && <p className="text-xs mt-1 text-gray-500">Utilisez &quot;Appliquer +30 jours&quot; pour les {extractResult.not_found} restante(s)</p>}
              </div>
            </div>
          )}
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"><input type="checkbox" checked={selectedFactures.length === facturesSansDate.length && facturesSansDate.length > 0} onChange={() => setSelectedFactures(selectedFactures.length === facturesSansDate.length ? [] : facturesSansDate.map((f: any) => f.id))} className="cursor-pointer" /></TableHead>
                <TableHead>Tiers</TableHead><TableHead>Date facture</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Type</TableHead><TableHead>Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {facturesSansDate.slice(0, visibleCount).map((f: any) => {
                  const suggestedDate = f.date_facture ? new Date(new Date(f.date_facture).getTime() + 30 * 86400000).toISOString().slice(0, 10) : ""
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="w-8"><input type="checkbox" checked={selectedFactures.includes(f.id)} onChange={() => setSelectedFactures(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])} className="cursor-pointer" /></TableCell>
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
          {facturesSansDate.length > visibleCount && (
            <div className="text-center py-3 border-t">
              <p className="text-xs text-gray-500 mb-2">Affichage de {Math.min(visibleCount, facturesSansDate.length)} sur {facturesSansDate.length} factures</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setVisibleCount(prev => prev + 20)}>Voir 20 de plus</Button>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setVisibleCount(facturesSansDate.length)}>Tout afficher ({facturesSansDate.length})</Button>
              </div>
            </div>
          )}
          {visibleCount >= facturesSansDate.length && facturesSansDate.length > 20 && (
            <div className="text-center py-2 border-t">
              <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={() => setVisibleCount(20)}>Réduire la liste</Button>
            </div>
          )}
        </Card>
      )}

      {/* Day detail popover */}
      <Dialog open={!!dayPopover} onOpenChange={o => { if (!o) setDayPopover(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0B0F2E]">
              Échéances du {dayPopover?.date ? new Date(dayPopover.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {dayPopover?.events.map((ev, i) => {
              const c = EVENT_COLORS[ev.type] || EVENT_COLORS.tva
              return (
                <div key={i} className={`flex justify-between items-center p-2 rounded ${c.bg} ${c.text}`}>
                  <div>
                    <p className="text-sm font-medium">{ev.label}</p>
                    <Badge className="text-[10px]" variant="outline">{c.label}</Badge>
                  </div>
                  {ev.amount ? <p className="text-sm font-mono font-bold">{Math.round(ev.amount).toLocaleString("fr-FR")} MUR</p> : null}
                </div>
              )
            })}
          </div>
          {dayPopover?.events.some(e => e.amount) && (
            <div className="border-t pt-2 flex justify-between font-bold text-sm">
              <span>Total</span>
              <span>{Math.round(dayPopover.events.reduce((s, e) => s + (e.amount || 0), 0)).toLocaleString("fr-FR")} MUR</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </ClientPageShell>
  )
}
