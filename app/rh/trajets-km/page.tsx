"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Car, Bike, Navigation, CheckCircle, XCircle, Settings, TrendingUp, Route, DollarSign, Save } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 2 }).format(n)
}

function fmtKm(n: number) {
  return `${n.toFixed(1)} km`
}

const STATUT_COLORS: Record<string, string> = {
  en_cours: "bg-blue-100 text-blue-800",
  termine: "bg-yellow-100 text-yellow-800",
  valide: "bg-green-100 text-green-800",
  rejete: "bg-red-100 text-red-800",
}
const STATUT_LABELS: Record<string, string> = {
  en_cours: "En cours",
  termine: "A valider",
  valide: "Validé",
  rejete: "Rejeté",
}

const VEHICULE_ICONS: Record<string, any> = {
  voiture: Car,
  moto: Bike,
  velo: Bike,
}

const VEHICULE_LABELS: Record<string, string> = {
  voiture: "Voiture",
  moto: "Moto",
  velo: "Vélo",
}

interface Trajet {
  id: string
  employe_id: string
  employe_nom: string
  employe_prenom: string
  employe_poste: string
  date_depart: string
  date_arrivee: string | null
  adresse_depart: string | null
  adresse_arrivee: string | null
  distance_km: number
  taux_km: number
  indemnite: number
  vehicule_type: string
  statut: string
  steps: any[]
}

interface Parametre {
  id: string
  vehicule_type: string
  taux_km: number
  plafond_mensuel: number | null
  actif: boolean
}

