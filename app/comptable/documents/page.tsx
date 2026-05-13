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
import { FileText, Eye, Search, CheckCircle, FolderOpen, Loader2, Trash2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

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
  const locale = getLocale()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
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
      if (data.failed_count > 0) alert(`${data.deleted_count} supprimés, ${data.failed_count} échecs.`)
    } catch {
      alert('Erreur de connexion')
    } finally {
      setBulkDeleting(false)
    }
  }

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
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{t('cab.documents.title', locale)}</h1>
        <p className="text-muted-foreground">{t('cab.documents.subtitle', locale)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : documents.length}</div><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : pending}</div><p className="text-sm text-muted-foreground">En attente de traitement</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : enCours}</div><p className="text-sm text-muted-foreground">En cours</p></CardContent></Card>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t('cab.documents.search', locale)} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-lg border border-[#9F1239]/30 bg-[#9F1239]/5 px-4 py-3 shadow-sm mb-3">
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length > 0 ? (
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
                  <TableRow key={doc.id} className={selectedIds.has(doc.id) ? "bg-[#D4AF37]/5" : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[#9F1239] hover:text-[#9F1239] hover:bg-[#9F1239]/5"
                          title="Supprimer (fichier + écritures/factures/relevés liés)"
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">{t('cab.documents.empty', locale)}</p>
              <p className="text-sm">{t('cab.documents.empty_hint', locale)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
