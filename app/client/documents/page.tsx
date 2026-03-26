"use client"

import { useState, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Upload, FolderOpen, ChevronRight, Loader2, FileText, CheckCircle,
  AlertTriangle, Lock, Clock, MessageCircle, X, Download,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Dossier {
  nom: string
  count: number
  anomalies: number
  readOnly: boolean
  docs: { name: string; date: string; analyser: string; statut: string }[]
}

const clientDossiers: Dossier[] = [
  { nom: "Mes Envois Récents", count: 5, anomalies: 0, readOnly: false, docs: [
    { name: "facture_sbm_mars.pdf", date: "25/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "salaires_mars.xlsx", date: "24/03/2026", analyser: "En attente...", statut: "en_cours" },
    { name: "facture_aws.pdf", date: "22/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "releve_mcb_mars.pdf", date: "20/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "scan_recu.jpg", date: "18/03/2026", analyser: "Lexora", statut: "illisible" },
  ]},
  { nom: "Factures que j'ai reçues", count: 8, anomalies: 0, readOnly: false, docs: [
    { name: "fact_mauritius_telecom_mars.pdf", date: "15/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "fact_openai_mars.pdf", date: "10/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "fact_mwpi_loyer_mars.pdf", date: "05/03/2026", analyser: "Lexora", statut: "classe" },
  ]},
  { nom: "Mes Factures envoyées", count: 12, anomalies: 0, readOnly: false, docs: [
    { name: "facture_rogers_capital.pdf", date: "20/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "facture_swan_insurance.pdf", date: "15/03/2026", analyser: "Votre comptable", statut: "question" },
  ]},
  { nom: "Relevés Bancaires", count: 3, anomalies: 0, readOnly: false, docs: [
    { name: "releve_mcb_mars_2026.pdf", date: "25/03/2026", analyser: "Lexora", statut: "classe" },
    { name: "releve_mcb_fev_2026.pdf", date: "25/02/2026", analyser: "Lexora", statut: "classe" },
  ]},
  { nom: "Fiches de Paie", count: 17, anomalies: 0, readOnly: false, docs: [
    { name: "paie_mars_2026_complet.xlsx", date: "28/03/2026", analyser: "Lexora", statut: "classe" },
  ]},
  { nom: "Cotisations Sociales", count: 6, anomalies: 0, readOnly: false, docs: [] },
  { nom: "TVA & Impôts", count: 4, anomalies: 0, readOnly: true, docs: [
    { name: "declaration_tva_fev_2026.pdf", date: "18/03/2026", analyser: "Votre comptable", statut: "classe" },
  ]},
  { nom: "Mes Contrats", count: 5, anomalies: 0, readOnly: false, docs: [] },
  { nom: "Immobilisations", count: 2, anomalies: 0, readOnly: false, docs: [] },
  { nom: "Rapports Mensuels", count: 3, anomalies: 0, readOnly: true, docs: [
    { name: "rapport_pnl_fev_2026.pdf", date: "05/03/2026", analyser: "Votre comptable", statut: "classe" },
    { name: "rapport_pnl_jan_2026.pdf", date: "05/02/2026", analyser: "Votre comptable", statut: "classe" },
  ]},
  { nom: "Autres Documents", count: 2, anomalies: 0, readOnly: false, docs: [] },
]

function statutBadge(s: string) {
  if (s === "classe") return <Badge className="bg-green-100 text-green-700">Classé</Badge>
  if (s === "en_cours") return <Badge className="bg-blue-100 text-blue-700">Analyse en cours...</Badge>
  if (s === "en_attente") return <Badge className="bg-gray-100 text-gray-600">En attente</Badge>
  if (s === "question") return <Badge className="bg-orange-100 text-orange-700">Question du comptable</Badge>
  if (s === "illisible") return <Badge className="bg-red-100 text-red-700">Document illisible</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function analyserBadge(a: string) {
  if (a === "Lexora") return <span className="text-sm" style={{ color: GOLD }}>Lexora</span>
  if (a === "Votre comptable") return <span className="text-sm text-muted-foreground">Votre comptable</span>
  return <span className="text-sm italic text-muted-foreground">En attente...</span>
}

export default function ClientDocumentsPage() {
  const { profile } = useProfile()
  const [selectedFolder, setSelectedFolder] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; date: string; statut: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isUser = profile?.role === "client_user"

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadSuccess(null)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        if (res.ok) {
          setUploadedFiles(prev => [{ name: file.name, date: new Date().toLocaleDateString("fr-FR"), statut: "en_cours" }, ...prev])
          setUploadSuccess(`${file.name} envoyé ! L'analyse va déterminer automatiquement dans quel dossier le classer.`)
        }
      } catch { /* ignore */ }
    }
    setUploading(false)
    setTimeout(() => setUploadSuccess(null), 6000)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files)
  }, [])

  const currentDossier = clientDossiers[selectedFolder]
  const allDocs = [...uploadedFiles.map(f => ({ name: f.name, date: f.date, analyser: "En attente...", statut: f.statut })), ...currentDossier.docs]

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes Documents</h1>
        <p className="text-sm text-muted-foreground">
          {isUser ? "Envoyez vos documents à votre comptable" : "Envoyez et consultez tous vos documents comptables"}
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

      {/* Uploaded files pending */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Envois en cours d&apos;analyse</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Fichier</TableHead><TableHead>Date</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>
                {uploadedFiles.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{f.name}</TableCell>
                    <TableCell>{f.date}</TableCell>
                    <TableCell><Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Analyse en cours...</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dossier list — same style as accountant */}
      {!isUser && (
        <div>
          <h3 className="font-semibold mb-3" style={{ color: NAVY }}>Mes Dossiers</h3>
          <div className="grid gap-2">
            {clientDossiers.map((d, i) => (
              <Card
                key={i}
                className={`cursor-pointer transition-colors ${d.count === 0 ? "opacity-50" : ""} ${selectedFolder === i ? "ring-2" : "hover:bg-muted/50"}`}
                style={selectedFolder === i ? { borderColor: GOLD, ringColor: GOLD } : undefined}
                onClick={() => setSelectedFolder(i)}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{d.nom}</p>
                        {d.readOnly && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.count} document{d.count !== 1 ? "s" : ""}{d.count === 0 ? " — vide" : ""}
                        {d.readOnly ? " — rempli par votre comptable" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.anomalies > 0 && <Badge className="bg-red-100 text-red-700">{d.anomalies} anomalie{d.anomalies > 1 ? "s" : ""}</Badge>}
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedFolder === i ? "rotate-90" : ""}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Selected folder content */}
      {!isUser && allDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
                {currentDossier.nom}
                {currentDossier.readOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
              </CardTitle>
              {!currentDossier.readOnly && (
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
                  <TableHead>Analysé par</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDocs.map((doc, i) => (
                  <TableRow key={i}>
                    <TableCell className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />{doc.name}
                    </TableCell>
                    <TableCell>{doc.date}</TableCell>
                    <TableCell>{analyserBadge(doc.analyser)}</TableCell>
                    <TableCell>{statutBadge(doc.statut)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button>
                        {doc.statut === "question" && <Button variant="ghost" size="sm"><MessageCircle className="h-3.5 w-3.5 text-orange-500" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {allDocs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucun document dans ce dossier.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
