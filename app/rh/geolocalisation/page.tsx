"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Loader2, MapPin, Users, Navigation, Truck, RefreshCw, Clock, Coffee, Send, Bot, Sparkles, Lightbulb, TrendingUp, AlertTriangle, Route, Zap, Brain, CheckCircle2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"
const GREEN = "#2ECC8A"

// Mauritius center coordinates
const MAURITIUS_CENTER: [number, number] = [-20.2, 57.5]
const MAURITIUS_ZOOM = 10

interface EmployeePosition {
  employe_id: string
  nom: string
  prenom: string
  poste: string
  latitude: number | null
  longitude: number | null
  adresse: string
  shift_today: string
  shift_label: string
  heure_debut: string | null
  heure_fin: string | null
  groupe_id: string | null
  groupe_nom: string | null
}

interface Groupe {
  id: string
  societe_id: string
  nom: string
  code: string
  couleur: string
}

// Office location: Grand Gaube
const OFFICE_LAT = -20.0167
const OFFICE_LON = 57.6667

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
}

interface RouteInfo {
  employees: (EmployeePosition & { distToOffice: number })[]
  stops: string[]
  totalDist: number
}

function buildOptimizedRoutes(employees: EmployeePosition[], maxPerVehicle: number = 6): RouteInfo[] {
  // Calculate distance to office for each employee with GPS
  const empsWithDist = employees.map(e => ({
    ...e,
    distToOffice: (e.latitude && e.longitude)
      ? haversineKm(e.latitude, e.longitude, OFFICE_LAT, OFFICE_LON)
      : 0,
  }))

  // Cluster nearby zones using greedy approach with haversine
  const unclustered = [...empsWithDist]
  const routes: RouteInfo[] = []

  while (unclustered.length > 0) {
    // Start a new route with the furthest employee from office
    unclustered.sort((a, b) => b.distToOffice - a.distToOffice)
    const seed = unclustered.shift()!
    const route: typeof unclustered = [seed]

    // Greedily add nearby employees to this route (within 5km of any member in route)
    let changed = true
    while (changed && route.length < maxPerVehicle) {
      changed = false
      for (let i = unclustered.length - 1; i >= 0; i--) {
        const candidate = unclustered[i]
        // Check if candidate is within 5km of any employee already in route
        const isNearby = route.some(r => {
          if (r.latitude && r.longitude && candidate.latitude && candidate.longitude) {
            return haversineKm(r.latitude, r.longitude, candidate.latitude, candidate.longitude) <= 5
          }
          // Fallback: same zone name
          return extractZone(r.adresse) === extractZone(candidate.adresse)
        })
        if (isNearby) {
          route.push(candidate)
          unclustered.splice(i, 1)
          changed = true
          if (route.length >= maxPerVehicle) break
        }
      }
    }

    // If route is still under capacity and there are unclustered employees, fill up
    // (for employees without GPS, group by zone similarity)
    if (route.length < maxPerVehicle && unclustered.length > 0) {
      // Add the nearest remaining employees until full
      for (let i = unclustered.length - 1; i >= 0 && route.length < maxPerVehicle; i--) {
        const candidate = unclustered[i]
        if (!candidate.latitude || !candidate.longitude) {
          // No GPS - check zone match
          const routeZones = new Set(route.map(r => extractZone(r.adresse)))
          if (routeZones.has(extractZone(candidate.adresse))) {
            route.push(candidate)
            unclustered.splice(i, 1)
          }
        }
      }
    }

    // Order route: furthest from office first, working towards office
    route.sort((a, b) => b.distToOffice - a.distToOffice)

    // Build unique ordered stops
    const seenZones = new Set<string>()
    const stops: string[] = []
    for (const emp of route) {
      const zone = extractZone(emp.adresse)
      if (zone !== "Non renseignee" && !seenZones.has(zone)) {
        seenZones.add(zone)
        stops.push(zone)
      }
    }
    stops.push("Grand Gaube (Bureau)")

    const totalDist = route.reduce((max, e) => Math.max(max, e.distToOffice), 0) * 2 // rough round-trip estimate
    routes.push({ employees: route, stops, totalDist })
  }

  return routes
}

