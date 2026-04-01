"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Bell, Calendar, Shield, Clock, CheckCircle, Loader2, RefreshCw, Search } from "lucide-react"

interface Alerte {
  id: string
  type: "fiscal" | "comptable" | "social"
  severity: "critical" | "warning" | "info"
  client_name: string
  societe_name: string
  societe_id: string
  title: string
  message: string
  deadline: string | null
  created_at: string
}

interface AlertesResponse {
  alertes: Alerte[]
  counts: { critical: number; warning: number; info: number }
}

const SEVERITY_CONFIG = {
  critical: {
    label: "Critique",
    bg: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
    cardBorder: "border-l-4 border-l-red-500",
  },
  warning: {
    label: "Avertissement",
    bg: "bg-orange-100 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
    cardBorder: "border-l-4 border-l-orange-400",
  },
  info: {
    label: "Information",
    bg: "bg-blue-100 text-blue-800 border-blue-200",
    dot: "bg-blue-500",
    cardBorder: "border-l-4 border-l-blue-400",
  },
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  fiscal: { label: "Fiscal", icon: Calendar },
  comptable: { label: "Comptable", icon: Shield },
  social: { label: "Social", icon: Bell },
}

function getSeverityIcon(severity: string) {
  if (severity === "critical") return <AlertTriangle className="h-5 w-5 text-red-500" />
  if (severity === "warning") return <Clock className="h-5 w-5 text-orange-500" />
  return <Bell className="h-5 w-5 text-blue-500" />
}

export default function ComptableAlertesPage() {
  const [data, setData] = useState<AlertesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Filters
  const [filterType, setFilterType] = useState<string>("all")
  const [filterSeverity, setFilterSeverity] = useState<string>("all")
  const [filterClient, setFilterClient] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const fetchAlertes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/comptable/alertes")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Erreur ${res.status}`)
      }
      const json: AlertesResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlertes()
    const interval = setInterval(fetchAlertes, 5 * 60 * 1000) // Auto-refresh every 5 minutes
    return () => clearInterval(interval)
  }, [fetchAlertes])

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id))
  }

  // Filtered alerts
  const filteredAlertes = useMemo(() => {
    if (!data) return []
    return data.alertes.filter(a => {
      if (dismissed.has(a.id)) return false
      if (filterType !== "all" && a.type !== filterType) return false
      if (filterSeverity !== "all" && a.severity !== filterSeverity) return false
      if (filterClient !== "all" && a.client_name !== filterClient) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !a.title.toLowerCase().includes(q) &&
          !a.message.toLowerCase().includes(q) &&
          !a.societe_name.toLowerCase().includes(q) &&
          !a.client_name.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [data, dismissed, filterType, filterSeverity, filterClient, searchQuery])

  // Group alerts by client
  const groupedByClient = useMemo(() => {
    const groups = new Map<string, Alerte[]>()
    for (const a of filteredAlertes) {
      const key = a.client_name
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(a)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredAlertes])

  // Unique client names for filter
  const clientNames = useMemo(() => {
    if (!data) return []
    return [...new Set(data.alertes.map(a => a.client_name))].sort()
  }, [data])

  // Live counts (exclude dismissed)
  const liveCounts = useMemo(() => {
    if (!data) return { critical: 0, warning: 0, info: 0 }
    const active = data.alertes.filter(a => !dismissed.has(a.id))
    return {
      critical: active.filter(a => a.severity === "critical").length,
      warning: active.filter(a => a.severity === "warning").length,
      info: active.filter(a => a.severity === "info").length,
    }
  }, [data, dismissed])

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Alertes & Surveillance
          </h1>
          <p className="text-muted-foreground">
            Surveillance proactive des obligations fiscales, anomalies comptables et obligations sociales
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAlertes}
          disabled={loading}
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-red-600">{liveCounts.critical}</div>
                <p className="text-sm text-muted-foreground">Alertes critiques</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-orange-600">{liveCounts.warning}</div>
                <p className="text-sm text-muted-foreground">Avertissements</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-blue-600">{liveCounts.info}</div>
                <p className="text-sm text-muted-foreground">Informations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une alerte..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="fiscal">Fiscal</SelectItem>
                <SelectItem value="comptable">Comptable</SelectItem>
                <SelectItem value="social">Social</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Severite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes severites</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
                <SelectItem value="warning">Avertissement</SelectItem>
                <SelectItem value="info">Information</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les clients</SelectItem>
                {clientNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="font-medium">Analyse des obligations en cours...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAlertes.length === 0 && data && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <p className="font-medium text-base">Aucune alerte</p>
          <p className="text-sm">
            {dismissed.size > 0
              ? `${dismissed.size} alerte(s) traitee(s). Toutes les obligations sont en ordre.`
              : "Toutes les obligations fiscales, comptables et sociales sont en ordre."
            }
          </p>
        </div>
      )}

      {/* Alerts grouped by client */}
      {groupedByClient.map(([clientName, alerts]) => (
        <Card key={clientName}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg" style={{ color: "#1E2A4A" }}>
              <Shield className="h-5 w-5" style={{ color: "#C9A84C" }} />
              {clientName}
              <Badge variant="outline" className="ml-2">
                {alerts.length} alerte{alerts.length > 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map(alert => {
              const sevConfig = SEVERITY_CONFIG[alert.severity]
              const typeConfig = TYPE_CONFIG[alert.type]
              const TypeIcon = typeConfig?.icon || Bell

              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-4 ${sevConfig.cardBorder}`}
                >
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className={sevConfig.bg}>
                          {sevConfig.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {typeConfig?.label || alert.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {alert.societe_name}
                        </span>
                        {alert.deadline && (
                          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Echeance: {alert.deadline}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-sm" style={{ color: "#1E2A4A" }}>
                        {alert.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {alert.message}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDismiss(alert.id)}
                      className="shrink-0 text-xs gap-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Marquer comme traite
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Footer info */}
      {data && filteredAlertes.length > 0 && (
        <p className="text-xs text-center text-muted-foreground">
          Actualisation automatique toutes les 5 minutes. Derniere analyse: {new Date().toLocaleTimeString("fr-FR")}
        </p>
      )}
    </div>
  )
}
