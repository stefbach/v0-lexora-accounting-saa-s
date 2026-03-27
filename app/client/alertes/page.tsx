"use client"

import { useState } from "react"
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
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface AlertItem {
  id: string
  titre: string
  message: string
  date: string
  type: "urgente" | "info" | "action" | "rappel"
  lue: boolean
  archivee: boolean
  icon: "alert" | "file" | "payment" | "team" | "clock" | "check"
}

const mockAlerts: AlertItem[] = [
  {
    id: "1",
    titre: "Déclaration TVA en retard",
    message: "La déclaration TVA de décembre 2025 pour BPO n'a pas encore été soumise. Une pénalité de 2 500 MUR peut s'appliquer.",
    date: "2026-03-25T09:00:00",
    type: "urgente",
    lue: false,
    archivee: false,
    icon: "alert",
  },
  {
    id: "2",
    titre: "Document à renvoyer",
    message: "Le fichier facture_electricite.png est illisible. Merci de le scanner à nouveau en meilleure qualité.",
    date: "2026-03-24T14:30:00",
    type: "action",
    lue: false,
    archivee: false,
    icon: "file",
  },
  {
    id: "3",
    titre: "Paiement TVA à effectuer",
    message: "Vous devez payer 77 250 MUR de TVA pour mars 2026 avant le 20 avril 2026.",
    date: "2026-03-24T10:00:00",
    type: "urgente",
    lue: false,
    archivee: false,
    icon: "payment",
  },
  {
    id: "4",
    titre: "Fiches de paie prêtes",
    message: "Les fiches de paie de mars 2026 sont disponibles pour vos 5 employés. Vous pouvez les consulter dans la section Salaires.",
    date: "2026-03-23T16:00:00",
    type: "info",
    lue: false,
    archivee: false,
    icon: "team",
  },
  {
    id: "5",
    titre: "Rappel : charges sociales Q1",
    message: "N'oubliez pas de soumettre vos justificatifs de charges sociales du premier trimestre 2026 avant le 31 mars.",
    date: "2026-03-22T09:00:00",
    type: "rappel",
    lue: true,
    archivee: false,
    icon: "clock",
  },
  {
    id: "6",
    titre: "Rapport mensuel disponible",
    message: "Votre rapport financier de février 2026 est prêt. Connectez-vous pour le consulter.",
    date: "2026-03-20T11:00:00",
    type: "info",
    lue: true,
    archivee: false,
    icon: "check",
  },
  {
    id: "7",
    titre: "Nouveau document traité",
    message: "3 documents envoyés le 19 mars ont été traités avec succès et classés automatiquement.",
    date: "2026-03-19T15:30:00",
    type: "info",
    lue: true,
    archivee: true,
    icon: "file",
  },
  {
    id: "8",
    titre: "Bienvenue sur Lexora",
    message: "Votre compte est configuré. Commencez par envoyer vos premiers documents dans la section Envoi.",
    date: "2026-03-01T08:00:00",
    type: "info",
    lue: true,
    archivee: true,
    icon: "check",
  },
]

function getAlertIcon(icon: string) {
  switch (icon) {
    case "alert":
      return <AlertTriangle className="h-5 w-5 text-red-500" />
    case "file":
      return <FileText className="h-5 w-5 text-blue-500" />
    case "payment":
      return <CreditCard className="h-5 w-5 text-orange-500" />
    case "team":
      return <Users className="h-5 w-5" style={{ color: "#1E2A4A" }} />
    case "clock":
      return <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
    case "check":
      return <CheckCircle className="h-5 w-5 text-green-500" />
    default:
      return <Bell className="h-5 w-5 text-gray-500" />
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case "urgente":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Urgent</Badge>
    case "action":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Action requise</Badge>
    case "rappel":
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Rappel</Badge>
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
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AlertesPage() {
  const { profile } = useProfile()
  const [filter, setFilter] = useState("toutes")
  const [alerts, setAlerts] = useState(mockAlerts)

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour à l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  const filteredAlerts = alerts.filter((a) => {
    switch (filter) {
      case "non_lues":
        return !a.lue && !a.archivee
      case "urgentes":
        return a.type === "urgente" && !a.archivee
      case "archives":
        return a.archivee
      default:
        return !a.archivee
    }
  })

  const nonLuesCount = alerts.filter((a) => !a.lue && !a.archivee).length
  const urgentesCount = alerts.filter((a) => a.type === "urgente" && !a.archivee).length

  function markAsRead(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, lue: true } : a)))
  }

  function archiveAlert(id: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, archivee: true, lue: true } : a)))
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Alertes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Restez informé de tout ce qui concerne votre comptabilité.
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
          <TabsTrigger value="urgentes">
            Urgentes ({urgentesCount})
          </TabsTrigger>
          <TabsTrigger value="archives">
            Archives
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {filteredAlerts.map((alert) => (
          <Card
            key={alert.id}
            className={`transition-colors ${!alert.lue ? "border-l-4" : ""}`}
            style={!alert.lue ? { borderLeftColor: alert.type === "urgente" ? "#EF4444" : "#C9A84C" } : {}}
          >
            <CardContent className="py-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  {getAlertIcon(alert.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className={`text-sm ${!alert.lue ? "font-bold" : "font-medium"}`}
                      style={{ color: "#1E2A4A" }}
                    >
                      {alert.titre}
                    </h3>
                    {getTypeBadge(alert.type)}
                    {!alert.lue && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formatDate(alert.date)}</p>
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
        ))}
        {filteredAlerts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Aucune alerte dans cette catégorie.
          </div>
        )}
      </div>
    </div>
  )
}
