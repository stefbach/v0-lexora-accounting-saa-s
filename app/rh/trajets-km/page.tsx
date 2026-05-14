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
import { t, getLocale, type Locale } from "@/lib/i18n"

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
function getStatutLabels(locale: Locale): Record<string, string> {
  return {
    en_cours: t('rha.b.trajets.status_in_progress', locale),
    termine: t('rha.b.trajets.status_to_validate', locale),
    valide: t('rha.b.trajets.status_validated', locale),
    rejete: t('rha.b.trajets.status_rejected', locale),
  }
}

const VEHICULE_ICONS: Record<string, any> = {
  voiture: Car,
  moto: Bike,
  velo: Bike,
}

function getVehiculeLabels(locale: Locale): Record<string, string> {
  return {
    voiture: t('rha.b.trajets.car', locale),
    moto: t('rha.b.trajets.moto', locale),
    velo: t('rha.b.trajets.bike', locale),
  }
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
  const locale: Locale = getLocale()
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

  // Load parametres when société changes.
  // Sprint 11 BUG 6 — parametres_km (mig 113) a UNE ligne par société avec
  // 3 colonnes taux_voiture / taux_moto / taux_velo + plafond_mensuel.
  // L'ancien code lisait un array et le matchait sur vehicule_type, ce qui
  // ne correspondait à rien : le pré-remplissage était toujours vide.
  const loadParams = useCallback(async () => {
    if (societe === "all") return
    try {
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parametres", societe_id: societe, mode: "get" }),
      })
      const data = await res.json()
      const row = data.parametres || null
      setParametres(row ? [row] : [])
      if (row) {
        if (row.taux_voiture != null) setParamVoiture(String(row.taux_voiture))
        if (row.taux_moto != null) setParamMoto(String(row.taux_moto))
        if (row.taux_velo != null) setParamVelo(String(row.taux_velo))
        if (row.plafond_mensuel != null) setPlafondMensuel(String(row.plafond_mensuel))
      }
    } catch (e) {
      console.error(e)
    }
  }, [societe])

  useEffect(() => { loadParams() }, [loadParams])

  const saveParametres = async () => {
    // Sprint 11 BUG 6 — un SEUL POST qui porte les 3 taux + plafond.
    // Avant : la boucle envoyait {vehicule_type, taux_km} — champs ignorés
    // par l'API qui attend taux_voiture/taux_moto/taux_velo → l'upsert ne
    // touchait qu'updated_at et les paramètres ne se sauvegardaient pas.
    setSavingParams(true)
    try {
      const tauxVoiture = parseFloat(paramVoiture)
      const tauxMoto = parseFloat(paramMoto)
      const tauxVelo = parseFloat(paramVelo)
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parametres",
          societe_id: societe,
          taux_voiture: !isNaN(tauxVoiture) && tauxVoiture > 0 ? tauxVoiture : undefined,
          taux_moto: !isNaN(tauxMoto) && tauxMoto > 0 ? tauxMoto : undefined,
          taux_velo: !isNaN(tauxVelo) && tauxVelo >= 0 ? tauxVelo : undefined,
          plafond_mensuel: plafondMensuel ? parseFloat(plafondMensuel) : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
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
            {t('rha.b.trajets.title', locale)}
          </h1>
          <p className="text-gray-500 text-sm">{t('rha.b.trajets.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('rha.b.trajets.select_societe', locale)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rha.b.trajets.select_dash', locale)}</SelectItem>
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
              <SelectItem value="all">{t('rha.b.trajets.all_status', locale)}</SelectItem>
              <SelectItem value="en_cours">{t('rha.b.trajets.status_in_progress', locale)}</SelectItem>
              <SelectItem value="termine">{t('rha.b.trajets.status_to_validate', locale)}</SelectItem>
              <SelectItem value="valide">{t('rha.b.trajets.status_validated', locale)}</SelectItem>
              <SelectItem value="rejete">{t('rha.b.trajets.status_rejected', locale)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {societe === "all" && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Route className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>{t('rha.b.trajets.please_select', locale)}</p>
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
                  <Route className="h-4 w-4" /> {t('rha.b.trajets.kpi_total_km', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmtKm(stats.total_km)}</p>
              </CardContent>
            </Card>

            <Card className="border-2" style={{ borderColor: GOLD }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> {t('rha.b.trajets.kpi_total_amount', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(stats.total_indemnite)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> {t('rha.b.trajets.kpi_nb_trips', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{stats.nb_trajets}</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowParams(true)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Settings className="h-4 w-4" /> {t('rha.b.trajets.kpi_rate_per_km', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Car className="h-3 w-3" />
                  <span>{t('rha.b.trajets.car', locale)}: {currentParamVoiture ? `${currentParamVoiture.taux_km} Rs/km` : t('rha.b.trajets.not_set', locale)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Bike className="h-3 w-3" />
                  <span>{t('rha.b.trajets.moto', locale)}: {currentParamMoto ? `${currentParamMoto.taux_km} Rs/km` : t('rha.b.trajets.not_set', locale)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{t('rha.b.trajets.click_edit', locale)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table of trajets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('rha.b.trajets.section_trips', locale)}</CardTitle>
            </CardHeader>
            <CardContent>
              {trajets.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">{t('rha.b.trajets.no_trips', locale)}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rha.b.trajets.col_date', locale)}</TableHead>
                        <TableHead>{t('rha.b.trajets.col_employee', locale)}</TableHead>
                        <TableHead>{t('rha.b.trajets.col_vehicle', locale)}</TableHead>
                        <TableHead>{t('rha.b.trajets.col_from', locale)}</TableHead>
                        <TableHead>{t('rha.b.trajets.col_to', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.trajets.col_distance', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.trajets.col_amount', locale)}</TableHead>
                        <TableHead>{t('rha.b.trajets.col_status', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.trajets.col_actions', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trajets.map(tr => {
                        const VehiculeIcon = VEHICULE_ICONS[tr.vehicule_type] || Car
                        const STATUT_LABELS = getStatutLabels(locale)
                        const VEHICULE_LABELS = getVehiculeLabels(locale)
                        return (
                          <TableRow key={tr.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedTrajet(tr)}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(tr.date_depart)}</TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{tr.employe_prenom} {tr.employe_nom}</div>
                              <div className="text-xs text-gray-400">{tr.employe_poste}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <VehiculeIcon className="h-3 w-3" />
                                {VEHICULE_LABELS[tr.vehicule_type] || tr.vehicule_type}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 max-w-[140px] truncate">{tr.adresse_depart || "—"}</TableCell>
                            <TableCell className="text-sm text-gray-600 max-w-[140px] truncate">{tr.adresse_arrivee || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmtKm(tr.distance_km)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">{fmt(tr.indemnite)}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${STATUT_COLORS[tr.statut] || ""}`}>
                                {STATUT_LABELS[tr.statut] || tr.statut}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              {tr.statut === "termine" && (
                                <div className="flex items-center gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => validerTrajet(tr.id, "valide")}
                                    title={t('rha.b.trajets.validate', locale)}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => validerTrajet(tr.id, "rejete")}
                                    title={t('rha.b.trajets.reject', locale)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {tr.statut === "valide" && (
                                <span className="text-green-600 text-xs font-medium">{t('rha.b.trajets.status_validated', locale)}</span>
                              )}
                              {tr.statut === "rejete" && (
                                <span className="text-red-500 text-xs font-medium">{t('rha.b.trajets.status_rejected', locale)}</span>
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
              {t('rha.b.trajets.params_title', locale)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Car className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm">{t('rha.b.trajets.rate_car', locale)}</Label>
                  <Input type="number" step="0.01" value={paramVoiture} onChange={e => setParamVoiture(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm">{t('rha.b.trajets.rate_moto', locale)}</Label>
                  <Input type="number" step="0.01" value={paramMoto} onChange={e => setParamMoto(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm flex items-center gap-1">
                    {t('rha.b.trajets.rate_bike', locale)}
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold cursor-help"
                      title="Remboursement kilométrique pour les employés venant travailler à vélo. Optionnel — généralement 2 à 3 Rs/km. Mettre 0 pour désactiver."
                    >
                      ?
                    </span>
                  </Label>
                  <Input type="number" step="0.01" value={paramVelo} onChange={e => setParamVelo(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t('rha.b.trajets.bike_hint', locale)}
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <Label className="text-sm">{t('rha.b.trajets.monthly_cap', locale)}</Label>
              <Input
                type="number"
                step="100"
                placeholder="Ex: 5000"
                value={plafondMensuel}
                onChange={e => setPlafondMensuel(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">{t('rha.b.trajets.monthly_cap_hint', locale)}</p>
            </div>
            <Button
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
              onClick={saveParametres}
              disabled={savingParams}
            >
              {savingParams ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('rha.b.trajets.save_params', locale)}
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
              {t('rha.b.trajets.detail_title', locale)}
            </DialogTitle>
          </DialogHeader>
          {selectedTrajet && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_employee', locale)}</span>
                  <p className="font-medium">{selectedTrajet.employe_prenom} {selectedTrajet.employe_nom}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_vehicle', locale)}</span>
                  <p className="font-medium">{getVehiculeLabels(locale)[selectedTrajet.vehicule_type] || selectedTrajet.vehicule_type}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_from', locale)}</span>
                  <p className="font-medium">{formatDate(selectedTrajet.date_depart)}</p>
                  <p className="text-xs text-gray-400">{selectedTrajet.adresse_depart || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_to', locale)}</span>
                  <p className="font-medium">{formatDate(selectedTrajet.date_arrivee)}</p>
                  <p className="text-xs text-gray-400">{selectedTrajet.adresse_arrivee || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_distance', locale)}</span>
                  <p className="text-lg font-bold" style={{ color: BLUE }}>{fmtKm(selectedTrajet.distance_km)}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('rha.b.trajets.lbl_amount', locale)}</span>
                  <p className="text-lg font-bold" style={{ color: GOLD }}>{fmt(selectedTrajet.indemnite)}</p>
                  <p className="text-xs text-gray-400">{t('rha.b.trajets.lbl_rate', locale).replace('{n}', String(selectedTrajet.taux_km))}</p>
                </div>
              </div>

              {/* Steps */}
              {selectedTrajet.steps && selectedTrajet.steps.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>{t('rha.b.trajets.steps', locale).replace('{n}', String(selectedTrajet.steps.length))}</p>
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
                    <CheckCircle className="h-4 w-4 mr-2" /> {t('rha.b.trajets.validate', locale)}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => { validerTrajet(selectedTrajet.id, "rejete"); setSelectedTrajet(null) }}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> {t('rha.b.trajets.reject', locale)}
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
