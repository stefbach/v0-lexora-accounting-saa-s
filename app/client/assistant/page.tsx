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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2, Trash2, RefreshCw,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

const CATEGORIES = [
  { value: "facture_fournisseur", label: "Facture fournisseur" },
  { value: "facture_client", label: "Facture client" },
  { value: "releve_bancaire", label: "Releve bancaire" },
  { value: "fiche_de_paie", label: "Fiche de paie" },
  { value: "charges_sociales", label: "Charges sociales" },
  { value: "contrat", label: "Contrat" },
  { value: "autre", label: "Autre" },
]

interface Societe {
  id: string
  nom: string
}

interface UploadResult {
  fileName: string
  typeDetecte: string | null
  statut: "traite" | "en_cours" | "erreur"
  message?: string
}

interface RecentDocument {
  id: string
  nom_fichier: string
  type_document: string | null
  societe_nom: string | null
  statut_ocr: string
  created_at: string
}

export default function AssistantPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [stats, setStats] = useState({ uploaded: 0, treated: 0, errors: 0 })
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // Load societes
  useEffect(() => {
    async function loadSocietes() {
      try {
        const res = await fetch("/api/societes")
        if (res.ok) {
          const data = await res.json()
          const list = data.societes || data || []
          setSocietes(list)
          if (list.length === 1) {
            setSelectedSociete(list[0].id)
          }
        }
      } catch {
        // ignore
      }
    }
    loadSocietes()
  }, [])

  // Load recent documents
  const loadRecentDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents?limit=20")
      if (res.ok) {
        const data = await res.json()
        const docs = data.documents || data || []
        setRecentDocs(docs)

        // Calculate stats
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const thisMonth = docs.filter(
          (d: RecentDocument) => new Date(d.created_at) >= startOfMonth
        )
        setStats({
          uploaded: thisMonth.length,
          treated: thisMonth.filter(
            (d: RecentDocument) => d.statut_ocr === "traite"
          ).length,
          errors: thisMonth.filter(
            (d: RecentDocument) => d.statut_ocr === "erreur"
          ).length,
        })
      }
    } catch {
      // ignore
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    loadRecentDocs()
    const interval = setInterval(loadRecentDocs, 30000)
    return () => clearInterval(interval)
  }, [loadRecentDocs])

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files)
      setFiles((prev) => [...prev, ...newFiles])
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Upload
  const handleUpload = async () => {
    if (files.length === 0 || !selectedSociete) return

    setUploading(true)
    setUploadProgress(0)
    setUploadResults([])

    const results: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const formData = new FormData()
      formData.append("file", file)
      formData.append("societe_id", selectedSociete)
      if (selectedCategory) {
        formData.append("category", selectedCategory)
      }

      try {
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        })
        const data = await res.json()

        if (res.ok) {
          results.push({
            fileName: file.name,
            typeDetecte: data.type_document || selectedCategory || null,
            statut: "en_cours",
          })
        } else {
          results.push({
            fileName: file.name,
            typeDetecte: null,
            statut: "erreur",
            message: data.error || "Erreur lors de l'envoi",
          })
        }
      } catch {
        results.push({
          fileName: file.name,
          typeDetecte: null,
          statut: "erreur",
          message: "Erreur reseau",
        })
      }

      setUploadProgress(Math.round(((i + 1) / files.length) * 100))
    }

    setUploadResults(results)
    setUploading(false)
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    loadRecentDocs()
  }

  // Reanalyze
  const handleReanalyze = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}/reanalyze`, { method: "POST" })
      loadRecentDocs()
    } catch {
      // ignore
    }
  }

  // Delete
  const handleDelete = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}`, { method: "DELETE" })
      loadRecentDocs()
    } catch {
      // ignore
    }
  }

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case "en_attente":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-700">En attente</Badge>
      case "en_cours":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">En cours</Badge>
      case "traite":
        return <Badge variant="secondary" className="bg-green-100 text-green-700">Traite</Badge>
      case "erreur":
        return <Badge variant="destructive">Erreur</Badge>
      default:
        return <Badge variant="secondary">{statut}</Badge>
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              Espace Assistant
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Collecte et numerisation des documents
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p className="font-medium" style={{ color: NAVY }}>
              {profile?.full_name || "Assistant"}
            </p>
            <p className="capitalize">{today}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Section 1 - Upload Zone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg" style={{ color: NAVY }}>
              <Upload className="w-5 h-5" />
              Envoi de documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Societe
                </label>
                <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectionner une societe" />
                  </SelectTrigger>
                  <SelectContent>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categorie
                </label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectionner une categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl cursor-pointer
                flex flex-col items-center justify-center text-center
                transition-colors min-h-[200px] p-8
                ${
                  dragActive
                    ? "border-[#C9A84C] bg-[#C9A84C]/5"
                    : "border-gray-300 hover:border-[#C9A84C] hover:bg-gray-50"
                }
              `}
            >
              <Upload
                className="w-12 h-12 mb-3"
                style={{ color: dragActive ? GOLD : "#9CA3AF" }}
              />
              <p className="text-base font-medium" style={{ color: NAVY }}>
                Glissez vos fichiers ici ou cliquez pour parcourir
              </p>
              <p className="text-sm text-gray-400 mt-1">
                PDF, JPEG, PNG, XLSX — Plusieurs fichiers possibles
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Selected Files */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  {files.length} fichier(s) selectionne(s)
                </p>
                <div className="space-y-1">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-gray-400 flex-shrink-0">
                          ({(file.size / 1024).toFixed(0)} Ko)
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(index)
                        }}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Envoi en cours... {uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${uploadProgress}%`,
                      backgroundColor: GOLD,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || !selectedSociete || uploading}
              className="w-full text-base py-6 font-semibold"
              style={{
                backgroundColor:
                  files.length === 0 || !selectedSociete || uploading
                    ? "#D1D5DB"
                    : GOLD,
                color:
                  files.length === 0 || !selectedSociete || uploading
                    ? "#9CA3AF"
                    : NAVY,
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Envoyer pour analyse OCR
                </>
              )}
            </Button>

            {/* Upload Results */}
            {uploadResults.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <p className="text-sm font-medium" style={{ color: NAVY }}>
                    Resultats de l&apos;envoi
                  </p>
                </div>
                <div className="divide-y">
                  {uploadResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {result.statut === "erreur" ? (
                          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : result.statut === "traite" ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                        )}
                        <span className="truncate">{result.fileName}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {result.typeDetecte && (
                          <span className="text-gray-500">
                            {result.typeDetecte}
                          </span>
                        )}
                        {getStatutBadge(result.statut)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3 - Statistiques simples */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${NAVY}10` }}
                >
                  <Upload className="w-5 h-5" style={{ color: NAVY }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: NAVY }}>
                    {stats.uploaded}
                  </p>
                  <p className="text-xs text-gray-500">
                    Documents uploades ce mois
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-50">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700">
                    {stats.treated}
                  </p>
                  <p className="text-xs text-gray-500">Documents traites</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">
                    {stats.errors}
                  </p>
                  <p className="text-xs text-gray-500">Documents en erreur</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 2 - Documents recents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle
                className="flex items-center gap-2 text-lg"
                style={{ color: NAVY }}
              >
                <FileText className="w-5 h-5" />
                Documents recents
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadRecentDocs}
                className="text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Actualiser
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDocs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  className="w-6 h-6 animate-spin"
                  style={{ color: GOLD }}
                />
              </div>
            ) : recentDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2" />
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
                      <TableHead>Societe</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                          {new Date(doc.created_at).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">
                          {doc.nom_fichier}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {doc.type_document || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {doc.societe_nom || "-"}
                        </TableCell>
                        <TableCell>
                          {getStatutBadge(doc.statut_ocr)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.statut_ocr === "erreur" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReanalyze(doc.id)}
                                className="text-xs h-7 px-2"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Reanalyser
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(doc.id)}
                              className="text-xs h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
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
    </div>
  )
}
