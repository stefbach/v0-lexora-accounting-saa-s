"use client"

import { useState, useCallback } from "react"
import { useProfile } from "@/hooks/use-profile"
import { toast } from "sonner"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Upload,
  FileText,
  FolderOpen,
  Folder,
  Lock,
  Eye,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  HelpCircle,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FolderItem {
  id: string
  nom: string
  count: number
  readOnly?: boolean
}

interface DocumentItem {
  id: string
  fichier: string
  date: string
  analysePar: "Lexora" | "Votre comptable" | "En attente..."
  statut: "En attente" | "Analyse en cours" | "Classe" | "Question du comptable" | "Document illisible"
}

// ---------------------------------------------------------------------------
// Mock folders
// ---------------------------------------------------------------------------

const mockFolders: FolderItem[] = [
  { id: "envois", nom: "Mes Envois Recents", count: 5 },
  { id: "factures-recues", nom: "Factures que j'ai recues", count: 8 },
  { id: "factures-envoyees", nom: "Mes Factures envoyees", count: 12 },
  { id: "releves", nom: "Releves Bancaires", count: 3 },
  { id: "fiches-paie", nom: "Fiches de Paie", count: 17 },
  { id: "cotisations", nom: "Cotisations Sociales", count: 6 },
  { id: "tva-impots", nom: "TVA & Impots", count: 4, readOnly: true },
  { id: "contrats", nom: "Mes Contrats", count: 5 },
  { id: "immobilisations", nom: "Immobilisations", count: 2 },
  { id: "rapports", nom: "Rapports Mensuels", count: 3, readOnly: true },
  { id: "autres", nom: "Autres Documents", count: 2 },
]

// ---------------------------------------------------------------------------
// Mock documents per folder
// ---------------------------------------------------------------------------

