"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Upload, FolderOpen, Loader2, FileText, CheckCircle,
  Clock, Download, ChevronRight, Lock, AlertTriangle,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Document {
  id: string
  nom_fichier: string
  type_fichier: string
  type_document: string | null
  statut: string
  storage_path: string | null
  created_at: string
  societe_detectee: string | null
  n8n_result?: { error?: string; routing?: any; extraction?: any } | null
}

interface Folder {
  key: string
  label: string
  readOnly: boolean
}

const FOLDERS: Folder[] = [
  { key: "recent", label: "Envois Récents", readOnly: false },
  { key: "facture_fournisseur", label: "Factures Fournisseurs", readOnly: false },
  { key: "facture_client", label: "Factures Clients", readOnly: false },
  { key: "releve_bancaire", label: "Relevés Bancaires", readOnly: false },
  { key: "fiche_paie", label: "Fiches de Paie", readOnly: false },
  { key: "charges_sociales", label: "Cotisations Sociales", readOnly: false },
  { key: "contrat", label: "Contrats", readOnly: false },
  { key: "rapport", label: "Rapports Mensuels", readOnly: true },
  { key: "autre", label: "Autres Documents", readOnly: false },
]

function statutBadge(s: string) {
  if (s === "traite") return <Badge className="bg-green-100 text-green-700">Classé</Badge>
  if (s === "en_cours" || s === "en_attente") return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Analyse en cours...</Badge>
  if (s === "erreur") return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />Erreur</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function getDocsForFolder(docs: Document[], folderKey: string): Document[] {
  if (folderKey === "recent") {
    // Show recent uploads (last 7 days) or unclassified docs
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return docs.filter(d =>
      new Date(d.created_at) >= sevenDaysAgo || !d.type_document || d.statut === "en_attente" || d.statut === "en_cours"
    )
  }
  if (folderKey === "rapport") {
    return docs.filter(d => d.type_document === "rapport" || d.type_document === "rapport_mensuel")
  }
  return docs.filter(d => d.type_document === folderKey)
}

export default function ClientDocumentsPage() {
  const { profile } = useProfile()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState("recent")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/client/documents")
      const data = await res.json()
      if (data.documents) setDocuments(data.documents)
    } catch {
      console.error("Failed to fetch documents")
    }
  }, [])

  useEffect(() => {
    async function init() {
      try {
        // Get societe_id for uploads
        const dosRes = await fetch("/api/admin/dossiers")
        const dosData = await dosRes.json()
        const myDossiers = (dosData.dossiers || []).filter((d: any) => d.client_id === profile?.id)
        if (myDossiers.length > 0) {
          setSocieteId(myDossiers[0].societe_id)
        }

        await fetchDocuments()
      } catch {
        console.error("Failed to init")
      } finally {
        setLoading(false)
      }
    }
    if (profile?.id) init()
  }, [profile?.id, fetchDocuments])

  // Auto-refresh documents every 10 seconds to pick up processing results
  useEffect(() => {
    if (!profile?.id) return
    const interval = setInterval(fetchDocuments, 10000)
    return () => clearInterval(interval)
  }, [profile?.id, fetchDocuments])

  const autoProvision = async (): Promise<string | null> => {
    if (!profile) return null
    try {
      const socRes = await fetch("/api/admin/societes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: `${profile.full_name || profile.email} — Personnel`, brn: null, numero_tva_mra: null, statut_tva: false }),
      })
      const socData = await socRes.json()
      if (!socRes.ok || !socData.societe?.id) return null

      await fetch("/api/admin/dossiers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: profile.id, societe_id: socData.societe.id, comptable_id: null }),
      })

      setSocieteId(socData.societe.id)
      return socData.societe.id
    } catch {
      return null
    }
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    let uploadSocieteId = societeId
    if (!uploadSocieteId) {
      uploadSocieteId = await autoProvision()
      if (!uploadSocieteId) {
        setUploadError("Impossible de créer votre espace personnel. Contactez votre comptable.")
        setTimeout(() => setUploadError(null), 5000)
        return
      }
    }

    setUploading(true)
    setUploadSuccess(null)
    setUploadError(null)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("societe_id", uploadSocieteId)

      try {
        // Step 1: Upload (fast — just saves file)
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (res.ok && data.document) {
          const doc = data.document
          const docType = doc.type_document || null
          const docStatut = doc.statut || "en_attente"
          setDocuments(prev => [{
            id: doc.id,
            nom_fichier: file.name,
            type_fichier: file.type.split("/").pop() || "pdf",
            type_document: docType,
            statut: docStatut,
            storage_path: doc.storage_path || null,
            created_at: new Date().toISOString(),
            societe_detectee: doc.societe_detectee || null,
          }, ...prev])
          if (docStatut === "traite" && docType) {
            const folderLabel = FOLDERS.find(f => f.key === docType)?.label || docType
            setUploadSuccess(`${file.name} analysé et classé dans "${folderLabel}" !`)
          } else {
            setUploadSuccess(`${file.name} envoyé !`)
          }
        } else {
          setUploadError(data.error || "Erreur lors de l'envoi")
        }
      } catch {
        setUploadError("Erreur de connexion au serveur")
      }
    }
    setUploading(false)
    setSelectedFolder("recent")
    setTimeout(() => { setUploadSuccess(null); setUploadError(null) }, 6000)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files)
  }, [societeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  const currentFolder = FOLDERS.find(f => f.key === selectedFolder) || FOLDERS[0]
  const currentDocs = getDocsForFolder(documents, selectedFolder)

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes Documents</h1>
        <p className="text-sm text-muted-foreground">
          Envoyez et consultez tous vos documents comptables
        </p>
      </div>

      {/* Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? "border-amber-400 bg-amber-50" : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
      >
        <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.jpeg,.jpg,.png,.xlsx" onChange={(e) => handleUpload(e.target.files)} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
            <p className="text-sm text-muted-foreground">Analyse en cours...</p>
            <p className="text-xs text-muted-foreground">Votre document sera classé automatiquement dans le bon dossier</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Glissez-déposez vos fichiers ici</p>
            <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, XLSX — max 10 MB</p>
            <p className="text-xs text-muted-foreground mt-1">Le système analyse et classe automatiquement dans le bon dossier</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => fileInputRef.current?.click()}>Parcourir</Button>
          </div>
        )}
      </div>

      {uploadSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />{uploadSuccess}
        </div>
      )}
      {uploadError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {uploadError}
        </div>
      )}

      {/* Folder list */}
      <div>
        <h3 className="font-semibold mb-3" style={{ color: NAVY }}>Mes Dossiers</h3>
        <div className="grid gap-2">
          {FOLDERS.map((folder) => {
            const count = getDocsForFolder(documents, folder.key).length
            const isSelected = selectedFolder === folder.key
            return (
              <Card
                key={folder.key}
                className={`cursor-pointer transition-colors ${count === 0 && !isSelected ? "opacity-60" : ""} ${isSelected ? "ring-2" : "hover:bg-muted/50"}`}
                style={isSelected ? { borderColor: GOLD } : undefined}
                onClick={() => setSelectedFolder(folder.key)}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{folder.label}</p>
                        {folder.readOnly && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {count} document{count !== 1 ? "s" : ""}{count === 0 ? " — vide" : ""}
                        {folder.readOnly ? " — rempli par votre comptable" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {folder.key === "recent" && documents.some(d => d.statut === "en_attente" || d.statut === "en_cours") && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />En cours
                      </Badge>
                    )}
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Selected folder content */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
              {currentFolder.label}
              {currentFolder.readOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
            {!currentFolder.readOnly && (
              <Button size="sm" style={{ backgroundColor: GOLD }} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" />Uploader ici
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type détecté</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentDocs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />{doc.nom_fichier}
                  </TableCell>
                  <TableCell>{new Date(doc.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>
                    {doc.type_document ? (
                      <Badge variant="outline" className="text-xs">
                        {FOLDERS.find(f => f.key === doc.type_document)?.label || doc.type_document}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">En attente...</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {statutBadge(doc.statut)}
                    {doc.statut === "erreur" && doc.n8n_result?.error && (
                      <p className="text-xs text-red-500 mt-1">{doc.n8n_result.error}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button>
                      {(doc.statut === "erreur" || doc.statut === "en_attente" || doc.statut === "en_cours") && doc.storage_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          style={{ color: GOLD }}
                          onClick={async () => {
                            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, statut: "en_cours" } : d))
                            try {
                              const res = await fetch("/api/documents/process", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  document_id: doc.id,
                                  storage_path: doc.storage_path,
                                  nom_fichier: doc.nom_fichier,
                                  client_id: profile?.id,
                                }),
                              })
                              const data = await res.json()
                              if (data.success) {
                                // Refresh documents list to get updated data
                                await fetchDocuments()
                              }
                            } catch {
                              await fetchDocuments()
                            }
                          }}
                        >
                          Réessayer
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {currentDocs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">Aucun document dans ce dossier.</p>
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
