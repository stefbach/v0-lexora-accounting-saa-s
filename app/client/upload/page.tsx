"use client"

import { useState, useCallback, useRef } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Upload, FileText, FileImage, FileSpreadsheet, X, CloudUpload } from "lucide-react"

interface PreviewFile {
  id: string
  name: string
  size: number
  type: string
}

const uploadHistory = [
  {
    id: "1",
    fichier: "facture_achats_mars_2026.pdf",
    date: "2026-03-24",
    typeDetecte: "Facture fournisseur",
    statut: "Traité",
    societe: "TIBOK",
  },
  {
    id: "2",
    fichier: "releve_MCB_022026.pdf",
    date: "2026-03-22",
    typeDetecte: "Relevé bancaire",
    statut: "Traité",
    societe: "TIBOK",
  },
  {
    id: "3",
    fichier: "facture_vente_00234.pdf",
    date: "2026-03-20",
    typeDetecte: "Facture client",
    statut: "En cours",
    societe: "BPO",
  },
  {
    id: "4",
    fichier: "fiches_paie_mars.xlsx",
    date: "2026-03-19",
    typeDetecte: "Fiche de paie",
    statut: "Traité",
    societe: "BPO",
  },
  {
    id: "5",
    fichier: "facture_electricite.png",
    date: "2026-03-18",
    typeDetecte: "Facture fournisseur",
    statut: "Erreur",
    societe: "TIBOK",
  },
  {
    id: "6",
    fichier: "releve_SBI_022026.pdf",
    date: "2026-03-16",
    typeDetecte: "Relevé bancaire",
    statut: "Traité",
    societe: "BPO",
  },
  {
    id: "7",
    fichier: "facture_fournisseur_orange.jpeg",
    date: "2026-03-14",
    typeDetecte: "Facture fournisseur",
    statut: "Traité",
    societe: "TIBOK",
  },
  {
    id: "8",
    fichier: "facture_vente_00210.pdf",
    date: "2026-03-12",
    typeDetecte: "Facture client",
    statut: "Traité",
    societe: "BPO",
  },
  {
    id: "9",
    fichier: "charges_sociales_feb.pdf",
    date: "2026-03-10",
    typeDetecte: "Fiche de paie",
    statut: "En cours",
    societe: "TIBOK",
  },
  {
    id: "10",
    fichier: "facture_loyer_mars.pdf",
    date: "2026-03-08",
    typeDetecte: "Facture fournisseur",
    statut: "Traité",
    societe: "BPO",
  },
]

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " o"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko"
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo"
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  if (ext === "xlsx") return <FileSpreadsheet className="h-4 w-4 text-green-600" />
  if (ext === "jpeg" || ext === "jpg" || ext === "png")
    return <FileImage className="h-4 w-4 text-purple-600" />
  return <FileText className="h-4 w-4 text-blue-600" />
}

function getTypeBadge(type: string) {
  switch (type) {
    case "Facture fournisseur":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">{type}</Badge>
    case "Facture client":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{type}</Badge>
    case "Relevé bancaire":
      return <Badge className="bg-purple-100 text-purple-700 border-purple-200">{type}</Badge>
    case "Fiche de paie":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{type}</Badge>
    default:
      return <Badge variant="secondary">{type}</Badge>
  }
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Traité":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Traité</Badge>
    case "En cours":
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">En cours</Badge>
    case "Erreur":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Erreur</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<PreviewFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const addFiles = useCallback((fileList: FileList) => {
    const newFiles: PreviewFile[] = Array.from(fileList)
      .filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase()
        return ["pdf", "jpeg", "jpg", "png", "xlsx"].includes(ext || "")
      })
      .filter((f) => f.size <= 10 * 1024 * 1024)
      .map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        type: f.type,
      }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files)
      }
    },
    [addFiles]
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Upload de Documents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importez vos factures, relevés bancaires et autres documents comptables.
        </p>
      </div>

      {/* Drop Zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
              dragActive
                ? "border-[#C9A84C] bg-[#C9A84C]/5"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <CloudUpload
              className="h-12 w-12 mb-4"
              style={{ color: dragActive ? "#C9A84C" : "#9CA3AF" }}
            />
            <p className="text-lg font-medium" style={{ color: "#1E2A4A" }}>
              Glissez-déposez vos fichiers ici
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              PDF, JPEG, PNG, XLSX (max 10 Mo)
            </p>
            <Button
              style={{ backgroundColor: "#C9A84C" }}
              className="text-white hover:opacity-90"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Parcourir
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpeg,.jpg,.png,.xlsx"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* File Preview List */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                Fichiers sélectionnés ({files.length})
              </p>
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border bg-white p-3"
                >
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.name)}
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeFile(file.id)}
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                className="mt-2 text-white"
                style={{ backgroundColor: "#1E2A4A" }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Envoyer {files.length} fichier{files.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>Historique des uploads</CardTitle>
          <CardDescription>Tous vos documents importés récemment</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type détecté</TableHead>
                <TableHead>Statut traitement</TableHead>
                <TableHead>Société détectée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploadHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {getFileIcon(item.fichier)}
                      <span className="truncate max-w-[220px]">{item.fichier}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{getTypeBadge(item.typeDetecte)}</TableCell>
                  <TableCell>{getStatutBadge(item.statut)}</TableCell>
                  <TableCell>{item.societe}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
