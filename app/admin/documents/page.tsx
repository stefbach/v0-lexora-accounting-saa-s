"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { FileText, Search, Loader2 } from "lucide-react"

interface Document {
  id: string
  nom_fichier: string
  type_document: string
  statut: string
  created_at: string
  taille: number | null
  societe_nom: string | null
  client_nom: string | null
  societe_id: string | null
}

interface Stats {
  total: number
  traite: number
  en_attente: number
  en_cours: number
  erreur: number
}

interface SocieteOption {
  id: string
  nom: string
}

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Facture fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Facture client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Releve bancaire", className: "bg-green-100 text-green-800" },
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
    traite: { label: "Traite", className: "bg-green-100 text-green-800" },
    erreur: { label: "Erreur", className: "bg-red-100 text-red-800" },
  }
  const c = config[statut] || { label: statut, className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR")

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, traite: 0, en_attente: 0, en_cours: 0, erreur: 0 })
  const [societes, setSocietes] = useState<SocieteOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [societeFilter, setSocieteFilter] = useState("all")

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== "all") params.set("type_document", typeFilter)
      if (statusFilter !== "all") params.set("statut", statusFilter)
      if (societeFilter !== "all") params.set("societe_id", societeFilter)

      const res = await fetch(`/api/admin/documents?${params.toString()}`)
      const data = await res.json()

      if (data.documents) setDocuments(data.documents)
      if (data.stats) setStats(data.stats)
      if (data.societes) setSocietes(data.societes)
    } catch (err) {
      console.error("Erreur chargement documents:", err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter, societeFilter])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const filtered = documents.filter((doc) =>
    doc.nom_fichier.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Documents</h1>
        <p className="text-muted-foreground">Suivi des documents de la plateforme (stockage / usage)</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.traite}</div>
            <p className="text-sm text-muted-foreground">Traites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.en_attente + stats.en_cours}</div>
            <p className="text-sm text-muted-foreground">En attente / en cours</p>
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
            placeholder="Rechercher par nom de fichier..."
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
            <SelectItem value="releve_bancaire">Releve bancaire</SelectItem>
            <SelectItem value="fiche_paie">Fiche de paie</SelectItem>
            <SelectItem value="charges_sociales">Charges sociales</SelectItem>
            <SelectItem value="contrat">Contrat</SelectItem>
            <SelectItem value="autre">Autre</SelectItem>
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
            <SelectItem value="traite">Traite</SelectItem>
            <SelectItem value="erreur">Erreur</SelectItem>
          </SelectContent>
        </Select>
        <Select value={societeFilter} onValueChange={setSocieteFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Societe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les societes</SelectItem>
            {societes.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1E2A4A" }} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Societe</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date upload</TableHead>
                  <TableHead>Taille</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate max-w-[250px]">{doc.nom_fichier}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getDocTypeBadge(doc.type_document)}</TableCell>
                    <TableCell>{doc.societe_nom || "—"}</TableCell>
                    <TableCell>{doc.client_nom || "—"}</TableCell>
                    <TableCell>{getStatusBadge(doc.statut)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(doc.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatSize(doc.taille)}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {search || typeFilter !== "all" || statusFilter !== "all" || societeFilter !== "all"
                        ? "Aucun document trouve pour ces criteres."
                        : "Aucun document sur la plateforme."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
