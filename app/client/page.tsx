"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useProfile } from "@/hooks/use-profile"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Clock, Calculator, Bell, User, Phone, Mail } from "lucide-react"

const statsCards = [
  {
    title: "Derniers documents uploadés",
    value: "12",
    description: "Ce mois-ci",
    icon: FileText,
    color: "#1E2A4A",
  },
  {
    title: "Documents en traitement",
    value: "3",
    description: "En cours d'analyse",
    icon: Clock,
    color: "#C9A84C",
  },
  {
    title: "Statut TVA du mois",
    value: "À PAYER",
    description: "45 000 MUR",
    icon: Calculator,
    color: "#DC2626",
  },
  {
    title: "Alertes WhatsApp",
    value: "2",
    description: "Non lues",
    icon: Bell,
    color: "#C9A84C",
  },
]

const recentDocuments = [
  {
    id: "1",
    nom: "facture_fournisseur_2026_03.pdf",
    date: "2026-03-24",
    type: "Facture fournisseur",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "2",
    nom: "releve_bancaire_feb.pdf",
    date: "2026-03-22",
    type: "Relevé bancaire",
    societe: "BPO",
    statut: "En cours",
  },
  {
    id: "3",
    nom: "facture_client_0045.pdf",
    date: "2026-03-20",
    type: "Facture client",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "4",
    nom: "fiche_paie_mars_2026.xlsx",
    date: "2026-03-18",
    type: "Fiche de paie",
    societe: "BPO",
    statut: "En cours",
  },
  {
    id: "5",
    nom: "charges_sociales_q1.pdf",
    date: "2026-03-15",
    type: "Charges sociales",
    societe: "TIBOK",
    statut: "Traité",
  },
]

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Traité":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Traité</Badge>
    case "En cours":
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">En cours</Badge>
    case "Erreur":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Erreur</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ClientDashboard() {
  const { profile } = useProfile()
  const firstName = profile?.full_name?.split(" ")[0] || ""

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Tableau de bord
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bienvenue{firstName ? `, ${firstName}` : ""}. Voici un aperçu de votre activité.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-5 w-5" style={{ color: card.color }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Documents */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>Documents récents</CardTitle>
            <CardDescription>Les 5 derniers documents uploadés</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]">{doc.nom}</span>
                    </TableCell>
                    <TableCell>{formatDate(doc.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.type}</Badge>
                    </TableCell>
                    <TableCell>{doc.societe}</TableCell>
                    <TableCell>{getStatutBadge(doc.statut)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* TVA Summary */}
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Résumé TVA - Mars 2026</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">TVA Collectée</span>
                <span className="font-semibold" style={{ color: "#1E2A4A" }}>
                  120 000 MUR
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">TVA Déductible</span>
                <span className="font-semibold" style={{ color: "#1E2A4A" }}>
                  75 000 MUR
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm font-medium">TVA Nette</span>
                <span className="font-bold text-red-600">45 000 MUR</span>
              </div>
              <Badge className="bg-red-100 text-red-700 border-red-200 mt-2">
                À PAYER - Échéance 20 avril 2026
              </Badge>
            </CardContent>
          </Card>

          {/* Mon Comptable */}
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Mon comptable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm"
                  style={{ backgroundColor: "#1E2A4A" }}
                >
                  SR
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "#1E2A4A" }}>
                    Sophie Ramgoolam
                  </p>
                  <p className="text-xs text-muted-foreground">Comptable senior</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>+230 5723 4567</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>sophie.r@lexora.mu</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
