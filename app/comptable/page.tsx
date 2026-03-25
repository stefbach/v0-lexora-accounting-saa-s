import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, FileText, Calculator, AlertTriangle, Clock } from "lucide-react"

const kpis = [
  {
    label: "Nombre de clients",
    value: "8",
    icon: Users,
    change: "+2 ce trimestre",
  },
  {
    label: "Documents à traiter",
    value: "15",
    icon: FileText,
    change: "3 urgents",
  },
  {
    label: "TVA à déclarer ce mois",
    value: "4",
    icon: Calculator,
    change: "Échéance le 20 avril",
  },
  {
    label: "Alertes en attente",
    value: "6",
    icon: AlertTriangle,
    change: "2 haute priorité",
  },
]

const clientsAttention = [
  {
    name: "Jean-Marc Dupont",
    societe: "TIBOK Ltd",
    raison: "TVA en retard - Mars 2026",
    priorite: "haute" as const,
  },
  {
    name: "Marie Lefèvre",
    societe: "BPO Services Ltd",
    raison: "5 documents non traités",
    priorite: "haute" as const,
  },
  {
    name: "Pierre Martin",
    societe: "Obesity Care Malta",
    raison: "Écart charges sociales détecté",
    priorite: "moyenne" as const,
  },
  {
    name: "Sophie Bernard",
    societe: "NHS S2 Healthcare",
    raison: "Déclaration TVA à préparer",
    priorite: "moyenne" as const,
  },
  {
    name: "Luc Moreau",
    societe: "TIBOK Ltd",
    raison: "Documents en attente de validation",
    priorite: "basse" as const,
  },
]

const recentActivity = [
  {
    time: "Il y a 10 min",
    text: "Nouveau document uploadé par Jean-Marc Dupont (Facture fournisseur)",
  },
  {
    time: "Il y a 30 min",
    text: "TVA déclarée pour BPO Services - Février 2026",
  },
  {
    time: "Il y a 1h",
    text: "Alerte WhatsApp envoyée à Pierre Martin - Rappel charges sociales",
  },
  {
    time: "Il y a 2h",
    text: "Rapport P&L généré pour Obesity Care Malta - Mars 2026",
  },
  {
    time: "Il y a 3h",
    text: "Nouveau client ajouté : Claire Fontaine (NHS S2 Healthcare)",
  },
]

const prioriteStyles: Record<string, string> = {
  haute: "bg-red-100 text-red-700 border-red-200",
  moyenne: "bg-orange-100 text-orange-700 border-orange-200",
  basse: "bg-blue-100 text-blue-700 border-blue-200",
}

export default function ComptableDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Bienvenue, Sarah
        </h1>
        <p className="text-gray-500 text-sm">
          Voici un aperçu de votre portefeuille clients
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{kpi.label}</p>
                  <p
                    className="text-3xl font-bold mt-1"
                    style={{ color: "#1E2A4A" }}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{kpi.change}</p>
                </div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#C9A84C20" }}
                >
                  <kpi.icon className="h-6 w-6" style={{ color: "#C9A84C" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clients nécessitant attention */}
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>
              Clients nécessitant attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clientsAttention.map((client, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{client.name}</p>
                    <p className="text-xs text-gray-500">{client.societe}</p>
                    <p className="text-xs text-gray-600">{client.raison}</p>
                  </div>
                  <Badge className={prioriteStyles[client.priorite]}>
                    {client.priorite}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activité récente */}
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#C9A84C20" }}
                  >
                    <Clock
                      className="h-4 w-4"
                      style={{ color: "#C9A84C" }}
                    />
                  </div>
                  <div>
                    <p className="text-sm">{activity.text}</p>
                    <p className="text-xs text-gray-400">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
