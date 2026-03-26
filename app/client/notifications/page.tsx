"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MessageSquare, Mail, Bell, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

interface NotificationItem {
  id: string
  type: "whatsapp" | "email"
  message: string
  date: string
  statut: "pending" | "sent" | "failed"
}

const mockNotifications: NotificationItem[] = [
  {
    id: "1",
    type: "whatsapp",
    message: "Rappel : Votre déclaration TVA pour TIBOK (Mars 2026) est due le 20 avril 2026.",
    date: "2026-03-25T09:15:00",
    statut: "sent",
  },
  {
    id: "2",
    type: "whatsapp",
    message: "Nouveau document traité : facture_achats_mars_2026.pdf a été classé comme Facture fournisseur.",
    date: "2026-03-24T16:30:00",
    statut: "sent",
  },
  {
    id: "3",
    type: "email",
    message: "Votre rapport mensuel de février 2026 est disponible. Connectez-vous pour le consulter.",
    date: "2026-03-24T10:00:00",
    statut: "sent",
  },
  {
    id: "4",
    type: "whatsapp",
    message: "Erreur de traitement sur le document facture_electricite.png. Veuillez le renvoyer en meilleure qualité.",
    date: "2026-03-23T14:45:00",
    statut: "sent",
  },
  {
    id: "5",
    type: "email",
    message: "Confirmation de paiement TVA pour TIBOK - Février 2026. Montant : 37 000 MUR.",
    date: "2026-03-22T11:20:00",
    statut: "sent",
  },
  {
    id: "6",
    type: "whatsapp",
    message: "URGENT : La déclaration TVA de BPO (Décembre 2025) est en retard. Pénalité applicable : 2 500 MUR.",
    date: "2026-03-21T08:00:00",
    statut: "sent",
  },
  {
    id: "7",
    type: "email",
    message: "Rappel de soumission des fiches de paie de mars 2026 pour toutes vos sociétés.",
    date: "2026-03-20T09:00:00",
    statut: "failed",
  },
  {
    id: "8",
    type: "whatsapp",
    message: "3 nouveaux documents ont été traités avec succès pour la société TIBOK.",
    date: "2026-03-19T15:10:00",
    statut: "sent",
  },
  {
    id: "9",
    type: "email",
    message: "Votre comptable Sophie Ramgoolam a validé les écritures comptables de février 2026.",
    date: "2026-03-18T13:30:00",
    statut: "pending",
  },
  {
    id: "10",
    type: "whatsapp",
    message: "Nouveau relevé bancaire détecté pour BPO. Rapprochement bancaire en cours.",
    date: "2026-03-17T10:45:00",
    statut: "sent",
  },
  {
    id: "11",
    type: "email",
    message: "Résumé hebdomadaire : 5 documents traités, 1 en attente, 0 erreurs cette semaine.",
    date: "2026-03-16T08:00:00",
    statut: "sent",
  },
  {
    id: "12",
    type: "whatsapp",
    message: "Rappel : Veuillez soumettre vos justificatifs de charges sociales Q1 2026 avant le 31 mars.",
    date: "2026-03-15T09:30:00",
    statut: "pending",
  },
]

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "sent":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Envoyé
        </Badge>
      )
    case "pending":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          <Clock className="h-3 w-3 mr-1" />
          En attente
        </Badge>
      )
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          Échoué
        </Badge>
      )
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

function getTypeIcon(type: "whatsapp" | "email") {
  if (type === "whatsapp") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
        <MessageSquare className="h-5 w-5 text-green-600" />
      </div>
    )
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
      <Mail className="h-5 w-5 text-blue-600" />
    </div>
  )
}

export default function NotificationsPage() {
  const { profile } = useProfile()
  const [filter, setFilter] = useState("tous")

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  const filteredNotifications = mockNotifications.filter((n) => {
    if (filter === "tous") return true
    return n.type === filter
  })

  const totalCount = mockNotifications.length
  const whatsappCount = mockNotifications.filter((n) => n.type === "whatsapp").length
  const emailCount = mockNotifications.filter((n) => n.type === "email").length
  const pendingCount = mockNotifications.filter((n) => n.statut === "pending").length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Notifications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historique de vos notifications WhatsApp et email.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total notifications
            </CardTitle>
            <Bell className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {totalCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              WhatsApp
            </CardTitle>
            <MessageSquare className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {whatsappCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Email
            </CardTitle>
            <Mail className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {emailCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              En attente
            </CardTitle>
            <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
              {pendingCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle style={{ color: "#1E2A4A" }}>Toutes les notifications</CardTitle>
              <CardDescription>Filtrez par type de notification</CardDescription>
            </div>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="tous">
                  Tous ({totalCount})
                </TabsTrigger>
                <TabsTrigger value="whatsapp">
                  WhatsApp ({whatsappCount})
                </TabsTrigger>
                <TabsTrigger value="email">
                  Email ({emailCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-4 rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50"
              >
                {getTypeIcon(notification.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatDateTime(notification.date)}
                  </p>
                </div>
                <div className="shrink-0">
                  {getStatutBadge(notification.statut)}
                </div>
              </div>
            ))}
            {filteredNotifications.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Aucune notification trouvée.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
