"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCw, Trash2, Camera,
  Download, Search, Clock, AlertTriangle,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function statutBadge(s: string) {
  if (s === "traite") return <Badge className="bg-green-100 text-green-700">Traité</Badge>
  if (s === "en_cours" || s === "en_attente") return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />En cours</Badge>
  if (s === "erreur") return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />Erreur</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function confianceBadge(c: number | null | undefined) {
  if (c == null) return <span className="text-xs text-muted-foreground">—</span>
  if (c >= 80) return <Badge className="bg-green-100 text-green-700 text-xs">{c}%</Badge>
  if (c >= 50) return <Badge className="bg-orange-100 text-orange-700 text-xs">{c}%</Badge>
  return <Badge className="bg-red-100 text-red-700 text-xs">{c}%</Badge>
}

export default function AssistantPage() {
  const { profile } = useProfile()
  const [societes, setSocietes] = useState<any[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [docSearch, setDocSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [visibleCount, setVisibleCount] = useState(20)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // Fetch sociétés
  useEffect(() => {
    fetch("/api/client/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      setSocietes(s)
      if (s.length >= 1) setSelectedSociete(s[0].id)
    }).catch(() => {})
  }, [])

  // Fetch documents (scoped to assistant's uploads by the API)
  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/client/documents")
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch {}
    setLoadingDocs(false)
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(loadDocuments, 15000)
    return () => clearInterval(interval)
  }, [loadDocuments])

  // Upload
  const handleUpload = async () => {
    if (!files.length || !selectedSociete) return
    setUploading(true)
    setUploadResults([])
    const results: any[] = []

    for (const file of files) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("societe_id", selectedSociete)

      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        const data = await res.json()
        results.push({
          name: file.name,
          success: res.ok,
          type: data.document?.type_document || "détection...",
          societe: data.document?.societe_detectee || "",
          error: data.error,
        })
      } catch {
        results.push({ name: file.name, success: false, error: "Erreur réseau" })
      }
    }

    setUploadResults(results)
    setFiles([])
    setUploading(false)
    loadDocuments()
  }

  // Delete document
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return
    await fetch(`/api/documents/${id}`, { method: "DELETE" })
    loadDocuments()
  }

  // Drag & Drop
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    setFiles(Array.from(e.dataTransfer.files))
  }

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const stats = {
    total: documents.length,
    traite: documents.filter(d => d.statut === "traite").length,
    erreur: documents.filter(d => d.statut === "erreur").length,
  }

  // Filtered + paginated documents
  const filteredDocs = documents.filter(d => {
    if (docSearch && !d.nom_fichier.toLowerCase().includes(docSearch.toLowerCase())) return false
    if (statusFilter !== "all" && d.statut !== statusFilter) return false
    return true
  })
  const visibleDocs = filteredDocs.slice(0, visibleCount)

  return (
    <div className="p-4 pt-14 md:pt-6 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Espace Assistant</h1>
          <p className="text-sm text-gray-500">Numérisation et envoi de documents</p>
        </div>
        <div className="text-right text-sm text-gray-400">
          <p className="font-medium text-gray-600">{profile?.full_name || ""}</p>
          <p className="capitalize">{today}</p>
        </div>
      </div>

      {/* Société selector */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardContent className="p-4">
          <label className="text-sm font-bold block mb-2" style={{ color: NAVY }}>
            Pour quelle société scannez-vous ?
          </label>
          {societes.length === 0 ? (
            <p className="text-sm text-red-600">Aucune société assignée. Demandez à votre administrateur de vous assigner des sociétés.</p>
          ) : (
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-full text-base h-12">
                <SelectValue placeholder="Sélectionner la société..." />
              </SelectTrigger>
              <SelectContent>
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-base py-2">
                    {s.nom} {s.brn ? `(${s.brn})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Upload zone */}
      <Card className="border-2 border-dashed" style={{ borderColor: GOLD }}>
        <CardContent className="p-6">
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center py-12 rounded-xl cursor-pointer transition-colors ${isDragging ? "bg-amber-50" : "hover:bg-gray-50"}`}
          >
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" className="hidden"
              onChange={e => setFiles(Array.from(e.target.files || []))}
            />
            <Upload className="w-12 h-12 mb-3" style={{ color: GOLD }} />
            <p className="text-lg font-medium" style={{ color: NAVY }}>
              {files.length > 0 ? `${files.length} fichier(s) sélectionné(s)` : "Glissez vos fichiers ici"}
            </p>
            <p className="text-sm text-gray-400 mt-1">PDF, JPEG, PNG, Excel — max 20 MB — Détection automatique du type</p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
            />
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <p key={i} className="text-sm text-gray-600"><FileText className="w-3 h-3 inline mr-1" />{f.name}</p>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="h-12 text-base"
              onClick={(e) => { e.stopPropagation(); cameraRef.current?.click() }}>
              <Camera className="w-5 h-5 mr-2" />Prendre une photo
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !files.length || !selectedSociete}
              className="flex-1 h-12 text-base font-semibold" style={{ backgroundColor: GOLD, color: NAVY }}>
              {uploading ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Analyse en cours...</> : <><Upload className="w-5 h-5 mr-2" />Envoyer pour analyse</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload results */}
      {uploadResults.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {uploadResults.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.success ? "bg-green-50" : "bg-red-50"}`}>
                {r.success ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  {r.success && <p className="text-xs text-green-700">Type détecté : {r.type}{r.societe ? ` — ${r.societe}` : ""}</p>}
                  {r.error && <p className="text-xs text-red-700">{r.error}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Upload className="w-8 h-8 text-blue-600" />
          <div><p className="text-2xl font-bold" style={{ color: NAVY }}>{stats.total}</p><p className="text-xs text-gray-500">Documents</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <div><p className="text-2xl font-bold text-green-600">{stats.traite}</p><p className="text-xs text-gray-500">Traités</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <div><p className="text-2xl font-bold text-red-600">{stats.erreur}</p><p className="text-xs text-gray-500">Erreurs</p></div>
        </CardContent></Card>
      </div>

      {/* Documents table with filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <FileText className="w-5 h-5" />Mes Documents ({filteredDocs.length})
            </h2>
            <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loadingDocs}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loadingDocs ? "animate-spin" : ""}`} />Actualiser
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher par nom de fichier..." className="pl-9 h-8 text-sm" value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="traite">Traité</SelectItem>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="erreur">Erreur</SelectItem>
              </SelectContent>
            </Select>
            {(docSearch || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDocSearch(""); setStatusFilter("all") }}>Effacer</Button>
            )}
          </div>
          {loadingDocs && documents.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>{docSearch || statusFilter !== "all" ? "Aucun document trouvé pour ces filtres" : "Aucun document pour le moment"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fichier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Société</TableHead>
                      <TableHead>Type détecté</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Confiance IA</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDocs.map(d => {
                      const confiance = d.confiance_type ?? d.n8n_result?.routing?.confiance_type ?? null
                      return (
                        <TableRow key={d.id}>
                          <TableCell>
                            <span className="text-sm font-medium truncate max-w-[220px] inline-block" title={d.nom_fichier} style={{ color: NAVY }}>
                              {d.nom_fichier}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(d.created_at)}</TableCell>
                          <TableCell>
                            {d.societe_detectee
                              ? <Badge variant="outline" className="text-xs">{d.societe_detectee}</Badge>
                              : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {d.type_document
                              ? <Badge variant="outline" className="text-xs">{d.type_document}</Badge>
                              : <span className="text-xs text-muted-foreground italic">En attente...</span>}
                          </TableCell>
                          <TableCell>{statutBadge(d.statut)}</TableCell>
                          <TableCell>{confianceBadge(confiance)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {d.storage_path && (
                                <Button variant="ghost" size="sm" title="Télécharger"
                                  onClick={() => window.open(`/api/documents/${d.id}/download`, '_blank')}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {d.storage_path && (d.statut === "erreur" || d.statut === "en_attente") && (
                                <Button variant="ghost" size="sm" className="text-xs" style={{ color: GOLD }}
                                  onClick={async () => {
                                    try {
                                      await fetch(`/api/documents/${d.id}/reanalyze`, {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({}),
                                      })
                                    } catch {}
                                    loadDocuments()
                                  }}>
                                  <RefreshCw className="h-3 w-3 mr-1" />Réessayer
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" title="Supprimer"
                                onClick={() => handleDelete(d.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {filteredDocs.length > visibleCount && (
                <div className="text-center pt-4">
                  <p className="text-xs text-muted-foreground mb-2">Affichage {visibleCount} sur {filteredDocs.length}</p>
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount(v => v + 20)}>Charger plus</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
