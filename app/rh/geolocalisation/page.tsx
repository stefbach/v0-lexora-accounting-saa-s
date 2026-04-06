"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, MapPin, Users, Navigation, Truck, RefreshCw, Clock, Coffee } from "lucide-react"

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
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [positions, setPositions] = useState<EmployeePosition[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<"carte" | "liste">("carte")

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
    } catch {}
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  // Stats
  const total = positions.length
  const enService = positions.filter(p => p.shift_today === "travail").length
  const repos = positions.filter(p => p.shift_today === "repos").length
  const conge = positions.filter(p => p.shift_today === "conge").length
  const avecAdresse = positions.filter(p => p.adresse && p.adresse !== "").length
  const sansAdresse = total - avecAdresse
  const avecGPS = positions.filter(p => p.latitude && p.longitude).length

  // Group by zone
  const zones = useMemo(() => {
    const map = new Map<string, EmployeePosition[]>()
    for (const p of positions) {
      const zone = extractZone(p.adresse)
      if (!map.has(zone)) map.set(zone, [])
      map.get(zone)!.push(p)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [positions])

  // Ramassage suggestions: zones with 2+ working employees
  const ramassageSuggestions = useMemo(() => {
    return zones
      .map(([zone, emps]) => ({ zone, emps: emps.filter(e => e.shift_today === "travail") }))
      .filter(g => g.emps.length >= 2 && g.zone !== "Non renseignée")
  }, [zones])

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <MapPin className="w-6 h-6" style={{ color: GOLD }} />
            Carte des collaborateurs
          </h1>
          <p className="text-sm text-gray-500">Localisation, planning du jour et organisation ramassage</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setView("carte")} className={`px-3 py-2 text-xs font-medium ${view === "carte" ? "bg-[#0B0F2E] text-white" : "text-gray-500"}`}>Carte</button>
            <button onClick={() => setView("liste")} className={`px-3 py-2 text-xs font-medium ${view === "liste" ? "bg-[#0B0F2E] text-white" : "text-gray-500"}`}>Liste</button>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Total", value: total, icon: Users, color: NAVY },
          { label: "En service", value: enService, icon: Clock, color: BLUE },
          { label: "Repos", value: repos, icon: Coffee, color: "#9ca3af" },
          { label: "Congé", value: conge, icon: Coffee, color: GREEN },
          { label: "Avec adresse", value: avecAdresse, icon: MapPin, color: GREEN },
          { label: "Sans adresse", value: sansAdresse, icon: MapPin, color: "#dc2626" },
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
                  <MapComponent positions={positions} />
                </CardContent>
              </Card>
            )}

            {/* LIST */}
            {view === "liste" && zones.map(([zone, emps]) => (
              <Card key={zone} className="rounded-2xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: GOLD }} /> {zone}</span>
                    <Badge variant="outline" className="text-xs">{emps.length} employé(s)</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Employé</TableHead>
                        <TableHead className="text-xs">Poste</TableHead>
                        <TableHead className="text-xs">Adresse</TableHead>
                        <TableHead className="text-xs">Shift</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emps.map(p => (
                        <TableRow key={p.employe_id}>
                          <TableCell className="py-2 text-sm font-medium">{p.prenom} {p.nom}</TableCell>
                          <TableCell className="py-2 text-xs text-gray-500">{p.poste || "—"}</TableCell>
                          <TableCell className="py-2 text-xs text-gray-500 max-w-[200px] truncate">{p.adresse || "Non renseignée"}</TableCell>
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
                  <Truck className="w-5 h-5" style={{ color: GOLD }} /> Organiser ramassage
                </CardTitle>
                <p className="text-xs text-gray-500">Regroupements suggérés (2+ employés en service dans la même zone)</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {ramassageSuggestions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Aucun regroupement possible</p>
                ) : ramassageSuggestions.map((g, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ backgroundColor: `${BLUE}08`, border: `1px solid ${BLUE}15` }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: NAVY }}>{g.zone}</span>
                      <Badge style={{ backgroundColor: `${BLUE}20`, color: BLUE }} className="text-[10px]">{g.emps.length} pers.</Badge>
                    </div>
                    <div className="space-y-1">
                      {g.emps.map(e => (
                        <div key={e.employe_id} className="flex items-center gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BLUE }} />
                          <span className="text-gray-700">{e.prenom} {e.nom}</span>
                          {e.heure_debut && <span className="text-gray-400 ml-auto">({e.heure_debut})</span>}
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
                <p className="text-xs font-semibold text-gray-500 uppercase">Légende</p>
                {[
                  { color: BLUE, label: "En service aujourd'hui" },
                  { color: "#9ca3af", label: "Repos" },
                  { color: GREEN, label: "Congé" },
                  { color: "#d1d5db", label: "Non planifié" },
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
    </div>
  )
}