const mockDocsByFolder: Record<string, DocumentItem[]> = {
  envois: [
    { id: "e1", fichier: "facture_mars_2026.pdf", date: "25/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "e2", fichier: "releve_MCB_fev.pdf", date: "22/03/2026", analysePar: "En attente...", statut: "En attente" },
    { id: "e3", fichier: "facture_orange_mars.jpeg", date: "20/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "e4", fichier: "fiche_paie_mars.xlsx", date: "18/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "e5", fichier: "note_frais_mars.pdf", date: "15/03/2026", analysePar: "En attente...", statut: "En attente" },
  ],
  "factures-recues": [
    { id: "fr1", fichier: "facture_CEB_mars.pdf", date: "24/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fr2", fichier: "facture_CWA_mars.pdf", date: "23/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fr3", fichier: "facture_Orange_fev.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fr4", fichier: "facture_loyer_mars.pdf", date: "18/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "fr5", fichier: "facture_fournitures.pdf", date: "15/03/2026", analysePar: "En attente...", statut: "En attente" },
    { id: "fr6", fichier: "facture_imprimante.jpeg", date: "12/03/2026", analysePar: "Lexora", statut: "Document illisible" },
    { id: "fr7", fichier: "facture_assurance.pdf", date: "10/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fr8", fichier: "facture_nettoyage.pdf", date: "08/03/2026", analysePar: "Lexora", statut: "Question du comptable" },
  ],
  "factures-envoyees": [
    { id: "fe1", fichier: "facture_client_0456.pdf", date: "25/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fe2", fichier: "facture_client_0455.pdf", date: "23/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fe3", fichier: "facture_client_0454.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fe4", fichier: "facture_client_0453.pdf", date: "18/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fe5", fichier: "facture_client_0452.pdf", date: "15/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "fe6", fichier: "facture_client_0451.pdf", date: "12/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fe7", fichier: "facture_client_0450.pdf", date: "10/03/2026", analysePar: "Lexora", statut: "Classe" },
  ],
  releves: [
    { id: "r1", fichier: "releve_MCB_mars.pdf", date: "25/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "r2", fichier: "releve_SBI_fev.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "r3", fichier: "releve_MCB_fev.pdf", date: "15/03/2026", analysePar: "Lexora", statut: "Classe" },
  ],
  "fiches-paie": [
    { id: "fp1", fichier: "fiche_paie_equipe_mars.xlsx", date: "25/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fp2", fichier: "fiche_paie_dupont_mars.pdf", date: "24/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fp3", fichier: "fiche_paie_martin_mars.pdf", date: "24/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fp4", fichier: "fiche_paie_equipe_fev.xlsx", date: "22/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fp5", fichier: "fiche_paie_jean_fev.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "fp6", fichier: "fiche_paie_claire_fev.pdf", date: "18/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "fp7", fichier: "fiche_paie_lucas_fev.pdf", date: "15/03/2026", analysePar: "En attente...", statut: "En attente" },
  ],
  cotisations: [
    { id: "c1", fichier: "CSG_Q1_2026.pdf", date: "24/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "c2", fichier: "NSF_Q1_2026.pdf", date: "22/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "c3", fichier: "PRGF_mars.pdf", date: "20/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "c4", fichier: "CSG_Q4_2025.pdf", date: "15/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "c5", fichier: "NSF_Q4_2025.pdf", date: "10/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "c6", fichier: "cotisation_recap_2025.pdf", date: "05/03/2026", analysePar: "Votre comptable", statut: "Classe" },
  ],
  "tva-impots": [
    { id: "t1", fichier: "declaration_TVA_fev.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "t2", fichier: "avis_imposition_2025.pdf", date: "15/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "t3", fichier: "TVA_Q4_2025.pdf", date: "10/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "t4", fichier: "tax_return_2025.pdf", date: "05/03/2026", analysePar: "Votre comptable", statut: "Classe" },
  ],
  contrats: [
    { id: "co1", fichier: "contrat_bail_2026.pdf", date: "22/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "co2", fichier: "contrat_emploi_dupont.pdf", date: "18/03/2026", analysePar: "Lexora", statut: "Classe" },
    { id: "co3", fichier: "contrat_assurance.pdf", date: "15/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "co4", fichier: "contrat_fournisseur.pdf", date: "10/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
    { id: "co5", fichier: "avenant_bail.pdf", date: "05/03/2026", analysePar: "Votre comptable", statut: "Question du comptable" },
  ],
  immobilisations: [
    { id: "i1", fichier: "achat_vehicule_2026.pdf", date: "20/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "i2", fichier: "facture_mobilier.pdf", date: "12/03/2026", analysePar: "Lexora", statut: "Classe" },
  ],
  rapports: [
    { id: "ra1", fichier: "rapport_mars_2026.pdf", date: "25/03/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "ra2", fichier: "rapport_fev_2026.pdf", date: "22/02/2026", analysePar: "Votre comptable", statut: "Classe" },
    { id: "ra3", fichier: "rapport_jan_2026.pdf", date: "22/01/2026", analysePar: "Votre comptable", statut: "Classe" },
  ],
  autres: [
    { id: "a1", fichier: "photo_local.jpeg", date: "18/03/2026", analysePar: "Lexora", statut: "Document illisible" },
    { id: "a2", fichier: "doc_divers.pdf", date: "10/03/2026", analysePar: "En attente...", statut: "En attente" },
  ],
}

// ---------------------------------------------------------------------------
// Mock recent uploads for client_user
// ---------------------------------------------------------------------------

const mockRecentUploads: DocumentItem[] = [
  { id: "u1", fichier: "facture_mars_2026.pdf", date: "25/03/2026", analysePar: "Lexora", statut: "Classe" },
  { id: "u2", fichier: "releve_MCB_fev.pdf", date: "22/03/2026", analysePar: "En attente...", statut: "En attente" },
  { id: "u3", fichier: "facture_orange.jpeg", date: "20/03/2026", analysePar: "Lexora", statut: "Analyse en cours" },
  { id: "u4", fichier: "fiche_paie_mars.xlsx", date: "18/03/2026", analysePar: "Votre comptable", statut: "Classe" },
  { id: "u5", fichier: "note_frais.pdf", date: "15/03/2026", analysePar: "En attente...", statut: "En attente" },
]

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatutBadge({ statut }: { statut: DocumentItem["statut"] }) {
  switch (statut) {
    case "En attente":
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 flex items-center gap-1">
          <Clock className="h-3 w-3" /> En attente
        </Badge>
      )
    case "Analyse en cours":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Analyse en cours
        </Badge>
      )
    case "Classe":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Classe
        </Badge>
      )
    case "Question du comptable":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1">
          <HelpCircle className="h-3 w-3" /> Question du comptable
        </Badge>
      )
    case "Document illisible":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 flex items-center gap-1">
          <XCircle className="h-3 w-3" /> Document illisible
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Upload Sheet (shared between admin and user)
// ---------------------------------------------------------------------------

function UploadSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [description, setDescription] = useState("")
  const [mois, setMois] = useState("")
  const [annee, setAnnee] = useState("2026")
  const [societe, setSociete] = useState("")
  const [sending, setSending] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }, [])

  const handleSubmit = useCallback(async () => {
    setSending(true)
    // Mock API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setSending(false)
    toast.success("Document envoye ! Analyse en cours...")
    setSelectedFile(null)
    setDescription("")
    setMois("")
    setSociete("")
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle style={{ color: "#1E2A4A" }}>Uploader un document</SheetTitle>
          <SheetDescription>
            Deposez votre fichier et remplissez les informations.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-6">
          {/* Drag & drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${dragOver
                ? "border-[#C9A84C] bg-[#C9A84C]/10"
                : "border-gray-300 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5"
              }
            `}
          >
            {selectedFile ? (
              <div className="space-y-2">
                <FileText className="h-8 w-8 mx-auto" style={{ color: "#C9A84C" }} />
                <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-red-500"
                >
                  Retirer
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: "#1E2A4A" }} />
                <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                  Glissez votre fichier ici
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPEG, PNG, XLSX — max 10 MB
                </p>
                <label>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpeg,.jpg,.png,.xlsx"
                    onChange={handleFileSelect}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    asChild
                  >
                    <span>Choisir un fichier</span>
                  </Button>
                </label>
              </>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optionnel)</Label>
            <Textarea
              id="description"
              placeholder="Ex: Facture electricite du mois de mars"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mois</Label>
              <Select value={mois} onValueChange={setMois}>
                <SelectTrigger>
                  <SelectValue placeholder="Mois" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="01">Janvier</SelectItem>
                  <SelectItem value="02">Fevrier</SelectItem>
                  <SelectItem value="03">Mars</SelectItem>
                  <SelectItem value="04">Avril</SelectItem>
                  <SelectItem value="05">Mai</SelectItem>
                  <SelectItem value="06">Juin</SelectItem>
                  <SelectItem value="07">Juillet</SelectItem>
                  <SelectItem value="08">Aout</SelectItem>
                  <SelectItem value="09">Septembre</SelectItem>
                  <SelectItem value="10">Octobre</SelectItem>
                  <SelectItem value="11">Novembre</SelectItem>
                  <SelectItem value="12">Decembre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Annee</Label>
              <Select value={annee} onValueChange={setAnnee}>
                <SelectTrigger>
                  <SelectValue placeholder="Annee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Societe */}
          <div className="space-y-2">
            <Label>Societe</Label>
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une societe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tibok">TIBOK Ltd</SelectItem>
                <SelectItem value="bpo">BPO Services Ltd</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            className="w-full text-white"
            style={{ backgroundColor: "#C9A84C" }}
            disabled={!selectedFile || sending}
            onClick={handleSubmit}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Envoyer
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Document table component
// ---------------------------------------------------------------------------

function DocumentTable({ documents }: { documents: DocumentItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50">
          <TableHead className="font-semibold">Fichier</TableHead>
          <TableHead className="font-semibold">Date</TableHead>
          <TableHead className="font-semibold">Analyse par</TableHead>
          <TableHead className="font-semibold">Statut</TableHead>
          <TableHead className="font-semibold text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[220px]">{doc.fichier}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{doc.date}</TableCell>
            <TableCell>
              <span
                className={`text-sm ${
                  doc.analysePar === "En attente..."
                    ? "text-gray-400 italic"
                    : doc.analysePar === "Lexora"
                    ? "font-medium"
                    : "text-muted-foreground"
                }`}
                style={doc.analysePar === "Lexora" ? { color: "#C9A84C" } : undefined}
              >
                {doc.analysePar}
              </span>
            </TableCell>
            <TableCell>
              <StatutBadge statut={doc.statut} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-[#1E2A4A]"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-[#C9A84C]"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {documents.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
              Aucun document dans ce dossier.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// Client User view — simple upload + recent list
// ---------------------------------------------------------------------------

function ClientUserDocuments() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Documents
        </h1>
        <Button
          className="text-white"
          style={{ backgroundColor: "#C9A84C" }}
          onClick={() => setSheetOpen(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Uploader un document
        </Button>
      </div>

      <UploadSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-semibold" style={{ color: "#1E2A4A" }}>
              Mes envois recents
            </h2>
          </div>
          <DocumentTable documents={mockRecentUploads} />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Client Admin view — full folder tree + documents
// ---------------------------------------------------------------------------

function ClientAdminDocuments() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState("envois")

  const currentFolder = mockFolders.find((f) => f.id === selectedFolder)
  const currentDocs = mockDocsByFolder[selectedFolder] || []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Documents
        </h1>
        <Button
          className="text-white"
          style={{ backgroundColor: "#C9A84C" }}
          onClick={() => setSheetOpen(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Uploader un document
        </Button>
      </div>

      <UploadSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Folder tree (1/3) */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-2">
              <TooltipProvider>
                <nav className="space-y-0.5">
                  {mockFolders.map((folder) => {
                    const isSelected = selectedFolder === folder.id
                    return (
                      <button
                        key={folder.id}
                        onClick={() => !folder.readOnly || true ? setSelectedFolder(folder.id) : null}
                        className={`
                          w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-left text-sm
                          transition-colors cursor-pointer
                          ${isSelected
                            ? "bg-[#C9A84C]/10 font-semibold"
                            : "hover:bg-slate-50"
                          }
                        `}
                        style={isSelected ? { color: "#C9A84C" } : { color: "#1E2A4A" }}
                      >
                        {isSelected ? (
                          <FolderOpen className="h-4 w-4 shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0" />
                        )}
                        <span className="flex-1 truncate">{folder.nom}</span>
                        <span className="text-xs text-muted-foreground">{folder.count}</span>
                        {folder.readOnly && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Rempli par votre comptable</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </button>
                    )
                  })}
                </nav>
              </TooltipProvider>
            </CardContent>
          </Card>
        </div>

        {/* Right — Documents (2/3) */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" style={{ color: "#C9A84C" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "#1E2A4A" }}>
                    {currentFolder?.nom}
                  </h2>
                  {currentFolder?.readOnly && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 mr-1" /> Lecture seule
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {currentDocs.length} document(s)
                </span>
              </div>
              <DocumentTable documents={currentDocs} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <ClientUserDocuments />
  }

  return <ClientAdminDocuments />
}