function generateAIResponse(query: string, positions: EmployeePosition[], ramassageGroups: { time: string; zone: string; emps: EmployeePosition[] }[]): string {
  const q = query.toLowerCase()
  const working = positions.filter(p => p.shift_today === "travail")
  const workingWithAddr = working.filter(p => p.adresse && p.adresse !== "")
  const sansAdresse = positions.filter(p => !p.adresse || p.adresse === "")
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  // Group working employees by shift start time
  const byShift = new Map<string, EmployeePosition[]>()
  for (const e of workingWithAddr) {
    const time = e.heure_debut ? String(e.heure_debut).slice(0, 5) : "non defini"
    if (!byShift.has(time)) byShift.set(time, [])
    byShift.get(time)!.push(e)
  }
  const sortedShifts = Array.from(byShift.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  // Build optimized routes per shift
  const shiftRoutes = new Map<string, RouteInfo[]>()
  let totalVehicles = 0
  let totalEmployeesRouted = 0
  let totalDistAll = 0
  for (const [time, emps] of sortedShifts) {
    const routes = buildOptimizedRoutes(emps)
    shiftRoutes.set(time, routes)
    totalVehicles += routes.length
    totalEmployeesRouted += emps.length
    totalDistAll += routes.reduce((s, r) => s + r.totalDist, 0)
  }

  function formatShiftRoutes(shiftTime: string, routes: RouteInfo[], detailed: boolean = false): string {
    const totalEmps = routes.reduce((s, r) => s + r.employees.length, 0)
    let out = `Shift ${shiftTime} -- ${totalEmps} employes --> ${routes.length} vehicule(s)\n`
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]
      out += `  Route ${i + 1}: ${r.stops.join(" -> ")} (${r.employees.length} pers.)\n`
      if (detailed) {
        for (const emp of r.employees) {
          const dist = emp.distToOffice > 0 ? `, ${emp.distToOffice} km` : ""
          const addr = emp.adresse ? emp.adresse.split(",")[0].trim() : "adresse inconnue"
          out += `    - ${emp.nom} ${emp.prenom} (${addr}${dist})\n`
        }
      } else {
        for (const emp of r.employees) {
          const dist = emp.distToOffice > 0 ? `, ${emp.distToOffice} km` : ""
          out += `    - ${emp.nom} ${emp.prenom} (${extractZone(emp.adresse)}${dist})\n`
        }
      }
    }
    return out
  }

  if (q.includes("vehicule") || q.includes("vehicule") || q.includes("combien") || q.includes("optimise") || q.includes("trajet")) {
    if (workingWithAddr.length === 0) return "Aucun employe en service avec adresse renseignee aujourd'hui."

    let result = `\ud83d\udcca Optimisation transport -- ${today}\n`
    result += `${"=".repeat(40)}\n\n`

    for (const [time, routes] of Array.from(shiftRoutes.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      result += formatShiftRoutes(time, routes) + "\n"
    }

    result += `${"=".repeat(40)}\n`
    result += `TOTAL: ${totalVehicles} vehicule(s) pour ${totalEmployeesRouted} employes\n`
    result += `Economie vs individuel: ${totalEmployeesRouted - totalVehicles} trajets evites\n`
    result += `Distance totale estimee: ~${Math.round(totalDistAll)} km`

    if (sansAdresse.length > 0) {
      result += `\n\n\u26a0\ufe0f ${sansAdresse.length} employe(s) sans adresse (non inclus dans le calcul)`
    }

    return result
  }

  if (q.includes("ramassage") || q.includes("organise") || q.includes("plan")) {
    if (workingWithAddr.length === 0) return "Aucun employe en service avec adresse renseignee. Verifiez que les employes ont des adresses et des shifts assignes."

    const shiftMatch = q.match(/(\d{2}:\d{2})/)
    const filteredShifts = shiftMatch
      ? Array.from(shiftRoutes.entries()).filter(([t]) => t === shiftMatch[1])
      : Array.from(shiftRoutes.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    if (filteredShifts.length === 0) {
      return `Aucun employe trouve pour le shift de ${shiftMatch?.[1]}. Horaires disponibles: ${Array.from(shiftRoutes.keys()).sort().join(", ")}`
    }

    let result = `\ud83d\ude90 Plan de ramassage${shiftMatch ? ` -- Shift ${shiftMatch[1]}` : ""} -- ${today}\n`
    result += `${"=".repeat(40)}\n\n`

    let filteredVehicles = 0
    let filteredEmps = 0
    let filteredDist = 0

    for (const [time, routes] of filteredShifts) {
      result += formatShiftRoutes(time, routes, true) + "\n"
      filteredVehicles += routes.length
      filteredEmps += routes.reduce((s, r) => s + r.employees.length, 0)
      filteredDist += routes.reduce((s, r) => s + r.totalDist, 0)
    }

    result += `${"=".repeat(40)}\n`
    result += `TOTAL: ${filteredVehicles} vehicule(s) pour ${filteredEmps} employes\n`
    result += `Economie vs individuel: ${filteredEmps - filteredVehicles} trajets evites\n`
    result += `Distance totale estimee: ~${Math.round(filteredDist)} km`

    if (sansAdresse.length > 0) {
      result += `\n\n\u26a0\ufe0f ${sansAdresse.length} employe(s) sans adresse non inclus`
    }

    return result
  }

  if (q.includes("pres de") || q.includes("pres de") || q.includes("habitent") || q.includes("zone")) {
    const zoneMatch = q.match(/(?:pres de|pres de|zone)\s+(.+)/i)
    if (zoneMatch) {
      const searchZone = zoneMatch[1].trim().toLowerCase()
      const found = working.filter(p => p.adresse?.toLowerCase().includes(searchZone))
      if (found.length === 0) return `Aucun employe en service trouve pres de "${zoneMatch[1].trim()}".`
      return `${found.length} employe(s) en service pres de "${zoneMatch[1].trim()}":\n\n${found.map(e => `\u2022 ${e.prenom} ${e.nom} - ${e.adresse || "Pas d'adresse"}`).join("\n")}`
    }
  }

  if (q.includes("sans adresse") || q.includes("adresse manquante") || q.includes("mettre a jour") || q.includes("mise a jour")) {
    if (sansAdresse.length === 0) return "Tous les employes ont une adresse renseignee. \u2705"
    return `\u26a0\ufe0f ${sansAdresse.length} employe(s) sans adresse a mettre a jour:\n\n${sansAdresse.map(e => `\u2022 ${e.prenom} ${e.nom} (${e.poste || "poste non defini"})`).join("\n")}\n\nCes employes ne sont pas inclus dans l'optimisation de transport.`
  }

  // Default: summary with optimized vehicle count
  const zones = new Map<string, number>()
  for (const p of working) {
    const zone = extractZone(p.adresse)
    zones.set(zone, (zones.get(zone) || 0) + 1)
  }
  const topZones = [...zones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  let result = `\ud83d\udcca Resume du jour -- ${today}\n`
  result += `${"=".repeat(40)}\n\n`
  result += `\u2022 ${positions.length} employes au total\n`
  result += `\u2022 ${working.length} en service\n`
  result += `\u2022 ${sansAdresse.length} sans adresse\n\n`
  result += `\ud83d\ude90 Transport optimise: ${totalVehicles} vehicule(s) pour ${totalEmployeesRouted} employes\n`
  if (totalEmployeesRouted > 0) {
    result += `   (ratio: 1 vehicule pour ${(totalEmployeesRouted / Math.max(totalVehicles, 1)).toFixed(1)} employes)\n`
  }
  result += `\nTop zones en service:\n`
  result += topZones.map(([z, n]) => `\u2022 ${z}: ${n} employe(s)`).join("\n")
  result += `\n\nShifts actifs: ${sortedShifts.map(([t, e]) => `${t} (${e.length} pers.)`).join(", ") || "aucun"}`
  return result
}

function extractZone(adresse: string): string {
  if (!adresse) return "Non renseignée"
  const parts = adresse.split(",").map(s => s.trim())
  return parts[parts.length - 1] || parts[0] || "Non renseignée"
}

const shiftColor = (s: string) => {
  if (s === "travail") return BLUE
  if (s === "repos") return "#9ca3af"
  if (s === "conge") return GREEN
  return "#d1d5db"
}

// Dynamic import of the map component (Leaflet doesn't work with SSR)
const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className="h-[500px] bg-gray-100 rounded-2xl flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> })

export default function GeolocalisationPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [positions, setPositions] = useState<EmployeePosition[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filterGroupe, setFilterGroupe] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<"carte" | "liste">("carte")
  const [aiQuery, setAiQuery] = useState("")
  const [aiResponse, setAiResponse] = useState<string | null>(null)

  // Claude IA state
  interface ClaudeInsights {
    insights: string
    suggestions: string[]
    metrics: Record<string, string | number>
    error?: string
    raw?: boolean
  }
  const [claudeLoading, setClaudeLoading] = useState(false)
  const [claudeData, setClaudeData] = useState<ClaudeInsights | null>(null)
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const [nlQuery, setNlQuery] = useState("")
  const [nlLoading, setNlLoading] = useState(false)
  const [nlData, setNlData] = useState<ClaudeInsights | null>(null)
  const [nlError, setNlError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values()) as any[]
      setSocietes(unique)
      if (unique.length > 0) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/geolocalisation?societe_id=${societe}`)
      const data = await res.json()
      setPositions(data.positions || [])
      setGroupes(data.groupes || [])
    } catch { /* noop */ }
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  // Call Claude for a full team analysis
  const runClaudeAnalysis = useCallback(async () => {
    setClaudeLoading(true)
    setClaudeError(null)
    try {
      const res = await fetch("/api/rh/geolocalisation/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employees: positions,
          context: "Analyse globale: composition d'equipe par zone, optimisation transport, couverture shifts, zones a risque et recommandations de routage.",
          mode: "insights",
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setClaudeError(data.error || "Erreur lors de l'appel a l'IA")
        setClaudeData(null)
      } else {
        setClaudeData(data)
      }
    } catch (e: any) {
      setClaudeError(e?.message || "Erreur reseau")
    } finally {
      setClaudeLoading(false)
    }
  }, [positions])

  // Call Claude for a natural language question
  const runClaudeQuery = useCallback(async (question: string) => {
    if (!question.trim()) return
    setNlLoading(true)
    setNlError(null)
    try {
      const res = await fetch("/api/rh/geolocalisation/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employees: positions,
          context: question,
          mode: "query",
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setNlError(data.error || "Erreur lors de l'appel a l'IA")
        setNlData(null)
      } else {
        setNlData(data)
      }
    } catch (e: any) {
      setNlError(e?.message || "Erreur reseau")
    } finally {
      setNlLoading(false)
    }
  }, [positions])

  // Filter by group
  const filteredPositions = useMemo(() => {
    if (filterGroupe === "all") return positions
    return positions.filter(p => p.groupe_id === filterGroupe)
  }, [positions, filterGroupe])

  // Stats
  const total = filteredPositions.length
  const enService = filteredPositions.filter(p => p.shift_today === "travail").length
  const repos = filteredPositions.filter(p => p.shift_today === "repos").length
  const conge = filteredPositions.filter(p => p.shift_today === "conge").length
  const avecAdresse = filteredPositions.filter(p => p.adresse && p.adresse !== "").length
  const sansAdresse = total - avecAdresse
  const avecGPS = filteredPositions.filter(p => p.latitude && p.longitude).length

  // Group by zone
  const zones = useMemo(() => {
    const map = new Map<string, EmployeePosition[]>()
    for (const p of filteredPositions) {
      const zone = extractZone(p.adresse)
      if (!map.has(zone)) map.set(zone, [])
      map.get(zone)!.push(p)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filteredPositions])

  // Ramassage: group by shift start time, then by zone/proximity
  const ramassageGroups = useMemo(() => {
    const working = filteredPositions.filter(e => e.shift_today === "travail" && e.adresse && e.adresse !== "")

    // Group by start time
    const byTime = new Map<string, EmployeePosition[]>()
    for (const e of working) {
      const time = e.heure_debut ? String(e.heure_debut).slice(0, 5) : "non défini"
      if (!byTime.has(time)) byTime.set(time, [])
      byTime.get(time)!.push(e)
    }

    // For each time group, sub-group by zone
    const groups: { time: string; zone: string; emps: EmployeePosition[] }[] = []
    for (const [time, emps] of byTime.entries()) {
      const byZone = new Map<string, EmployeePosition[]>()
      for (const e of emps) {
        const zone = extractZone(e.adresse)
        if (!byZone.has(zone)) byZone.set(zone, [])
        byZone.get(zone)!.push(e)
      }
      for (const [zone, zoneEmps] of byZone.entries()) {
        if (zoneEmps.length >= 1 && zone !== "Non renseignée") {
          groups.push({ time, zone, emps: zoneEmps })
        }
      }
    }

    // Sort by time then by number of employees
    return groups.sort((a, b) => a.time.localeCompare(b.time) || b.emps.length - a.emps.length)
  }, [filteredPositions])

  // Unique shift times for filter
  const shiftTimes = useMemo(() => {
    const times = new Set<string>()
    for (const p of filteredPositions.filter(e => e.shift_today === "travail")) {
      times.add(p.heure_debut ? String(p.heure_debut).slice(0, 5) : "non défini")
    }
    return [...times].sort()
  }, [filteredPositions])

  const [filterTime, setFilterTime] = useState<string>("all")

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <MapPin className="w-6 h-6" style={{ color: GOLD }} />
            {t('rha.b.geo.title', locale)}
          </h1>
          <p className="text-sm text-gray-500">{t('rha.b.geo.subtitle', locale)}</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-52"><SelectValue placeholder={t('rha.b.geo.societe', locale)} /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          {groupes.length > 0 && (
            <Select value={filterGroupe} onValueChange={setFilterGroupe}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t('rha.b.geo.group', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rha.b.geo.all_groups', locale)}</SelectItem>
                {groupes.map(g => <SelectItem key={g.id} value={g.id}>{g.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setView("carte")} className={`px-3 py-2 text-xs font-medium ${view === "carte" ? "bg-[#0B0F2E] text-white" : "text-gray-500"}`}>{t('rha.b.geo.view_map', locale)}</button>
            <button onClick={() => setView("liste")} className={`px-3 py-2 text-xs font-medium ${view === "liste" ? "bg-[#0B0F2E] text-white" : "text-gray-500"}`}>{t('rha.b.geo.view_list', locale)}</button>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: t('rha.b.geo.kpi_total', locale), value: total, icon: Users, color: NAVY },
          { label: t('rha.b.geo.kpi_in_service', locale), value: enService, icon: Clock, color: BLUE },
          { label: t('rha.b.geo.kpi_rest', locale), value: repos, icon: Coffee, color: "#9ca3af" },
          { label: t('rha.b.geo.kpi_leave', locale), value: conge, icon: Coffee, color: GREEN },
          { label: t('rha.b.geo.kpi_with_addr', locale), value: avecAdresse, icon: MapPin, color: GREEN },
          { label: t('rha.b.geo.kpi_no_addr', locale), value: sansAdresse, icon: MapPin, color: "#dc2626" },
        ].map(k => (
          <Card key={k.label} className="rounded-2xl shadow-sm">
            <CardContent className="p-4 text-center">
              <k.icon className="w-5 h-5 mx-auto mb-1" style={{ color: k.color }} />
              <p className="text-2xl font-bold" style={{ color: k.color }}>{loading ? "..." : k.value}</p>
              <p className="text-[10px] text-gray-500">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ====== IA Assistant Geolocalisation (Claude) ====== */}
      <Card
        className="rounded-3xl border-0 overflow-hidden shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #11173E 55%, #1A2150 100%)`,
          borderTop: `3px solid ${GOLD}`,
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F4D06F 100%)` }}
              >
                <Brain className="w-6 h-6" style={{ color: NAVY }} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  {t('rha.b.geo.ai_title', locale)}
                  <Badge
                    className="text-[9px] font-semibold tracking-wider"
                    style={{ backgroundColor: `${GOLD}25`, color: GOLD, border: `1px solid ${GOLD}50` }}
                  >
                    <Sparkles className="w-2.5 h-2.5 mr-1" /> CLAUDE
                  </Badge>
                </CardTitle>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {t('rha.b.geo.ai_subtitle', locale)}
                </p>
              </div>
            </div>
            <Button
              onClick={runClaudeAnalysis}
              disabled={claudeLoading || positions.length === 0}
              className="shrink-0 font-semibold shadow-lg transition-all hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${GOLD} 0%, #E8C252 100%)`,
                color: NAVY,
                border: "none",
              }}
            >
              {claudeLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('rha.b.geo.ai_analyzing', locale)}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  {t('rha.b.geo.ai_analyze_btn', locale)}
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error state */}
          {claudeError && (
            <div
              className="p-4 rounded-2xl text-sm flex items-start gap-3"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                color: "#fca5a5",
              }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t('rha.b.geo.ai_error', locale)}</p>
                <p className="text-xs mt-1 opacity-80">{claudeError}</p>
              </div>
            </div>
          )}

          {/* Results panel */}
          {claudeData && !claudeError && (
            <div className="space-y-4">
              {/* Insights narrative */}
              {claudeData.insights && (
                <div
                  className="p-5 rounded-2xl leading-relaxed"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderLeft: `3px solid ${GOLD}`,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                      {t('rha.b.geo.executive_analysis', locale)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{claudeData.insights}</p>
                </div>
              )}

              {/* Metrics badges */}
              {claudeData.metrics && Object.keys(claudeData.metrics).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(claudeData.metrics).map(([key, value]) => (
                    <div
                      key={key}
                      className="px-3 py-2 rounded-xl flex items-center gap-2"
                      style={{
                        background: "rgba(212,175,55,0.08)",
                        border: `1px solid ${GOLD}33`,
                      }}
                    >
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-bold" style={{ color: GOLD }}>
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggestions list */}
              {claudeData.suggestions && claudeData.suggestions.length > 0 && (
                <div
                  className="p-5 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                      {t('rha.b.geo.recommendations', locale)}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {claudeData.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GOLD }} />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!claudeData && !claudeError && !claudeLoading && (
            <div
              className="p-6 rounded-2xl text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
            >
              <Route className="w-8 h-8 mx-auto mb-2" style={{ color: "rgba(212,175,55,0.5)" }} />
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                {t('rha.b.geo.empty_hint', locale)}
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t('rha.b.geo.empty_subtitle', locale)}
              </p>
            </div>
          )}

          {/* ===== Natural language query ===== */}
          <div
            className="pt-4 mt-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4" style={{ color: GOLD }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                {t('rha.b.geo.free_question', locale)}
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                runClaudeQuery(nlQuery)
              }}
              className="flex gap-2"
            >
              <Input
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                placeholder={t('rha.b.geo.question_ph', locale)}
                className="flex-1 text-sm border-0 text-white placeholder:text-gray-400 h-11 rounded-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
              />
              <Button
                type="submit"
                disabled={nlLoading || !nlQuery.trim()}
                className="shrink-0 h-11 rounded-xl font-semibold shadow-md"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                {nlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>

            {/* Suggestion chips */}
            <div className="flex gap-2 flex-wrap mt-3">
              {[
                "Qui peut couvrir le shift de nuit ce soir ?",
                "Proposez une rotation optimale pour demain",
                "Quels employes sont a risque de fatigue ?",
                "Quelle est la zone la moins couverte ?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setNlQuery(q)
                    runClaudeQuery(q)
                  }}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all hover:scale-[1.03]"
                  style={{
                    background: "rgba(212,175,55,0.08)",
                    color: "rgba(255,255,255,0.75)",
                    border: `1px solid ${GOLD}25`,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* NL query response */}
            {nlError && (
              <div
                className="mt-3 p-3 rounded-xl text-xs flex items-start gap-2"
                style={{
                  backgroundColor: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "#fca5a5",
                }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{nlError}</span>
              </div>
            )}

            {nlData && !nlError && (
              <div className="mt-4 space-y-3">
                {nlData.insights && (
                  <div
                    className="p-4 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      borderLeft: `3px solid ${GOLD}`,
                      color: "rgba(255,255,255,0.92)",
                    }}
                  >
                    {nlData.insights}
                  </div>
                )}
                {nlData.metrics && Object.keys(nlData.metrics).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(nlData.metrics).map(([key, value]) => (
                      <Badge
                        key={key}
                        className="text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${GOLD}20`,
                          color: GOLD,
                          border: `1px solid ${GOLD}40`,
                        }}
                      >
                        {key.replace(/_/g, " ")}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                )}
                {nlData.suggestions && nlData.suggestions.length > 0 && (
                  <ul className="space-y-1.5 pl-1">
                    {nlData.suggestions.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs"
                        style={{ color: "rgba(255,255,255,0.82)" }}
                      >
                        <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: GOLD }} />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* MAP */}
            {view === "carte" && (
              <Card className="rounded-2xl shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <MapComponent positions={filteredPositions} />
                </CardContent>
              </Card>
            )}

            {/* LIST */}
            {view === "liste" && zones.map(([zone, emps]) => (
              <Card key={zone} className="rounded-2xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: GOLD }} /> {zone}</span>
                    <Badge variant="outline" className="text-xs">{t('rha.b.geo.n_employees', locale).replace('{n}', String(emps.length))}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t('rha.b.geo.col_employee', locale)}</TableHead>
                        <TableHead className="text-xs">{t('rha.b.geo.col_position', locale)}</TableHead>
                        <TableHead className="text-xs">{t('rha.b.geo.col_address', locale)}</TableHead>
                        <TableHead className="text-xs">{t('rha.b.geo.col_shift', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emps.map(p => (
                        <TableRow key={p.employe_id}>
                          <TableCell className="py-2 text-sm font-medium">
                            {p.prenom} {p.nom}
                            {p.groupe_nom && <Badge className="ml-2 text-[9px]" style={{ backgroundColor: `${GOLD}20`, color: GOLD }}>{p.groupe_nom}</Badge>}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-gray-500">{p.poste || "—"}</TableCell>
                          <TableCell className="py-2 text-xs text-gray-500 max-w-[200px] truncate">{p.adresse || t('rha.b.geo.address_missing', locale)}</TableCell>
                          <TableCell className="py-2">
                            <Badge className="text-[10px]" style={{ backgroundColor: shiftColor(p.shift_today) + "20", color: shiftColor(p.shift_today) }}>
                              {p.shift_label}{p.heure_debut ? ` ${p.heure_debut}-${p.heure_fin}` : ""}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sidebar — Ramassage */}
          <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm" style={{ borderLeft: `4px solid ${GOLD}` }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                  <Truck className="w-5 h-5" style={{ color: GOLD }} /> {t('rha.b.geo.organize_pickup', locale)}
                </CardTitle>
                <p className="text-xs text-gray-500">{t('rha.b.geo.pickup_subtitle', locale)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Filter by shift time */}
                <div className="flex gap-1 flex-wrap mb-2">
                  <button onClick={() => setFilterTime("all")} className={`px-2 py-1 rounded-md text-[10px] font-medium ${filterTime === "all" ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-500"}`}>{t('rha.b.geo.all', locale)}</button>
                  {shiftTimes.map(t => (
                    <button key={t} onClick={() => setFilterTime(t)} className={`px-2 py-1 rounded-md text-[10px] font-medium ${filterTime === t ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-500"}`}>{t}</button>
                  ))}
                </div>

                {ramassageGroups.filter(g => filterTime === "all" || g.time === filterTime).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">{t('rha.b.geo.no_in_service', locale)}</p>
                ) : ramassageGroups.filter(g => filterTime === "all" || g.time === filterTime).map((g, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ backgroundColor: `${BLUE}06`, border: `1px solid ${BLUE}12` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px] font-mono" style={{ backgroundColor: `${GOLD}20`, color: GOLD }}>{g.time}</Badge>
                        <span className="text-xs font-semibold" style={{ color: NAVY }}>{g.zone}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{g.emps.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {g.emps.map(e => (
                        <div key={e.employe_id} className="flex items-center gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BLUE }} />
                          <span className="text-gray-700">{e.prenom} {e.nom}</span>
                          {e.groupe_nom && <Badge className="text-[8px] px-1 py-0" style={{ backgroundColor: `${GOLD}15`, color: GOLD }}>{e.groupe_nom}</Badge>}
                          <span className="text-gray-300 ml-auto text-[10px] truncate max-w-[100px]">{e.adresse?.split(",")[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Légende */}
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">{t('rha.b.geo.legend', locale)}</p>
                {[
                  { color: BLUE, label: t('rha.b.geo.legend_in_service', locale) },
                  { color: "#9ca3af", label: t('rha.b.geo.legend_rest', locale) },
                  { color: GREEN, label: t('rha.b.geo.legend_leave', locale) },
                  { color: "#d1d5db", label: t('rha.b.geo.legend_unplanned', locale) },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2 text-xs text-gray-600">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* AI Planning Assistant */}
      <Card className="rounded-2xl shadow-lg overflow-hidden" style={{ backgroundColor: NAVY, borderTop: `3px solid ${GOLD}` }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <Bot className="w-5 h-5" style={{ color: GOLD }} />
            <span>{t('rha.b.geo.assistant_title', locale)}</span>
            <Badge className="text-[9px] ml-2" style={{ backgroundColor: `${GOLD}30`, color: GOLD }}>Beta</Badge>
          </CardTitle>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{t('rha.b.geo.assistant_subtitle', locale)}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); if (aiQuery.trim()) { setAiResponse(generateAIResponse(aiQuery, filteredPositions, ramassageGroups)); } }} className="flex gap-2">
            <Input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              placeholder="Ex: Combien de vehicules faut-il pour demain ?"
              className="flex-1 text-sm border-0 text-white placeholder:text-gray-500"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            />
            <Button type="submit" size="sm" className="shrink-0" style={{ backgroundColor: GOLD, color: NAVY }} disabled={!aiQuery.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="flex gap-1 flex-wrap">
            {["Optimiser les trajets", "Plan de ramassage 06:00", "Plan de ramassage 14:00", "Employes sans adresse"].map(q => (
              <button key={q} onClick={() => { setAiQuery(q); setAiResponse(generateAIResponse(q, filteredPositions, ramassageGroups)) }} className="px-2 py-1 rounded-md text-[10px] font-medium transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                {q}
              </button>
            ))}
          </div>
          {aiResponse && (
            <div className="p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderLeft: `3px solid ${GOLD}` }}>
              {aiResponse}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
