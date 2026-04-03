"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  FileText,
  CreditCard,
  Users,
  Archive,
  Loader2,
  Info,
  ShieldAlert,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface AlertItem {
  id: string
  type: "urgent" | "attention" | "info"
  titre: string
  description: string
  montant: number | null
  echeance: string | null
  action_requise: string
  // local-only state
  lue: boolean
  archivee: boolean
}

function getAlertIcon(type: string) {
  switch (type) {
    case "urgent":
      return <ShieldAlert className="h-5 w-5 text-red-500" />
    case "attention":
      return <AlertTriangle className="h-5 w-5 text-orange-500" />
    case "info":
      return <Info className="h-5 w-5 text-blue-500" />
    default:
      return <Bell className="h-5 w-5 text-gray-500" />
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case "urgent":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Urgent</Badge>
    case "attention":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Attention requise</Badge>
    case "info":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Info</Badge>
    default:
      return <Badge variant="secondary">{type}</Badge>
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

export default function AlertesPage() {
  const { profile } = useProfile()
  const [filter, setFilter] = useState("toutes")
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/client/alertes")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.alertes)) {
            setAlerts(
              data.alertes.map((a: any) => ({
                ...a,
                lue: false,
                archivee: false,
              }))
            )
          }
        }
      } catch {
        // API not available -- leave empty
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
  }, [])

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#0B0F2E" }}>
          Acces non autorise
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#D4AF37" }}>
          Retour a l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  const filteredAlerts = alerts.filter((a) => {
    switch (filter) {
      case "non_lues":
        return !a.lue && !a.archivee
      case "urgent":
        return a.type === "urgent" && !a.archivee
      case "attention":
        return a.type === "attention" && !a.archivee
      case "info":
        return a.type === "info" && !a.archivee
      case "archives":
        return a.archivee
      default:
        return !a.archivee
    }
  })

  const nonLuesCount = alerts.filter((a) => !a.lue && !a.archivee).length
  const urgentCount = alerts.filter((a) => a.type === "urgent" && !a.archivee).length
  const attentionCount = alerts.filter((a) => a.type === "attention" && !a.archivee).length
  const infoCount = alerts.filter((a) => a.type === "info" && !a.archivee).length

  function markAsRead(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, lue: true } : a)))
  }

  function archiveAlert(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, archivee: true, lue: true } : a)))
  }

  // Group alerts by type for grouped display
  const urgentAlerts = filteredAlerts.filter((a) => a.type === "urgent")
  const attentionAlerts = filteredAlerts.filter((a) => a.type === "attention")
  const infoAlerts = filteredAlerts.filter((a) => a.type === "info")

  const showGrouped = filter === "toutes" || filter === "non_lues"

  function renderAlertCard(alert: AlertItem) {
    return (
      <Card
        key={alert.id}
        className={`transition-colors ${!alert.lue ? "border-l-4" : ""}`}
        style={
          !alert.lue
            ? { borderLeftColor: alert.type === "urgent" ? "#EF4444" : alert.type === "attention" ? "#F97316" : "#3B82F6" }
            : {}
        }
      >
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
              {getAlertIcon(alert.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3
                  className={`text-sm ${!alert.lue ? "font-bold" : "font-medium"}`}
                  style={{ color: "#0B0F2E" }}
                >
                  {alert.titre}
                </h3>
                {getTypeBadge(alert.type)}
                {!alert.lue && (
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{alert.description}</p>
              {alert.montant !== null && (
                <p className="text-sm font-semibold mt-1" style={{ color: "#0B0F2E" }}>
                  Montant: {formatMUR(alert.montant)}
                </p>
              )}
              {alert.echeance && (
                <p className="text-xs text-muted-foreground mt-1">
                  Echeance: {formatDate(alert.echeance)}
                </p>
              )}
              <p className="text-xs mt-2 font-medium" style={{ color: "#D4AF37" }}>
                {alert.action_requise}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {!alert.lue && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAsRead(alert.id)}
                >
                  Marquer comme lu
                </Button>
              )}
              {!alert.archivee && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => archiveAlert(alert.id)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  function renderGroupedAlerts(title: string, items: AlertItem[], color: string) {
    if (items.length === 0) return null
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color }}>
          {title} ({items.length})
        </h2>
        {items.map(renderAlertCard)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
          Mes Alertes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Restez informe de tout ce qui concerne votre comptabilite.
        </p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="toutes">
            Toutes
          </TabsTrigger>
          <TabsTrigger value="non_lues">
            Non lues ({nonLuesCount})
          </TabsTrigger>
          <TabsTrigger value="urgent">
            Urgent ({urgentCount})
          </TabsTrigger>
          <TabsTrigger value="attention">
            Attention ({attentionCount})
          </TabsTrigger>
          <TabsTrigger value="info">
            Info ({infoCount})
          </TabsTrigger>
          <TabsTrigger value="archives">
            Archives
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-6">
        {showGrouped ? (
          <>
            {renderGroupedAlerts("Urgent", urgentAlerts, "#EF4444")}
            {renderGroupedAlerts("Attention requise", attentionAlerts, "#F97316")}
            {renderGroupedAlerts("Information", infoAlerts, "#3B82F6")}
            {filteredAlerts.length === 0 && (
              <div className="text-center py-12">
                <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">Aucune alerte pour le moment.</p>
              </div>
            )}
          </>
        ) : (
          <>
            {filteredAlerts.map(renderAlertCard)}
            {filteredAlerts.length === 0 && (
              <div className="text-center py-12">
                <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">Aucune alerte pour le moment.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
