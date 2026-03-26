"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FileText, Eye, Search, CheckCircle } from "lucide-react"

const mockDocuments = [
  { id: "1", nom_fichier: "facture_fournisseur_001.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-24", type_document: "facture_fournisseur", statut: "traite" },
  { id: "2", nom_fichier: "releve_mcb_mars.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-22", type_document: "releve_bancaire", statut: "en_cours" },
  { id: "3", nom_fichier: "fiche_paie_mars.xlsx", client: "Marie Curie", societe: "BPO", date: "2026-03-20", type_document: "fiche_paie", statut: "en_attente" },
  { id: "4", nom_fichier: "facture_client_XYZ.pdf", client: "Jean-Pierre Dupont", societe: "TIBOK", date: "2026-03-18", type_document: "facture_client", statut: "traite" },
  { id: "5", nom_fichier: "contrat_bail.pdf", client: "Ahmed Hassan", societe: "Obesity Care Malta", date: "2026-03-15", type_document: "contrat", statut: "en_attente" },
  { id: "6", nom_fichier: "charges_Q1.xlsx", client: "Marie Curie", societe: "BPO", date: "2026-03-12", type_document: "charges_sociales", statut: "erreur" },
  { id: "7", nom_fichier: "facture_achat_02.pdf", client: "Sophie Martin", societe: "NHS S2", date: "2026-03-10", type_document: "facture_fournisseur", statut: "traite" },
]

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Facture fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Facture client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Relevé bancaire", className: "bg-green-100 text-green-800" },
    fiche_paie: { label: "Fiche de paie", className: "bg-orange-100 text-orange-800" },
    charges_sociales: { label: "Charges sociales", className: "bg-pink-100 text-pink-800" },
    contrat: { label: "Contrat", className: "bg-indigo-100 text-indigo-800" },
  }
  const c = config[type] || { label: type, className: "bg-gray-100 text-gray-800" }
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

export default function ComptableDocumentsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = mockDocuments.filter((doc) => {
    const matchSearch = doc.nom_fichier.toLowerCase().includes(search.toLowerCase()) || doc.client.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || doc.statut === statusFilter
    return matchSearch && matchStatus
  })

  const pending = mockDocuments.filter((d) => d.statut === "en_attente").length
  const enCours = mockDocuments.filter((d) => d.statut === "en_cours").length

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Documents</h1>
        <p className="text-muted-foreground">Documents de tous vos clients</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{mockDocuments.length}</div><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{pending}</div><p className="text-sm text-muted-foreground">En attente de traitement</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">{enCours}</div><p className="text-sm text-muted-foreground">En cours</p></CardContent></Card>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="traite">Traité</SelectItem>
            <SelectItem value="erreur">Erreur</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{doc.nom_fichier}</div></TableCell>
                  <TableCell>{doc.client}</TableCell>
                  <TableCell>{doc.societe}</TableCell>
                  <TableCell>{doc.date}</TableCell>
                  <TableCell>{getDocTypeBadge(doc.type_document)}</TableCell>
                  <TableCell>{getStatusBadge(doc.statut)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                      {doc.statut === "en_attente" && <Button variant="ghost" size="icon"><CheckCircle className="h-4 w-4 text-green-600" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
