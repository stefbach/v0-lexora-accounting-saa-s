"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileText, Eye, Search, Download } from "lucide-react"

const mockDocuments = [
  { id: "1", nom_fichier: "facture_fournisseur_001.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-24", type_document: "facture_fournisseur", statut: "traite" },
  { id: "2", nom_fichier: "releve_mcb_mars.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-22", type_document: "releve_bancaire", statut: "traite" },
  { id: "3", nom_fichier: "fiche_paie_mars.xlsx", client: "Marie Curie", societe: "BPO", date: "2026-03-20", type_document: "fiche_paie", statut: "en_cours" },
  { id: "4", nom_fichier: "facture_client_XYZ.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-18", type_document: "facture_client", statut: "traite" },
  { id: "5", nom_fichier: "contrat_location.pdf", client: "Ahmed Hassan", societe: "Obesity Care Malta", date: "2026-03-15", type_document: "contrat", statut: "traite" },
  { id: "6", nom_fichier: "charges_Q1_2026.xlsx", client: "Marie Curie", societe: "BPO", date: "2026-03-12", type_document: "charges_sociales", statut: "erreur" },
  { id: "7", nom_fichier: "facture_achat_matériel.pdf", client: "Sophie Martin", societe: "NHS S2", date: "2026-03-10", type_document: "facture_fournisseur", statut: "traite" },
  { id: "8", nom_fichier: "releve_sbm_fevrier.pdf", client: "Ahmed Hassan", societe: "Obesity Care Malta", date: "2026-03-08", type_document: "releve_bancaire", statut: "en_attente" },
  { id: "9", nom_fichier: "facture_service_IT.pdf", client: "Sophie Martin", societe: "NHS S2", date: "2026-03-05", type_document: "facture_fournisseur", statut: "en_cours" },
  { id: "10", nom_fichier: "fiche_paie_fevrier.xlsx", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-01", type_document: "fiche_paie", statut: "traite" },
]

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Facture fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Facture client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Relevé bancaire", className: "bg-green-100 text-green-800" },
    fiche_paie: { label: "Fiche de paie", className: "bg-orange-100 text-orange-800" },
    charges_sociales: { label: "Charges sociales", className: "bg-pink-100 text-pink-800" },
    contrat: { label: "Contrat", className: "bg-indigo-100 text-indigo-800" },
    autre: { label: "Autre", className: "bg-gray-100 text-gray-800" },
  }
  const c = config[type] || config.autre
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function getStatusBadge(statut: string) {
  const config: Record<string, { label: string; className: string }> = {
    en_attente: { label: "En attente", className: "bg-yellow-100 text-yellow-800" },
    en_cours: { label: "En cours", className: "bg-blue-100 text-blue-800" },
    traite: { label: "Traité", className: "bg-green-100 text-green-800" },
    erreur: { label: "Erreur", className: "bg-red-100 text-red-800" },
  }
  const c = config[statut] || { label: statut, className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

export default function AdminDocumentsPage() {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = mockDocuments.filter((doc) => {
    const matchSearch =
      doc.nom_fichier.toLowerCase().includes(search.toLowerCase()) ||
      doc.client.toLowerCase().includes(search.toLowerCase()) ||
      doc.societe.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === "all" || doc.type_document === typeFilter
    const matchStatus = statusFilter === "all" || doc.statut === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const stats = {
    total: mockDocuments.length,
    traite: mockDocuments.filter((d) => d.statut === "traite").length,
    en_cours: mockDocuments.filter((d) => d.statut === "en_cours").length,
    erreur: mockDocuments.filter((d) => d.statut === "erreur").length,
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Documents</h1>
        <p className="text-muted-foreground">Tous les documents de la plateforme</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.traite}</div>
            <p className="text-sm text-muted-foreground">Traités</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.en_cours}</div>
            <p className="text-sm text-muted-foreground">En cours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.erreur}</div>
            <p className="text-sm text-muted-foreground">Erreurs</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par fichier, client ou société..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Type de document" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="facture_fournisseur">Facture fournisseur</SelectItem>
            <SelectItem value="facture_client">Facture client</SelectItem>
            <SelectItem value="releve_bancaire">Relevé bancaire</SelectItem>
            <SelectItem value="fiche_paie">Fiche de paie</SelectItem>
            <SelectItem value="charges_sociales">Charges sociales</SelectItem>
            <SelectItem value="contrat">Contrat</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="traite">Traité</SelectItem>
            <SelectItem value="erreur">Erreur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.nom_fichier}
                    </div>
                  </TableCell>
                  <TableCell>{doc.client}</TableCell>
                  <TableCell>{doc.societe}</TableCell>
                  <TableCell>{doc.date}</TableCell>
                  <TableCell>{getDocTypeBadge(doc.type_document)}</TableCell>
                  <TableCell>{getStatusBadge(doc.statut)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Aucun document trouvé
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
