"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Bell, Calendar, MessageSquare, Mail, CheckCircle, XCircle, BellOff } from "lucide-react"

interface Alert {
  id: string
  type: string
  priority: string
  message: string
  client: string
  date: string
  statut: string
}

interface Notification {
  id: string
  type: string
  destinataire: string
  message: string
  date: string
  statut: string
}

function getPriorityBadge(priority: string) {
  if (priority === "haute") return <Badge className="bg-red-100 text-red-800">Haute</Badge>
  if (priority === "moyenne") return <Badge className="bg-orange-100 text-orange-800">Moyenne</Badge>
  return <Badge className="bg-gray-100 text-gray-800">Basse</Badge>
}

function getAlertIcon(type: string) {
  if (type.includes("tva")) return <Calendar className="h-5 w-5 text-red-500" />
  if (type.includes("erreur")) return <XCircle className="h-5 w-5 text-red-500" />
  if (type.includes("ecart")) return <AlertTriangle className="h-5 w-5 text-orange-500" />
  return <CheckCircle className="h-5 w-5 text-green-500" />
}

export default function ComptableAlertesPage() {
  const alerts: Alert[] = []
  const notifications: Notification[] = []

  const activeAlerts = alerts.filter((a) => a.statut === "active")

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Alertes</h1>
        <p className="text-muted-foreground">Alertes et historique des notifications</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bell className="h-8 w-8 text-red-500" /><div><div className="text-2xl font-bold">{activeAlerts.length}</div><p className="text-sm text-muted-foreground">Alertes actives</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-orange-500" /><div><div className="text-2xl font-bold">{activeAlerts.filter((a) => a.priority === "haute").length}</div><p className="text-sm text-muted-foreground">Priorité haute</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><MessageSquare className="h-8 w-8 text-green-500" /><div><div className="text-2xl font-bold">{notifications.length}</div><p className="text-sm text-muted-foreground">Notifications envoyées</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="alertes">
        <TabsList>
          <TabsTrigger value="alertes">Alertes ({activeAlerts.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="alertes" className="space-y-3 mt-4">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <BellOff className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucune alerte</p>
              <p className="text-sm">Les alertes fiscales et comptables apparaîtront ici automatiquement.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <Card key={alert.id} className={alert.statut === "resolue" ? "opacity-60" : ""}>
                <CardContent className="flex items-start gap-4 py-4">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getPriorityBadge(alert.priority)}
                      {alert.statut === "resolue" && <Badge variant="outline" className="bg-green-50 text-green-700">Résolue</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto">{alert.date}</span>
                    </div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-muted-foreground">Client : {alert.client}</p>
                  </div>
                  {alert.statut === "active" && (
                    <Button variant="outline" size="sm">Marquer résolue</Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="historique" className="space-y-3 mt-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Mail className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucune notification envoyée</p>
              <p className="text-sm">L&apos;historique des notifications WhatsApp et email apparaîtra ici.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <Card key={notif.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  {notif.type === "whatsapp" ? (
                    <MessageSquare className="h-5 w-5 text-green-500" />
                  ) : (
                    <Mail className="h-5 w-5 text-blue-500" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{notif.message}</p>
                    <p className="text-sm text-muted-foreground">À : {notif.destinataire} — {notif.date}</p>
                  </div>
                  {notif.statut === "sent" ? (
                    <Badge className="bg-green-100 text-green-800">Envoyé</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800">Échec</Badge>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
