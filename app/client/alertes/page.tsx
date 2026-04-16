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
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientPanel, ClientEmpty } from "@/components/client/ClientKit"

const FONT = "'Poppins', sans-serif"

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
      <ClientPageShell
        breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Alertes" }]}
        title="Accès non autorisé"
        subtitle="Vous n'avez pas la permission d'accéder à cette page."
      >
        <ClientEmpty
          icon={ShieldAlert}
          title="Accès réservé"
          description="Cette section est visible pour les administrateurs et utilisateurs avancés uniquement."
          accent="orange"
          action={
            <Link
              href="/client"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                color: "#0B0F2E",
                fontWeight: 700,
                fontSize: "13px",
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              Retour au tableau de bord
            </Link>
          }
        />
      </ClientPageShell>
    )
  }

  if (loading) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div style={{ display: "flex", justifyContent: "center", padding: "120px 0" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
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

  const totalCount = alerts.filter((a) => !a.archivee).length

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Alertes" }]}
      kicker={`${totalCount} ${totalCount > 1 ? "alertes actives" : "alerte active"}`}
      title="Mes alertes"
      subtitle="Restez informé de tout ce qui concerne votre comptabilité — échéances, impayés, documents manquants, points de vigilance."
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <ClientPanel padded={false}>
          <div style={{ padding: "14px 18px" }}>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList style={{ background: "transparent", padding: 0, gap: "4px", flexWrap: "wrap" }}>
                <TabsTrigger value="toutes">Toutes</TabsTrigger>
                <TabsTrigger value="non_lues">Non lues ({nonLuesCount})</TabsTrigger>
                <TabsTrigger value="urgent">Urgent ({urgentCount})</TabsTrigger>
                <TabsTrigger value="attention">Attention ({attentionCount})</TabsTrigger>
                <TabsTrigger value="info">Info ({infoCount})</TabsTrigger>
                <TabsTrigger value="archives">Archives</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </ClientPanel>

        <div style={{ display: "grid", gap: "16px" }}>
          {showGrouped ? (
            <>
              {renderGroupedAlerts("Urgent", urgentAlerts, "#EF4444")}
              {renderGroupedAlerts("Attention requise", attentionAlerts, "#F97316")}
              {renderGroupedAlerts("Information", infoAlerts, "#3B82F6")}
              {filteredAlerts.length === 0 && (
                <ClientEmpty
                  icon={Bell}
                  title="Aucune alerte"
                  description="Tout est sous contrôle. Les nouvelles alertes apparaîtront ici dès que votre comptable en créera."
                  accent="green"
                />
              )}
            </>
          ) : (
            <>
              {filteredAlerts.length > 0 && (
                <div style={{ display: "grid", gap: "10px" }}>
                  {filteredAlerts.map(renderAlertCard)}
                </div>
              )}
              {filteredAlerts.length === 0 && (
                <ClientEmpty
                  icon={Bell}
                  title="Aucune alerte"
                  description="Aucune alerte ne correspond à ce filtre."
                  accent="blue"
                />
              )}
            </>
          )}
        </div>
      </div>
    </ClientPageShell>
  )
}
