"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Building2, ChevronLeft, ChevronRight, CalendarDays,
  AlertTriangle, Receipt, FileText, RefreshCw
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
  const [selectedSociete, setSelectedSociete] = useState<string>("all")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const fetchData = useCallback(async () => {
    setFetching(true)
    try {
      const url = selectedSociete !== "all"
        ? `/api/client/financial?societe_id=${selectedSociete}`
        : "/api/client/financial"
      const res = await fetch(url)
      const json = await res.json()
      setData(json.financial)
      if (json.financial?.availableSocietes) setSocietes(json.financial.availableSocietes)
    } catch { setData(null) }
    finally { setFetching(false) }
  }, [selectedSociete])

  useEffect(() => { fetchData() }, [fetchData])

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
          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les societes</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EVENT_COLORS).map(([key, c]) => (
          <div key={key} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${c.bg} border ${c.border}`} />
            {c.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevMonth}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg" style={{ color: NAVY }}>
                  {MONTHS_FR[month]} {year}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={nextMonth}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS_FR.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((cell, i) => {
                  if (cell.day === null) return <div key={`empty-${i}`} className="min-h-[80px]" />
                  const dayEvents = events.filter(e => e.date === cell.date)
                  const isToday = cell.date === today
                  return (
                    <div
                      key={cell.date}
                      className={`min-h-[80px] border rounded-md p-1 ${isToday ? "border-2 border-[#D4AF37] bg-amber-50/50" : "border-gray-200"}`}
                    >
                      <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-[#D4AF37] font-bold" : "text-muted-foreground"}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev, j) => {
                          const c = EVENT_COLORS[ev.type] || EVENT_COLORS.tva
                          return (
                            <div
                              key={`${ev.type}-${j}`}
                              className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${c.bg} ${c.text}`}
                              title={ev.label + (ev.amount ? ` - ${fmt(ev.amount)}` : "")}
                            >
                              {ev.label.length > 16 ? ev.label.slice(0, 14) + ".." : ev.label}
                            </div>
                          )
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Next 30 days */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm" style={{ color: NAVY }}>
                <CalendarDays className="h-4 w-4 inline mr-1" />
                Prochaines 30 jours
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
                        {daysUntil <= 3 && daysUntil >= 0 && (
                          <AlertTriangle className="h-3 w-3 mx-auto mt-0.5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${c.text} truncate`}>{ev.label}</p>
                        {ev.amount ? (
                          <p className="text-[10px] text-muted-foreground">{fmt(ev.amount)}</p>
                        ) : null}
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
    </div>
  )
}
