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
import { FileText, Search, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async (visibleIds: string[]) => {
    const ids = Array.from(selectedIds).filter(id => visibleIds.includes(id))
    if (ids.length === 0) return
    if (!confirm(`Supprimer ${ids.length} document(s) sélectionné(s) ?\n\nCela supprime les fichiers du storage ET toutes les écritures/factures/relevés liés. Action irréversible.`)) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || `Erreur HTTP ${res.status}`); return }
      setDocuments(prev => prev.filter(d => !data.deleted?.includes(d.id)))
      setSelectedIds(new Set())
      if (data.failed_count > 0) {
        alert(`${data.deleted_count} supprimés, ${data.failed_count} échecs.`)
      }
    } catch {
      alert('Erreur de connexion')
    } finally {
      setBulkDeleting(false)
    }
  }

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
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>Documents</h1>
        <p className="text-muted-foreground">Suivi des documents de la plateforme (stockage / usage)</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{stats.total}</div>
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

      {/* Bulk actions toolbar — visible uniquement quand ≥1 ligne sélectionnée */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-lg border border-[#9F1239]/30 bg-[#9F1239]/5 px-4 py-3 shadow-sm">
          <div className="text-sm">
            <span className="font-semibold text-[#0B0F2E]">{selectedIds.size}</span>
            <span className="text-gray-600"> document{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting}>
              Tout désélectionner
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-[#9F1239] hover:bg-[#9F1239]/90 text-white"
              onClick={() => handleBulkDelete(filtered.map(d => d.id))}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#0B0F2E" }} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      title="Tout (dé)sélectionner"
                      checked={filtered.length > 0 && filtered.every(d => selectedIds.has(d.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filtered.map(d => d.id)))
                        else setSelectedIds(new Set())
                      }}
                    />
                  </TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Societe</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date upload</TableHead>
                  <TableHead>Taille</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow key={doc.id} className={selectedIds.has(doc.id) ? "bg-[#D4AF37]/5" : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#9F1239] hover:text-[#9F1239] hover:bg-[#9F1239]/5"
                        title="Supprimer le document (fichier + lignes liées)"
                        onClick={async () => {
                          if (!confirm(`Supprimer "${doc.nom_fichier}" ?\n\nCela supprime le fichier du storage ET toutes les écritures/factures/relevés qui y sont liés. Action irréversible.`)) return
                          try {
                            const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                            if (res.ok) {
                              setDocuments(prev => prev.filter(d => d.id !== doc.id))
                            } else {
                              const d = await res.json().catch(() => ({}))
                              alert(d.error || `Erreur HTTP ${res.status}`)
                            }
                          } catch {
                            alert('Erreur de connexion')
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
    </ClientPageShell>
  )
}
