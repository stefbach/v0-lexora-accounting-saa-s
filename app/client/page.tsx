"use client"

import { useState, useCallback } from "react"
import { useProfile } from "@/hooks/use-profile"
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
  Upload,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  CircleDollarSign,
  Wallet,
  BarChart3,
  Banknote,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock data — client_user uploads
// ---------------------------------------------------------------------------

const mockUploads = [
  { id: "1", nom: "facture_mars_2026.pdf", date: "25/03/2026", statut: "Recu" },
  { id: "2", nom: "releve_bancaire_fev.pdf", date: "22/03/2026", statut: "En cours" },
  { id: "3", nom: "facture_client_0045.pdf", date: "20/03/2026", statut: "Traite" },
  { id: "4", nom: "fiche_paie_mars.xlsx", date: "18/03/2026", statut: "En cours" },
  { id: "5", nom: "charges_sociales_q1.pdf", date: "15/03/2026", statut: "Traite" },
  { id: "6", nom: "bon_commande_412.pdf", date: "12/03/2026", statut: "Traite" },
  { id: "7", nom: "note_frais_mars.pdf", date: "10/03/2026", statut: "Recu" },
  { id: "8", nom: "contrat_location.pdf", date: "08/03/2026", statut: "Traite" },
  { id: "9", nom: "devis_fournisseur.pdf", date: "05/03/2026", statut: "En cours" },
  { id: "10", nom: "assurance_vehicule.pdf", date: "02/03/2026", statut: "Traite" },
]

// ---------------------------------------------------------------------------
// Mock data — client_admin alerts
// ---------------------------------------------------------------------------

interface MockAlert {
  id: string
  niveau: "red" | "orange" | "blue"
  message: string
  action: string
}

const mockAlerts: MockAlert[] = [
  {
    id: "a1",
    niveau: "red",
    message: "Votre declaration TVA de Mars est a soumettre avant le 20/04. Montant : 45,230 MUR",
    action: "Uploader maintenant",
  },
  {
    id: "a2",
    niveau: "orange",
    message: "Votre comptable a besoin de documents manquants",
    action: "Voir le detail",
  },
  {
    id: "a3",
    niveau: "blue",
    message: "Votre rapport mensuel Mars est pret",
    action: "Marquer comme lu",
  },
]

// ---------------------------------------------------------------------------
// Mock data — client_admin obligations
// ---------------------------------------------------------------------------

const mockObligations = [
  { quoi: "Declaration TVA MRA", pourQuand: "Avant le 20/04", combien: "45,230 MUR", statut: "a_faire" as const },
  { quoi: "Cotisations CSG/NSF", pourQuand: "Avant le 30/04", combien: "8,450 MUR", statut: "en_cours" as const },
  { quoi: "Bonus fin d'annee", pourQuand: "Avant le 25/12", combien: "\u2014", statut: "decembre" as const },
]

// ---------------------------------------------------------------------------
// Mock data — client_admin recent documents
// ---------------------------------------------------------------------------

const mockDocuments = [
  { id: "d1", nom: "Bilan Mars 2026.pdf", date: "25/03/2026", statut: "classe" as const },
  { id: "d2", nom: "Releve MCB Fevrier.pdf", date: "22/03/2026", statut: "en_cours" as const },
  { id: "d3", nom: "Facture #0412.pdf", date: "20/03/2026", statut: "question" as const },
  { id: "d4", nom: "Fiche paie employes.xlsx", date: "18/03/2026", statut: "classe" as const },
  { id: "d5", nom: "Declaration CSG Q1.pdf", date: "15/03/2026", statut: "classe" as const },
]

// ---------------------------------------------------------------------------
// Upload status badge
// ---------------------------------------------------------------------------

