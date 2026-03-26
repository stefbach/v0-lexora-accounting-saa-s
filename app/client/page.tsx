"use client"

import { useState, useCallback } from "react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  AlertTriangle,
  CheckCircle,
  Loader2,
  Lightbulb,
  BarChart3,
  Wallet,
  CircleDollarSign,
  Banknote,
  ArrowRight,
  Clock,
  Check,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAlerts = [
  {
    id: "a1",
    niveau: "red" as const,
    message: "Votre declaration TVA de mars doit etre soumise avant le 20 avril. Montant estime : 45 230 MUR.",
  },
  {
    id: "a2",
    niveau: "orange" as const,
    message: "3 factures clients sont impayees depuis plus de 30 jours. Total : 87 500 MUR.",
  },
  {
    id: "a3",
    niveau: "blue" as const,
    message: "Votre rapport mensuel de mars est pret. Consultez-le dans vos documents.",
  },
]

const mockActions = [
  { quoi: "Envoyer les factures manquantes a votre comptable", pourQuand: "Avant le 5 avril", combien: "3 factures", fait: false },
  { quoi: "Payer la TVA du mois de mars", pourQuand: "Avant le 20 avril", combien: "45 230 MUR", fait: false },
  { quoi: "Verifier les fiches de paie de mars", pourQuand: "Avant le 30 mars", combien: "17 employes", fait: true },
  { quoi: "Renouveler l'assurance du vehicule", pourQuand: "Avant le 15 avril", combien: "12 800 MUR", fait: false },
]

const mockDocuments = [
  { id: "d1", nom: "Rapport Mars 2026.pdf", date: "25/03/2026", statut: "Classe" },
  { id: "d2", nom: "Releve MCB Fevrier.pdf", date: "22/03/2026", statut: "Analyse en cours" },
  { id: "d3", nom: "Facture client #0456.pdf", date: "20/03/2026", statut: "Question du comptable" },
  { id: "d4", nom: "Fiche paie equipe mars.xlsx", date: "18/03/2026", statut: "Classe" },
  { id: "d5", nom: "CSG Q1 2026.pdf", date: "15/03/2026", statut: "Classe" },
]

const mockRecentUploads = [
  { id: "u1", nom: "facture_mars_2026.pdf", date: "25/03/2026", statut: "Recu" },
  { id: "u2", nom: "releve_MCB_fev.pdf", date: "22/03/2026", statut: "En cours" },
  { id: "u3", nom: "facture_orange.jpeg", date: "20/03/2026", statut: "Traite" },
  { id: "u4", nom: "fiche_paie_mars.xlsx", date: "18/03/2026", statut: "En cours" },
  { id: "u5", nom: "note_frais.pdf", date: "15/03/2026", statut: "Recu" },
]

// ---------------------------------------------------------------------------
// Doc status badge
// ---------------------------------------------------------------------------

function DocStatutBadge({ statut }: { statut: string }) {
  switch (statut) {
    case "Classe":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Classe
        </Badge>
      )
    case "Analyse en cours":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Analyse en cours
        </Badge>
      )
    case "Question du comptable":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Question
        </Badge>
      )
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

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
// Client User — simple view
// ---------------------------------------------------------------------------

function ClientUserDashboard({ firstName }: { firstName: string }) {
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
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
        Bonjour {firstName}
      </h1>
      <p className="text-muted-foreground">
        Deposez vos documents ci-dessous, votre comptable s{"'"}en occupe.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
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
        <Button className="mt-4 text-white" style={{ backgroundColor: "#C9A84C" }}>
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
                {mockRecentUploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        {u.nom}
                      </div>
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
  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* ================================================================== */}
      {/* Section 1 — Resume du mois */}
      {/* ================================================================== */}
      <Card className="overflow-hidden border-0 shadow-md">
        <CardHeader className="py-5 px-6" style={{ backgroundColor: "#1E2A4A" }}>
          <CardTitle className="text-white text-2xl">
            Bonjour {firstName}
          </CardTitle>
          <p className="text-white/70 text-sm mt-1">
            {societe} | Mars 2026
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#C9A84C" }}>
            Resume du mois
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ce mois-ci, votre chiffre d{"'"}affaires a augmente de 12% par rapport a fevrier,
            grace a une bonne performance sur vos factures clients. Vos depenses restent stables.
            Votre tresorerie est saine avec plus de 2 millions MUR disponibles. Il reste 3 factures
            impayees a relancer et votre declaration TVA a preparer avant le 20 avril. Dans l{"'"}ensemble,
            le mois de mars est positif pour votre entreprise.
          </p>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 2 — Mes 4 chiffres cles */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes 4 chiffres cles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                +12% vs fevrier
              </div>
            </CardContent>
          </Card>

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
              <p className="text-xs text-muted-foreground mt-1">
                Stable par rapport au mois dernier
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4" style={{ color: "#C9A84C" }} />
                Benefice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(515_000)}
              </div>
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs mt-1">
                Positif
              </Badge>
            </CardContent>
          </Card>

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
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs mt-1">
                Sain
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section 3 — Mes actions ce mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes actions ce mois
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Quoi faire</TableHead>
                  <TableHead className="font-semibold">Pour quand</TableHead>
                  <TableHead className="font-semibold">Combien</TableHead>
                  <TableHead className="font-semibold">Fait ?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockActions.map((action, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium" style={{ color: "#1E2A4A" }}>
                      {action.quoi}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{action.pourQuand}</TableCell>
                    <TableCell className="font-medium">{action.combien}</TableCell>
                    <TableCell>
                      {action.fait ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1 w-fit">
                          <Check className="h-3 w-3" /> Fait
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1 w-fit">
                          <Clock className="h-3 w-3" /> A faire
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 4 — Mes alertes */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Mes alertes
        </h2>
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
                <CardContent className="py-4 flex items-center gap-3">
                  <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${c.dot}`} />
                  <p className="text-sm">{alert.message}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section 5 — Conseil du mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#1E2A4A" }}>
          Conseil du mois
        </h2>
        <Card className="border-[#C9A84C]/30 bg-[#C9A84C]/5">
          <CardContent className="py-6 flex gap-4">
            <Lightbulb className="h-6 w-6 shrink-0 mt-0.5" style={{ color: "#C9A84C" }} />
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "#1E2A4A" }}>
                Pensez a relancer vos clients
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vous avez 87 500 MUR de factures impayees depuis plus de 30 jours. Relancer vos clients
                rapidement permet de maintenir votre tresorerie en bonne sante. Vous pouvez contacter
                votre comptable pour qu{"'"}il envoie les rappels a votre place.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 6 — Documents recents */}
      {/* ================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
            Documents recents
          </h2>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-sm"
            style={{ color: "#C9A84C" }}
          >
            <Link href="/client/documents">
              Voir tous les documents
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
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
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        {doc.nom}
                      </div>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ClientDashboard() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const fullName = profile?.full_name || ""
  const firstName = fullName.split(" ")[0] || ""
  const isClientUser = profile?.role === "client_user"
  const societe = "Ma Societe Ltd"

  if (isClientUser) {
    return <ClientUserDashboard firstName={firstName} />
  }

  return <ClientAdminDashboard firstName={firstName} societe={societe} />
}
