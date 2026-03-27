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
  Clock, Download,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Document {
  id: string
  nom_fichier: string
  type_fichier: string
  statut: string
  created_at: string
  categorie?: string
}

function statutBadge(s: string) {
  if (s === "traite" || s === "classe") return <Badge className="bg-green-100 text-green-700">Classé</Badge>
  if (s === "en_cours") return <Badge className="bg-blue-100 text-blue-700">Analyse en cours...</Badge>
  if (s === "en_attente") return <Badge className="bg-gray-100 text-gray-600">En attente</Badge>
  if (s === "erreur" || s === "illisible") return <Badge className="bg-red-100 text-red-700">Erreur</Badge>
  return <Badge variant="outline">{s}</Badge>
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Get client's societes to find the societe_id for uploads
        const socRes = await fetch("/api/comptable/societes")
        const socData = await socRes.json()
        const societes = socData.societes || []
        if (societes.length > 0) {
          setSocieteId(societes[0].id)
        }

        // Fetch documents (from dossiers linked to this client)
        const dosRes = await fetch("/api/admin/dossiers")
        const dosData = await dosRes.json()
        const myDossiers = (dosData.dossiers || []).filter((d: any) => d.client_id === profile?.id)
        const dossierIds = myDossiers.map((d: any) => d.id)

        if (dossierIds.length > 0) {
          // Documents would be fetched here once the documents API supports filtering
          // For now, show empty state
        }
      } catch {
        console.error("Failed to fetch data")
      } finally {
        setLoading(false)
      }
    }
    if (profile?.id) fetchData()
  }, [profile?.id])

  // Auto-provision a personal société + dossier for individual clients
  const autoProvision = async (): Promise<string | null> => {
    if (!profile) return null
    try {
      // Create personal société
      const socRes = await fetch("/api/admin/societes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: `${profile.full_name || profile.email} — Personnel`, brn: null, numero_tva_mra: null, statut_tva: false }),
      })
      const socData = await socRes.json()
      if (!socRes.ok || !socData.societe?.id) return null

      // Create dossier linking client to personal société
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

    // If no société, auto-create a personal one
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
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (res.ok) {
          setDocuments(prev => [{
            id: data.document?.id || crypto.randomUUID(),
            nom_fichier: file.name,
            type_fichier: file.type,
            statut: "en_cours",
            created_at: new Date().toISOString(),
          }, ...prev])
          setUploadSuccess(`${file.name} envoyé avec succès ! L'analyse va classer automatiquement le document.`)
        } else {
          setUploadError(data.error || "Erreur lors de l'envoi")
        }
      } catch {
        setUploadError("Erreur de connexion au serveur")
      }
    }
    setUploading(false)
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
            <p className="text-sm text-muted-foreground">Envoi en cours...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Glissez-déposez vos fichiers ici</p>
            <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, XLSX — max 10 MB</p>
            <p className="text-xs text-muted-foreground mt-1">Le système analyse automatiquement et classe dans le bon dossier</p>
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

      {/* Documents table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
            Mes Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />{doc.nom_fichier}
                  </TableCell>
                  <TableCell>{new Date(doc.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>{statutBadge(doc.statut)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">Aucun document pour le moment.</p>
                    <p className="text-sm text-muted-foreground mt-1">Uploadez vos premiers fichiers ci-dessus.</p>
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