function UploadStatutBadge({ statut }: { statut: string }) {
  switch (statut) {
    case "Recu":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Recu</Badge>
    case "En cours":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> En cours
        </Badge>
      )
    case "Traite":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Traite</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Document status badge (admin)
// ---------------------------------------------------------------------------

function DocStatutBadge({ statut }: { statut: "classe" | "en_cours" | "question" }) {
  switch (statut) {
    case "classe":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Classe
        </Badge>
      )
    case "en_cours":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> En cours
        </Badge>
      )
    case "question":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Question du comptable
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Obligation status badge
// ---------------------------------------------------------------------------

function ObligationStatutBadge({ statut }: { statut: "a_faire" | "en_cours" | "decembre" }) {
  switch (statut) {
    case "a_faire":
      return <Badge className="bg-red-100 text-red-700 border-red-200">A faire</Badge>
    case "en_cours":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">En cours</Badge>
    case "decembre":
      return <Badge className="bg-gray-100 text-gray-500 border-gray-200">Decembre</Badge>
  }
}

// ---------------------------------------------------------------------------
// Client User — ultra simple layout
// ---------------------------------------------------------------------------

function ClientUserDashboard({ firstName, societe }: { firstName: string; societe: string }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    // Mock: would handle file upload here
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Greeting */}
      <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
        Bonjour {firstName} <span role="img" aria-label="wave">👋</span>
        <span className="text-lg font-normal text-muted-foreground ml-3">| {societe}</span>
      </h1>

      {/* Big upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-colors duration-200
          ${dragOver
            ? "border-[#C9A84C] bg-[#C9A84C]/10"
            : "border-gray-300 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5"
          }
        `}
      >
        <Upload
          className="h-12 w-12 mx-auto mb-4"
          style={{ color: dragOver ? "#C9A84C" : "#1E2A4A" }}
        />
        <p className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
          Deposez vos fichiers ici
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          ou cliquez pour choisir un fichier
        </p>
        <Button
          className="mt-4"
          style={{ backgroundColor: "#C9A84C", color: "#fff" }}
        >
          <Upload className="h-4 w-4 mr-2" />
          Choisir un fichier
        </Button>
      </div>

      {/* Recent uploads */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes envois recents
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockUploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[300px]">{u.nom}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.date}</TableCell>
                    <TableCell>
                      <UploadStatutBadge statut={u.statut} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Client Admin — full dashboard with 6 sections
// ---------------------------------------------------------------------------

function ClientAdminDashboard({ firstName, societe }: { firstName: string; societe: string }) {
  const alertCount = mockAlerts.length
  const currentDate = "26 mars 2026"

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* ================================================================== */}
      {/* Section 1 — Header */}
      {/* ================================================================== */}
      <Card className="overflow-hidden border-0">
        <CardHeader className="py-5 px-6" style={{ backgroundColor: "#1E2A4A" }}>
          <CardTitle className="text-white text-2xl">
            Bonjour {firstName}
          </CardTitle>
          <CardDescription className="text-white/70 text-sm mt-1">
            {societe} | Mars 2026 &mdash; {currentDate}
          </CardDescription>
        </CardHeader>
        {alertCount > 0 && (
          <div className="bg-red-600 text-white px-6 py-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Attention : {alertCount} action(s) requise(s) ce mois
          </div>
        )}
      </Card>

      {/* ================================================================== */}
      {/* Section 2 — Mes Alertes */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes Alertes
        </h2>

        {mockAlerts.length === 0 ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-6 flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <span className="text-green-700 font-medium">Tout est a jour ce mois</span>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {mockAlerts.map((alert) => {
              const colors = {
                red: { border: "border-red-300", bg: "bg-red-50", dot: "bg-red-500" },
                orange: { border: "border-orange-300", bg: "bg-orange-50", dot: "bg-orange-500" },
                blue: { border: "border-blue-300", bg: "bg-blue-50", dot: "bg-blue-500" },
              }
              const c = colors[alert.niveau]
              return (
                <Card key={alert.id} className={`${c.border} ${c.bg}`}>
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 inline-block h-3 w-3 rounded-full shrink-0 ${c.dot}`} />
                      <p className="text-sm">{alert.message}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs"
                      style={{
                        borderColor: "#1E2A4A",
                        color: "#1E2A4A",
                      }}
                    >
                      {alert.action}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Section 3 — Mes Chiffres du Mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes Chiffres du Mois
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Chiffre d'Affaires */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" style={{ color: "#C9A84C" }} />
                Chiffre d{"'"}Affaires
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(650_000)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                +12%
              </div>
            </CardContent>
          </Card>

          {/* Depenses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" style={{ color: "#C9A84C" }} />
                Depenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(135_000)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-sm text-orange-600">
                <TrendingDown className="h-4 w-4" />
                +3%
              </div>
            </CardContent>
          </Card>

          {/* Resultat */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4" style={{ color: "#C9A84C" }} />
                Resultat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(515_000)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                  Benefice
                </Badge>
                <span className="text-xs text-muted-foreground">79.2% marge</span>
              </div>
            </CardContent>
          </Card>

          {/* Tresorerie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Banknote className="h-4 w-4" style={{ color: "#C9A84C" }} />
                Tresorerie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(2_150_000)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Mis a jour le 25/03/2026
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section 4 — Ce que vous devez faire ce mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Ce que vous devez faire ce mois
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Quoi</TableHead>
                  <TableHead className="font-semibold">Pour quand</TableHead>
                  <TableHead className="font-semibold">Combien</TableHead>
                  <TableHead className="font-semibold">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockObligations.map((ob, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium" style={{ color: "#1E2A4A" }}>
                      {ob.quoi}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ob.pourQuand}</TableCell>
                    <TableCell className="font-medium">{ob.combien}</TableCell>
                    <TableCell>
                      <ObligationStatutBadge statut={ob.statut} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 5 — Documents recents */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Documents recents
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Document</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      {doc.nom}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.date}</TableCell>
                    <TableCell>
                      <DocStatutBadge statut={doc.statut} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 6 — Mon Comptable */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mon Comptable
        </h2>
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
                  Test Compta
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Mail className="h-3.5 w-3.5" />
                  compta@lexora.mu
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Phone className="h-3.5 w-3.5" />
                  +230 5700 0000
                </p>
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  A mis a jour vos finances il y a 2 jours
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  asChild
                  size="sm"
                  className="text-white"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <a
                    href="https://wa.me/23057000000"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </a>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}
                >
                  <a href="mailto:compta@lexora.mu">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ClientDashboard() {
  const { profile, loading } = useProfile()
  const [pageLoading] = useState(false)

  if (loading || pageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const fullName = profile?.full_name || ""
  const firstName = fullName.split(" ")[0] || ""
  const isClientUser = profile?.role === "client_user"

  // Mock societe name
  const societe = "Ma Societe Ltd"

  if (isClientUser) {
    return <ClientUserDashboard firstName={firstName} societe={societe} />
  }

  // Default: client_admin (or any other client role)
  return <ClientAdminDashboard firstName={firstName} societe={societe} />
}