export default function TrajetsKmPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [trajets, setTrajets] = useState<Trajet[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total_km: 0, total_indemnite: 0, nb_trajets: 0 })
  const [dateDebut, setDateDebut] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dateFin, setDateFin] = useState(() => new Date().toISOString().slice(0, 10))
  const [filterStatut, setFilterStatut] = useState("all")

  // Parametres state
  const [parametres, setParametres] = useState<Parametre[]>([])
  const [showParams, setShowParams] = useState(false)
  const [paramVoiture, setParamVoiture] = useState("0.50")
  const [paramMoto, setParamMoto] = useState("0.30")
  const [paramVelo, setParamVelo] = useState("0.15")
  const [plafondMensuel, setPlafondMensuel] = useState("")
  const [savingParams, setSavingParams] = useState(false)

  // Detail dialog
  const [selectedTrajet, setSelectedTrajet] = useState<Trajet | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    if (societe === "all") {
      setTrajets([])
      setStats({ total_km: 0, total_indemnite: 0, nb_trajets: 0 })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        societe_id: societe,
        date_debut: dateDebut,
        date_fin: dateFin,
      })
      if (filterStatut !== "all") params.set("statut", filterStatut)

      const res = await fetch(`/api/rh/trajets-km?${params}`)
      const data = await res.json()
      setTrajets(data.trajets || [])
      setStats(data.stats || { total_km: 0, total_indemnite: 0, nb_trajets: 0 })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societe, dateDebut, dateFin, filterStatut])

  useEffect(() => { load() }, [load])

  // Load parametres when société changes
  const loadParams = useCallback(async () => {
    if (societe === "all") return
    try {
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parametres", societe_id: societe, mode: "get" }),
      })
      const data = await res.json()
      const params = data.parametres || []
      setParametres(params)
      // Pre-fill form
      const voiture = params.find((p: Parametre) => p.vehicule_type === "voiture")
      const moto = params.find((p: Parametre) => p.vehicule_type === "moto")
      const velo = params.find((p: Parametre) => p.vehicule_type === "velo")
      if (voiture) setParamVoiture(String(voiture.taux_km))
      if (moto) setParamMoto(String(moto.taux_km))
      if (velo) setParamVelo(String(velo.taux_km))
      const anyPlafond = params.find((p: Parametre) => p.plafond_mensuel)
      if (anyPlafond) setPlafondMensuel(String(anyPlafond.plafond_mensuel))
    } catch (e) {
      console.error(e)
    }
  }, [societe])

  useEffect(() => { loadParams() }, [loadParams])

  const saveParametres = async () => {
    setSavingParams(true)
    try {
      const types = [
        { vehicule_type: "voiture", taux_km: parseFloat(paramVoiture) },
        { vehicule_type: "moto", taux_km: parseFloat(paramMoto) },
        { vehicule_type: "velo", taux_km: parseFloat(paramVelo) },
      ]
      for (const t of types) {
        if (isNaN(t.taux_km) || t.taux_km <= 0) continue
        await fetch("/api/rh/trajets-km", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "parametres",
            societe_id: societe,
            vehicule_type: t.vehicule_type,
            taux_km: t.taux_km,
            plafond_mensuel: plafondMensuel ? parseFloat(plafondMensuel) : null,
          }),
        })
      }
      setShowParams(false)
      loadParams()
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingParams(false)
    }
  }

  const validerTrajet = async (trajetId: string, statut: string) => {
    try {
      await fetch("/api/rh/trajets-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "valider", trajet_id: trajetId, statut }),
      })
      load()
    } catch (e) {
      console.error(e)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const currentParamVoiture = parametres.find(p => p.vehicule_type === "voiture")
  const currentParamMoto = parametres.find(p => p.vehicule_type === "moto")
  const currentParamVelo = parametres.find(p => p.vehicule_type === "velo")

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Route className="h-6 w-6" style={{ color: GOLD }} />
            Indemnités Kilométriques
          </h1>
          <p className="text-gray-500 text-sm">Suivi GPS des trajets et calcul automatique des indemnités</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sélectionner une société" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">-- Sélectionner --</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-[150px]" />
          <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-[150px]" />
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="en_cours">En cours</SelectItem>
              <SelectItem value="termine">A valider</SelectItem>
              <SelectItem value="valide">Validé</SelectItem>
              <SelectItem value="rejete">Rejeté</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {societe === "all" && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Route className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Veuillez sélectionner une société</p>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-2" style={{ borderColor: BLUE }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Route className="h-4 w-4" /> Total km (période)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmtKm(stats.total_km)}</p>
              </CardContent>
            </Card>

            <Card className="border-2" style={{ borderColor: GOLD }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Total indemnités
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(stats.total_indemnite)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Nb trajets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{stats.nb_trajets}</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowParams(true)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Taux / km
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Car className="h-3 w-3" />
                  <span>Voiture: {currentParamVoiture ? `${currentParamVoiture.taux_km} Rs/km` : "Non défini"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Bike className="h-3 w-3" />
                  <span>Moto: {currentParamMoto ? `${currentParamMoto.taux_km} Rs/km` : "Non défini"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Cliquer pour modifier</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table of trajets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg" style={{ color: NAVY }}>Trajets</CardTitle>
            </CardHeader>
            <CardContent>
              {trajets.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Aucun trajet pour cette période</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employé</TableHead>
                        <TableHead>Véhicule</TableHead>
                        <TableHead>Départ</TableHead>
                        <TableHead>Arrivée</TableHead>
                        <TableHead className="text-right">Distance</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trajets.map(t => {
                        const VehiculeIcon = VEHICULE_ICONS[t.vehicule_type] || Car
                        return (
                          <TableRow key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedTrajet(t)}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(t.date_depart)}</TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{t.employe_prenom} {t.employe_nom}</div>
                              <div className="text-xs text-gray-400">{t.employe_poste}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <VehiculeIcon className="h-3 w-3" />
                                {VEHICULE_LABELS[t.vehicule_type] || t.vehicule_type}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 max-w-[140px] truncate">{t.adresse_depart || "—"}</TableCell>
                            <TableCell className="text-sm text-gray-600 max-w-[140px] truncate">{t.adresse_arrivee || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmtKm(t.distance_km)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{fmt(t.indemnite)}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${STATUT_COLORS[t.statut] || ""}`}>
                                {STATUT_LABELS[t.statut] || t.statut}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              {t.statut === "termine" && (
                                <div className="flex items-center gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => validerTrajet(t.id, "valide")}
                                    title="Valider"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => validerTrajet(t.id, "rejete")}
                                    title="Rejeter"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {t.statut === "valide" && (
                                <span className="text-green-600 text-xs font-medium">Validé</span>
                              )}
                              {t.statut === "rejete" && (
                                <span className="text-red-500 text-xs font-medium">Rejeté</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Parametres Dialog */}
      <Dialog open={showParams} onOpenChange={setShowParams}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: NAVY }}>
              <Settings className="h-5 w-5" style={{ color: GOLD }} />
              Paramètres kilométriques
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Car className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm">Taux voiture (Rs/km)</Label>
                  <Input type="number" step="0.01" value={paramVoiture} onChange={e => setParamVoiture(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm">Taux moto (Rs/km)</Label>
                  <Input type="number" step="0.01" value={paramMoto} onChange={e => setParamMoto(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm">Taux vélo (Rs/km)</Label>
                  <Input type="number" step="0.01" value={paramVelo} onChange={e => setParamVelo(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <Label className="text-sm">Plafond mensuel (Rs) — optionnel</Label>
              <Input
                type="number"
                step="100"
                placeholder="Ex: 5000"
                value={plafondMensuel}
                onChange={e => setPlafondMensuel(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Montant maximum remboursable par mois et par employé</p>
            </div>
            <Button
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
              onClick={saveParametres}
              disabled={savingParams}
            >
              {savingParams ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Enregistrer les paramètres
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTrajet} onOpenChange={open => !open && setSelectedTrajet(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: NAVY }}>
              <Navigation className="h-5 w-5" style={{ color: BLUE }} />
              Détail du trajet
            </DialogTitle>
          </DialogHeader>
          {selectedTrajet && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Employé</span>
                  <p className="font-medium">{selectedTrajet.employe_prenom} {selectedTrajet.employe_nom}</p>
                </div>
                <div>
                  <span className="text-gray-500">Véhicule</span>
                  <p className="font-medium">{VEHICULE_LABELS[selectedTrajet.vehicule_type] || selectedTrajet.vehicule_type}</p>
                </div>
                <div>
                  <span className="text-gray-500">Départ</span>
                  <p className="font-medium">{formatDate(selectedTrajet.date_depart)}</p>
                  <p className="text-xs text-gray-400">{selectedTrajet.adresse_depart || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Arrivée</span>
                  <p className="font-medium">{formatDate(selectedTrajet.date_arrivee)}</p>
                  <p className="text-xs text-gray-400">{selectedTrajet.adresse_arrivee || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Distance</span>
                  <p className="text-lg font-bold" style={{ color: BLUE }}>{fmtKm(selectedTrajet.distance_km)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Indemnité</span>
                  <p className="text-lg font-bold" style={{ color: GOLD }}>{fmt(selectedTrajet.indemnite)}</p>
                  <p className="text-xs text-gray-400">Taux: {selectedTrajet.taux_km} Rs/km</p>
                </div>
              </div>

              {/* Steps */}
              {selectedTrajet.steps && selectedTrajet.steps.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>Étapes GPS ({selectedTrajet.steps.length})</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {selectedTrajet.steps.map((step: any, idx: number) => (
                      <div key={step.id || idx} className="flex items-center gap-3 text-xs">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: idx === 0 ? "#22c55e" : idx === selectedTrajet.steps.length - 1 ? "#ef4444" : BLUE }}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-700">{step.adresse || `${step.latitude?.toFixed(4)}, ${step.longitude?.toFixed(4)}`}</p>
                          <p className="text-gray-400">{step.timestamp ? new Date(step.timestamp).toLocaleTimeString("fr-FR") : ""}</p>
                        </div>
                        <span className="font-mono text-gray-500">
                          {step.distance_depuis_precedent > 0 ? `+${step.distance_depuis_precedent.toFixed(1)} km` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {selectedTrajet.statut === "termine" && (
                <div className="flex gap-2 border-t pt-3">
                  <Button
                    className="flex-1 text-white"
                    style={{ backgroundColor: "#22c55e" }}
                    onClick={() => { validerTrajet(selectedTrajet.id, "valide"); setSelectedTrajet(null) }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" /> Valider
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => { validerTrajet(selectedTrajet.id, "rejete"); setSelectedTrajet(null) }}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Rejeter
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
