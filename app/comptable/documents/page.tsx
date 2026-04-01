"use client"

import { useState, useEffect, useCallback } from "react"
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
import { FileText, Eye, Search, CheckCircle, FolderOpen, Loader2 } from "lucide-react"

interface Document {
  id: string
  nom_fichier: string
  client_name: string
  societe_nom: string
  created_at: string
  type_document: string
  statut: string
}

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Facture fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Facture client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Releve bancaire", className: "bg-green-100 text-green-800" },
    fiche_paie: { label: "Fiche de paie", className: "bg-orange-100 text-orange-800" },
    charges_sociales: { label: "Charges sociales", className: "bg-pink-100 text-pink-800" },
    contrat: { label: "Contrat", className: "bg-indigo-100 text-indigo-800" },
  }
  const c = config[type] || { label: type || "Autre", className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function getStatusBadge(statut: string) {
  const config: Record<string, { label: string; className: string }> = {
    en_attente: { label: "En attente", className: "bg-yellow-100 text-yellow-800" },
    en_cours: { label: "En cours", className: "bg-blue-100 text-blue-800" },
    traite: { label: "Traite", className: "bg-green-100 text-green-800" },
    erreur: { label: "Erreur", className: "bg-red-100 text-red-800" },
  }
  const c = config[statut] || { label: statut, className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

export default function ComptableDocumentsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/documents")
      const data = await res.json()
      if (data.documents) {
        setDocuments(data.documents)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const filtered = documents.filter((doc) => {
    const searchLower = search.toLowerCase()
    const matchSearch = !search ||
      doc.nom_fichier.toLowerCase().includes(searchLower) ||
      doc.client_name.toLowerCase().includes(searchLower) ||
      doc.societe_nom.toLowerCase().includes(searchLower)
    const matchStatus = statusFilter === "all" || doc.statut === statusFilter
    return matchSearch && matchStatus
  })

  const pending = documents.filter((d) => d.statut === "en_attente").length
  const enCours = documents.filter((d) => d.statut === "en_cours").length

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Documents</h1>
        <p className="text-muted-foreground">Documents de tous vos clients</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : documents.length}</div><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : pending}</div><p className="text-sm text-muted-foreground">En attente de traitement</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : enCours}</div><p className="text-sm text-muted-foreground">En cours</p></CardContent></Card>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher par nom, client ou societe..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="traite">Traite</SelectItem>
            <SelectItem value="erreur">Erreur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Societe</TableHead>
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
                    <TableCell>{doc.client_name}</TableCell>
                    <TableCell>{doc.societe_nom}</TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
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
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucun document</p>
              <p className="text-sm">Les documents de vos clients apparaitront ici une fois televerses.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
