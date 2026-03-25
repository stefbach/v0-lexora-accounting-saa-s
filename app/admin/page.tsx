import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Users,
  FileText,
  Calculator,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Upload,
  UserPlus,
} from "lucide-react"
import Link from "next/link"

const kpis = [
  {
    title: "Clients actifs",
    value: "42",
    description: "+3 ce mois",
    icon: Users,
    color: "#C9A84C",
  },
  {
    title: "Documents traités ce mois",
    value: "156",
    description: "78% du total reçu",
    icon: FileText,
    color: "#1E2A4A",
  },
  {
    title: "TVA à déclarer",
    value: "1 250 000 MUR",
    description: "Échéance : 20 avril 2026",
    icon: Calculator,
    color: "#C9A84C",
  },
  {
    title: "Alertes critiques",
    value: "3",
    description: "2 retards TVA, 1 écart",
    icon: AlertTriangle,
    color: "#dc2626",
  },
]

const societes = [
  {
    id: "1",
    nom: "TIBOK Ltd",
    brn: "C12345678",
    numeroTvaMra: "VAT-20230001",
    statutTva: true,
    comptable: "Marie Dupont",
  },
  {
    id: "2",
    nom: "BPO Services Ltd",
    brn: "C23456789",
    numeroTvaMra: "VAT-20230002",
    statutTva: true,
    comptable: "Jean Martin",
  },
  {
    id: "3",
    nom: "Obesity Care Malta",
    brn: "C34567890",
    numeroTvaMra: "—",
    statutTva: false,
    comptable: "Marie Dupont",
  },
  {
    id: "4",
    nom: "NHS S2 Corp",
    brn: "C45678901",
    numeroTvaMra: "VAT-20230004",
    statutTva: true,
    comptable: "Sophie Laurent",
  },
]

const recentActivity = [
  {
    id: "1",
    icon: Upload,
    text: "Nouveau document uploadé par TIBOK Ltd — Facture fournisseur",
    time: "Il y a 15 min",
  },
  {
    id: "2",
    icon: CheckCircle2,
    text: "Déclaration TVA complétée pour BPO Services Ltd — Mars 2026",
    time: "Il y a 1h",
  },
  {
    id: "3",
    icon: UserPlus,
    text: "Nouveau client ajouté : Obesity Care Malta",
    time: "Il y a 3h",
  },
  {
    id: "4",
    icon: AlertTriangle,
    text: "Alerte : Écart détecté sur les charges sociales de NHS S2 Corp",
    time: "Hier",
  },
  {
    id: "5",
    icon: Clock,
    text: "Rappel : Échéance TVA pour TIBOK Ltd dans 5 jours",
    time: "Hier",
  },
]

export default function AdminDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Tableau de bord administrateur
        </h1>
        <p className="text-muted-foreground mt-1">
          Vue d&apos;ensemble de l&apos;activité Lexora
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: kpi.color + "15" }}
              >
                <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sociétés Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle style={{ color: "#1E2A4A" }}>
              Sociétés gérées
            </CardTitle>
            <CardDescription>
              Liste des sociétés enregistrées sur la plateforme
            </CardDescription>
          </div>
          <Link href="/admin/societes">
            <Button variant="outline" size="sm">
              Voir tout
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>BRN</TableHead>
                <TableHead>N° TVA MRA</TableHead>
                <TableHead>Statut TVA</TableHead>
                <TableHead>Comptable assigné</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {societes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nom}</TableCell>
                  <TableCell>{s.brn}</TableCell>
                  <TableCell>{s.numeroTvaMra}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        s.statutTva
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }
                    >
                      {s.statutTva ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.comptable}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/societes`}>
                      <Button variant="ghost" size="sm">
                        Détails
                        <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>Activité récente</CardTitle>
          <CardDescription>
            Dernières actions sur la plateforme
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#1E2A4A10" }}
                >
                  <activity.icon
                    className="h-4 w-4"
                    style={{ color: "#1E2A4A" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{activity.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
