"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, MapPin, Users, Navigation, Truck, RefreshCw } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

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

// Simple distance estimation between two addresses (dummy by last word / zone)
function extractZone(adresse: string): string {
  if (!adresse) return "Non renseignée"
  const parts = adresse.split(",").map(s => s.trim())
  // Use last meaningful part as zone (city/region)
  return parts[parts.length - 1] || parts[0] || "Non renseignée"
}

// Haversine distance for sorting
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

const SHIFT_COLORS: Record<string, string> = {
  travail: "bg-blue-100 text-blue-800 border-blue-300",
  repos: "bg-gray-100 text-gray-600 border-gray-300",
  conge: "bg-green-100 text-green-800 border-green-300",
  non_planifie: "bg-yellow-50 text-yellow-700 border-yellow-300",
}

const SHIFT_DOT_COLORS: Record<string, string> = {
  travail: "bg-blue-500",
  repos: "bg-gray-400",
  conge: "bg-green-500",
  non_planifie: "bg-yellow-400",
}

export default function GeolocalisationPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [positions, setPositions] = useState<EmployeePosition[]>([])
  const [loading, setLoading] = useState(true)

  // Office reference coordinates (société HQ — defaulting to Port Louis, Mauritius)
  const officeLat = -20.1609
  const officeLon = 57.5012

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    if (societe === "all") {
      setPositions([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/geolocalisation?societe_id=${societe}`)
      const data = await res.json()
      setPositions(data.positions || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societe])

  useEffect(() => { load() }, [load])

  // Group by zone
  const zoneGroups: Record<string, EmployeePosition[]> = {}
  for (const p of positions) {
    const zone = extractZone(p.adresse)
    if (!zoneGroups[zone]) zoneGroups[zone] = []
    zoneGroups[zone].push(p)
  }

  const sortedZones = Object.keys(zoneGroups).sort((a, b) => zoneGroups[b].length - zoneGroups[a].length)

  // Stats
  const totalEmployes = positions.length
  const nbTravail = positions.filter(p => p.shift_today === "travail").length
  const nbRepos = positions.filter(p => p.shift_today === "repos").length
  const nbConge = positions.filter(p => p.shift_today === "conge").length
  const nbSansAdresse = positions.filter(p => !p.adresse).length

  // Suggested pickup groupings (zones with 2+ employees working today)
  const ramassageGroups = sortedZones
    .map(zone => ({
      zone,
      employes: zoneGroups[zone].filter(p => p.shift_today === "travail"),
    }))
    .filter(g => g.employes.length >= 2)

  function estimateDistance(p: EmployeePosition): string {
    if (p.latitude && p.longitude) {
      return `${haversineKm(p.latitude, p.longitude, officeLat, officeLon)} km`
    }
    return "—"
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <MapPin className="h-6 w-6" style={{ color: GOLD }} />
            Carte des collaborateurs
          </h1>
          <p className="text-gray-500 text-sm">Localisation et planning du jour pour chaque employé</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Sélectionner une société" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">-- Sélectionner --</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {societe === "all" && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Veuillez sélectionner une société pour afficher les collaborateurs</p>
          </CardContent>
        </Card>
      )}

      {societe !== "all" && loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
        </div>
      )}

      {societe !== "all" && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Users className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{totalEmployes}</p>
                <p className="text-xs text-gray-500">Total employés</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="h-3 w-3 rounded-full bg-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-700">{nbTravail}</p>
                <p className="text-xs text-gray-500">En service</p>
              </CardContent>
            </Card>
            <Card className="border-gray-200">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="h-3 w-3 rounded-full bg-gray-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-600">{nbRepos}</p>
                <p className="text-xs text-gray-500">Repos</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="h-3 w-3 rounded-full bg-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-700">{nbConge}</p>
                <p className="text-xs text-gray-500">Congé</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <MapPin className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
                <p className="text-2xl font-bold text-yellow-600">{nbSansAdresse}</p>
                <p className="text-xs text-gray-500">Sans adresse</p>
              </CardContent>
            </Card>
          </div>

          {/* Employees by Zone */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main list — 2 cols */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                    <Navigation className="h-5 w-5" style={{ color: BLUE }} />
                    Collaborateurs par zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {positions.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-6">Aucun employé trouvé</p>
                  )}

                  {sortedZones.map(zone => (
                    <div key={zone} className="border rounded-lg overflow-hidden">
                      <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: `${NAVY}08` }}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" style={{ color: GOLD }} />
                          <span className="font-semibold text-sm" style={{ color: NAVY }}>{zone}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{zoneGroups[zone].length} employé{zoneGroups[zone].length > 1 ? "s" : ""}</Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Employé</TableHead>
                            <TableHead className="text-xs">Poste</TableHead>
                            <TableHead className="text-xs">Adresse</TableHead>
                            <TableHead className="text-xs">Shift</TableHead>
                            <TableHead className="text-xs text-right">Dist. bureau</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {zoneGroups[zone].map(p => (
                            <TableRow key={p.employe_id}>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-2">
                                  <div className={`h-2.5 w-2.5 rounded-full ${SHIFT_DOT_COLORS[p.shift_today] || "bg-gray-300"}`} />
                                  <span className="font-medium text-sm">{p.prenom} {p.nom}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-sm text-gray-600">{p.poste || "—"}</TableCell>
                              <TableCell className="py-2 text-sm text-gray-500 max-w-[200px] truncate">{p.adresse || "Non renseignée"}</TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline" className={`text-xs ${SHIFT_COLORS[p.shift_today] || ""}`}>
                                  {p.shift_label}
                                  {p.heure_debut && ` ${p.heure_debut}-${p.heure_fin}`}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right font-mono text-gray-500">
                                {estimateDistance(p)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar — Ramassage */}
            <div className="space-y-4">
              <Card className="border-2" style={{ borderColor: GOLD }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                    <Truck className="h-5 w-5" style={{ color: GOLD }} />
                    Organiser ramassage
                  </CardTitle>
                  <p className="text-xs text-gray-500">Regroupements suggérés (2+ employés en service dans la même zone)</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ramassageGroups.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">Aucun regroupement possible aujourd'hui</p>
                  )}

                  {ramassageGroups.map((g, idx) => (
                    <div key={g.zone} className="border rounded-lg p-3 space-y-2" style={{ borderColor: `${BLUE}40` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: BLUE }}>
                            {idx + 1}
                          </div>
                          <span className="font-semibold text-sm" style={{ color: NAVY }}>{g.zone}</span>
                        </div>
                        <Badge style={{ backgroundColor: `${BLUE}20`, color: BLUE }} className="text-xs">
                          {g.employes.length} pers.
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {g.employes.map(emp => (
                          <div key={emp.employe_id} className="flex items-center gap-2 text-xs text-gray-600 pl-8">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            <span>{emp.prenom} {emp.nom}</span>
                            {emp.heure_debut && (
                              <span className="text-gray-400">({emp.heure_debut})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Legend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Légende</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span>En service aujourd'hui</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full bg-gray-400" />
                    <span>Repos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span>Congé</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                    <span>Non planifié</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
