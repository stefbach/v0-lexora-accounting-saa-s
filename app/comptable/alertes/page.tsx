"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Bell, Calendar, FileText, MessageSquare, Mail, CheckCircle, XCircle } from "lucide-react"

const mockAlerts = [
  { id: "1", type: "tva_deadline", priority: "haute", message: "TVA TIBOK — Deadline le 20 avril 2026. Déclaration non soumise.", client: "Jean-Pierre Dupont", date: "2026-03-25", statut: "active" },
  { id: "2", type: "document_erreur", priority: "haute", message: "Erreur de traitement sur charges_Q1.xlsx pour BPO.", client: "Marie Curie", date: "2026-03-24", statut: "active" },
  { id: "3", type: "tva_deadline", priority: "moyenne", message: "TVA BPO — Deadline le 20 avril 2026. À déclarer.", client: "Marie Curie", date: "2026-03-23", statut: "active" },
  { id: "4", type: "document_traite", priority: "basse", message: "Facture fournisseur 001 traitée avec succès pour TIBOK.", client: "Jean-Pierre Dupont", date: "2026-03-22", statut: "resolue" },
  { id: "5", type: "charges_ecart", priority: "haute", message: "Écart détecté sur NPF janvier 2026 pour TIBOK.", client: "Jean-Pierre Dupont", date: "2026-03-20", statut: "active" },
  { id: "6", type: "document_traite", priority: "basse", message: "Relevé bancaire MCB traité pour TIBOK.", client: "Jean-Pierre Dupont", date: "2026-03-19", statut: "resolue" },
  { id: "7", type: "tva_retard", priority: "haute", message: "TVA décembre 2025 — En retard. Pénalité estimée : 5,000 MUR.", client: "Jean-Pierre Dupont", date: "2026-03-18", statut: "active" },
  { id: "8", type: "document_erreur", priority: "moyenne", message: "Document non reconnu : scan_bureau.jpeg pour NHS S2.", client: "Sophie Martin", date: "2026-03-15", statut: "resolue" },
]

const mockNotifHistory = [
  { id: "1", type: "whatsapp", destinataire: "Jean-Pierre Dupont", message: "Rappel : deadline TVA le 20 avril 2026.", date: "2026-03-25 09:00", statut: "sent" },
  { id: "2", type: "email", destinataire: "Marie Curie", message: "Erreur de traitement document charges_Q1.xlsx.", date: "2026-03-24 14:30", statut: "sent" },
  { id: "3", type: "whatsapp", destinataire: "Jean-Pierre Dupont", message: "Facture fournisseur 001 traitée avec succès.", date: "2026-03-22 11:00", statut: "sent" },
  { id: "4", type: "whatsapp", destinataire: "Ahmed Hassan", message: "Votre contrat de bail a été classé.", date: "2026-03-15 16:00", statut: "failed" },
  { id: "5", type: "email", destinataire: "Sophie Martin", message: "Rapport P&L février 2026 disponible.", date: "2026-03-12 09:00", statut: "sent" },
]

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
  const activeAlerts = mockAlerts.filter((a) => a.statut === "active")

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Alertes</h1>
        <p className="text-muted-foreground">Alertes et historique des notifications</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bell className="h-8 w-8 text-red-500" /><div><div className="text-2xl font-bold">{activeAlerts.length}</div><p className="text-sm text-muted-foreground">Alertes actives</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-orange-500" /><div><div className="text-2xl font-bold">{activeAlerts.filter((a) => a.priority === "haute").length}</div><p className="text-sm text-muted-foreground">Priorité haute</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><MessageSquare className="h-8 w-8 text-green-500" /><div><div className="text-2xl font-bold">{mockNotifHistory.length}</div><p className="text-sm text-muted-foreground">Notifications envoyées</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="alertes">
        <TabsList>
          <TabsTrigger value="alertes">Alertes ({activeAlerts.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="alertes" className="space-y-3 mt-4">
          {mockAlerts.map((alert) => (
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
          ))}
        </TabsContent>

        <TabsContent value="historique" className="space-y-3 mt-4">
          {mockNotifHistory.map((notif) => (
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
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
