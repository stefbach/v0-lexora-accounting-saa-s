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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  Search,
  Eye,
  Download,
} from "lucide-react"

interface DocumentItem {
  id: string
  fichier: string
  date: string
  type: string
  societe: string
  statut: string
}

const mockDocuments: DocumentItem[] = [
  {
    id: "1",
    fichier: "facture_achats_mars_2026.pdf",
    date: "2026-03-24",
    type: "Facture fournisseur",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "2",
    fichier: "releve_MCB_022026.pdf",
    date: "2026-03-22",
    type: "Relevé bancaire",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "3",
    fichier: "facture_vente_00234.pdf",
    date: "2026-03-20",
    type: "Facture client",
    societe: "BPO",
    statut: "En cours",
  },
  {
    id: "4",
    fichier: "fiches_paie_mars.xlsx",
    date: "2026-03-19",
    type: "Fiche de paie",
    societe: "BPO",
    statut: "Traité",
  },
  {
    id: "5",
    fichier: "facture_electricite.png",
    date: "2026-03-18",
    type: "Facture fournisseur",
    societe: "TIBOK",
    statut: "Erreur",
  },
  {
    id: "6",
    fichier: "releve_SBI_022026.pdf",
    date: "2026-03-16",
    type: "Relevé bancaire",
    societe: "BPO",
    statut: "Traité",
  },
  {
    id: "7",
    fichier: "facture_fournisseur_orange.jpeg",
    date: "2026-03-14",
    type: "Facture fournisseur",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "8",
    fichier: "facture_vente_00210.pdf",
    date: "2026-03-12",
    type: "Facture client",
    societe: "BPO",
    statut: "Traité",
  },
  {
    id: "9",
    fichier: "charges_sociales_q1.pdf",
    date: "2026-03-10",
    type: "Charges sociales",
    societe: "TIBOK",
    statut: "En cours",
  },
  {
    id: "10",
    fichier: "facture_loyer_mars.pdf",
    date: "2026-03-08",
    type: "Facture fournisseur",
    societe: "BPO",
    statut: "Traité",
  },
  {
    id: "11",
    fichier: "contrat_bail_2026.pdf",
    date: "2026-03-05",
    type: "Contrat",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "12",
    fichier: "releve_MCB_012026.pdf",
    date: "2026-03-02",
    type: "Relevé bancaire",
    societe: "TIBOK",
    statut: "Traité",
  },
  {
    id: "13",
    fichier: "facture_fournitures_bureau.jpeg",
    date: "2026-02-28",
    type: "Facture fournisseur",
    societe: "BPO",
    statut: "Traité",
  },
]

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  if (ext === "xlsx")
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />
  if (ext === "jpeg" || ext === "jpg" || ext === "png")
    return <FileImage className="h-4 w-4 text-purple-600" />
  return <FileText className="h-4 w-4 text-blue-600" />
}

function getTypeBadge(type: string) {
  switch (type) {
    case "Facture fournisseur":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          {type}
        </Badge>
      )
    case "Facture client":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
          {type}
        </Badge>
      )
    case "Relevé bancaire":
      return (
        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
          {type}
        </Badge>
      )
    case "Fiche de paie":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          {type}
        </Badge>
      )
    case "Charges sociales":
      return (
        <Badge className="bg-teal-100 text-teal-700 border-teal-200">
          {type}
        </Badge>
      )
    case "Contrat":
      return (
        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
          {type}
        </Badge>
      )
    default:
      return <Badge variant="secondary">{type}</Badge>
  }
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Traité":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          Traité
        </Badge>
      )
    case "En cours":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          En cours
        </Badge>
      )
    case "Erreur":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Erreur
        </Badge>
      )
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("tous")

  const filteredDocuments = mockDocuments.filter((doc) => {
    const matchesSearch =
      searchQuery === "" ||
      doc.fichier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.societe.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType =
      typeFilter === "tous" || doc.type === typeFilter

    return matchesSearch && matchesType
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Documents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consultez et gérez tous vos documents comptables.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Type de document" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="Facture fournisseur">Facture fournisseur</SelectItem>
                <SelectItem value="Facture client">Facture client</SelectItem>
                <SelectItem value="Relevé bancaire">Relevé bancaire</SelectItem>
                <SelectItem value="Fiche de paie">Fiche de paie</SelectItem>
                <SelectItem value="Charges sociales">Charges sociales</SelectItem>
                <SelectItem value="Contrat">Contrat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Documents ({filteredDocuments.length})
          </CardTitle>
          <CardDescription>
            Liste de tous vos documents importés et traités
          </CardDescription>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {getFileIcon(doc.fichier)}
                      <span className="truncate max-w-[220px]">
                        {doc.fichier}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(doc.date)}</TableCell>
                  <TableCell>{getTypeBadge(doc.type)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-mono"
                      style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}
                    >
                      {doc.societe}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatutBadge(doc.statut)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-[#1E2A4A]"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-[#C9A84C]"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDocuments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun document trouvé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
