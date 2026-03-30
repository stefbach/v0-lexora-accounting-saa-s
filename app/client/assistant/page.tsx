"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCw, Trash2 } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
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
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch sociétés
  useEffect(() => {
    fetch("/api/client/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      setSocietes(s)
      if (s.length === 1) setSelectedSociete(s[0].id)
      else if (s.length > 1) setSelectedSociete(s[0].id)
    }).catch(() => {})
  }, [])

  // Fetch recent documents
  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true)
    try {
      const res = await fetch("/api/client/financial")
      const data = await res.json()
      const allDocs = data.financial?.ecritures ? [] : []
      // Use a simple documents fetch
      const docRes = await fetch(`/api/comptable/documents`)
      const docData = await docRes.json()
      setDocuments((docData.documents || []).slice(0, 30))
    } catch {}
    setLoadingDocs(false)
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadDocuments, 30000)
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
          type: data.document?.type_document || "detection...",
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

  return (
    <div className="p-4 pt-14 md:pt-6 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Espace Assistant</h1>
          <p className="text-sm text-gray-500">Numerisation et envoi de documents</p>
        </div>
        <div className="text-right text-sm text-gray-400">
          <p className="font-medium text-gray-600">{profile?.full_name || ""}</p>
          <p className="capitalize">{today}</p>
        </div>
      </div>

      {/* Société selector — ALWAYS visible for assistant */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardContent className="p-4">
          <label className="text-sm font-bold block mb-2" style={{ color: NAVY }}>
            Pour quelle societe scannez-vous ?
          </label>
          {societes.length === 0 ? (
            <p className="text-sm text-red-600">Aucune societe assignee. Demandez a votre administrateur de vous assigner des societes.</p>
          ) : (
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-full text-base h-12">
                <SelectValue placeholder="Selectionner la societe..." />
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
              {files.length > 0 ? `${files.length} fichier(s) selectionne(s)` : "Glissez vos fichiers ici"}
            </p>
            <p className="text-sm text-gray-400 mt-1">PDF, JPEG, PNG, Excel — Detection automatique du type</p>
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <p key={i} className="text-sm text-gray-600"><FileText className="w-3 h-3 inline mr-1" />{f.name}</p>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={handleUpload}
            disabled={uploading || !files.length || !selectedSociete}
            className="w-full mt-4 h-12 text-base font-semibold"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            {uploading ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Analyse en cours...</> : <><Upload className="w-5 h-5 mr-2" />Envoyer pour analyse</>}
          </Button>
        </CardContent>
      </Card>

      {/* Upload results */}
      {uploadResults.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {uploadResults.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.success ? "bg-green-50" : "bg-red-50"}`}>
                {r.success ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  {r.success && <p className="text-xs text-green-700">Type detecte : {r.type}{r.societe ? ` — ${r.societe}` : ""}</p>}
                  {r.error && <p className="text-xs text-red-700">{r.error}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Upload className="w-8 h-8 text-blue-600" />
          <div><p className="text-2xl font-bold" style={{ color: NAVY }}>{stats.total}</p><p className="text-xs text-gray-500">Documents</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <div><p className="text-2xl font-bold text-green-600">{stats.traite}</p><p className="text-xs text-gray-500">Traites</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <div><p className="text-2xl font-bold text-red-600">{stats.erreur}</p><p className="text-xs text-gray-500">Erreurs</p></div>
        </CardContent></Card>
      </div>

      {/* Recent documents */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <FileText className="w-5 h-5" />Documents recents
            </h2>
            <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loadingDocs}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loadingDocs ? "animate-spin" : ""}`} />Actualiser
            </Button>
          </div>
          {loadingDocs && documents.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Aucun document pour le moment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Type detecte</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(d.created_at)}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">{d.nom_fichier}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{d.type_document || "detection..."}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${
                          d.statut === "traite" ? "bg-green-100 text-green-700" :
                          d.statut === "erreur" ? "bg-red-100 text-red-700" :
                          d.statut === "en_cours" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {d.statut === "traite" ? "Traite" : d.statut === "erreur" ? "Erreur" : d.statut === "en_cours" ? "En cours" : "En attente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} title="Supprimer">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
