"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Upload, FolderOpen, Loader2, FileText, CheckCircle, Search, X,
  Clock, Download, ChevronRight, Lock, AlertTriangle, Building2, RefreshCw, Camera, Pencil,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Document {
  id: string
  nom_fichier: string
  type_fichier: string
  type_document: string | null
  statut: string
  storage_path: string | null
  created_at: string
  societe_detectee: string | null
  confiance_type?: number | null
  n8n_result?: { error?: string; routing?: any; extraction?: any; facture_status?: string; facture_error?: string; facture_skip_reason?: string } | null
}

interface Folder {
  key: string
  label: string
  readOnly: boolean
}

const FOLDERS: Folder[] = [
  { key: "all", label: "Tous les Documents", readOnly: true },
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

const DOCUMENT_TYPES = [
  { value: "facture_fournisseur", label: "Facture fournisseur" },
  { value: "facture_client", label: "Facture client" },
  { value: "releve_bancaire", label: "Relevé bancaire" },
  { value: "fiche_paie", label: "Fiche de paie" },
  { value: "payroll_report", label: "Rapport paie (Excel)" },
  { value: "charges_sociales", label: "Charges sociales" },
  { value: "contrat", label: "Contrat" },
  { value: "autre", label: "Autre" },
]

function getSocieteBadgeStyle(name?: string | null): Record<string, string> {
  if (!name) return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
  const n = name.toLowerCase()
  if (n.includes('obesity') || n.includes('occ'))
    return { backgroundColor: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }
  if (n.includes('digital') || n.includes('dds'))
    return { backgroundColor: '#dbeafe', color: '#1d4ed8', borderColor: '#bfdbfe' }
  if (n.includes('tibok'))
    return { backgroundColor: '#fef9c3', color: '#a16207', borderColor: '#fef08a' }
  return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
}

function normalizeSocieteName(detected: string | null, knownSocietes: { nom: string }[]): string | null {
  if (!detected) return null
  const d = detected.toLowerCase().replace(/ ltd| limited| sarl| sas| co\.?/gi, '').trim()
  for (const s of knownSocietes) {
    const k = s.nom.toLowerCase().replace(/ ltd| limited| sarl| sas| co\.?/gi, '').trim()
    if (k === d || k.includes(d) || d.includes(k)) return s.nom
  }
  return detected
}

function statutBadge(s: string) {
  if (s === "traite") return <Badge className="bg-green-100 text-green-700">Traité</Badge>
  if (s === "en_cours" || s === "en_attente") return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Analyse en cours...</Badge>
  if (s === "erreur") return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />Erreur</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function confianceBadge(confiance: number | undefined | null) {
  if (confiance == null) return <span className="text-xs text-muted-foreground">—</span>
  if (confiance >= 80) return <Badge className="bg-green-100 text-green-700 text-xs">{confiance}%</Badge>
  if (confiance >= 50) return <Badge className="bg-orange-100 text-orange-700 text-xs">{confiance}%</Badge>
  return <Badge className="bg-red-100 text-red-700 text-xs">{confiance}%</Badge>
}

function getDocsForFolder(docs: Document[], folderKey: string): Document[] {
  if (folderKey === "all") {
    return docs
  }
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
  const [societes, setSocietes] = useState<{ id: string; nom: string; societe_id: string }[]>([])
  const [selectedUploadSociete, setSelectedUploadSociete] = useState<string>("auto")
  const [selectedFolder, setSelectedFolder] = useState("recent")
  const [docSearch, setDocSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // Reassignment dialog for undetected société
  const [reassignDoc, setReassignDoc] = useState<{ id: string; nom_fichier: string } | null>(null)
  const [reassignSocieteId, setReassignSocieteId] = useState<string>("")
  // Category change dialog
  const [changeCatDoc, setChangeCatDoc] = useState<Document | null>(null)
  const [changeCatType, setChangeCatType] = useState("")
  const [changeCatHint, setChangeCatHint] = useState("")
  const [changeCatSaving, setChangeCatSaving] = useState(false)
  // Duplicate reprocess dialog
  const [reprocessDoc, setReprocessDoc] = useState<{ id: string; filename: string } | null>(null)
  // Société confirmation dialog (when upload can't detect société)
  const [confirmSocDoc, setConfirmSocDoc] = useState<{ id: string; filename: string; detected: string | null } | null>(null)
  const [confirmSocId, setConfirmSocId] = useState("")
  const [confirmSocSaving, setConfirmSocSaving] = useState(false)
  // Société filter
  const [filterSociete, setFilterSociete] = useState("all")
  // Type document filter
  const [typeFilter, setTypeFilter] = useState("all")
  // "Sans facture" toggle — show only docs needing reprocess or invoices without linked facture
  const [sansFactureOnly, setSansFactureOnly] = useState(false)
  // Bulk reprocess state
  const [bulkReprocessing, setBulkReprocessing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // Pagination
  const [pageSize] = useState(20)
  const [visibleCount, setVisibleCount] = useState(20)
  // Inline société reassignment
  const [reassigningSocDocId, setReassigningSocDocId] = useState<string | null>(null)
  const [reassigningSocValue, setReassigningSocValue] = useState("")

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
        // Get all sociétés for this client
        const dosRes = await fetch("/api/admin/dossiers")
        const dosData = await dosRes.json()
        const myDossiers = (dosData.dossiers || []).filter((d: any) => d.client_id === profile?.id)

        // Load société names from multiple sources
        const socRes = await fetch("/api/admin/societes")
        const socData = await socRes.json()
        const allSocietes = (socData.societes || [])

        if (myDossiers.length > 0) {
          setSocieteId(myDossiers[0].societe_id)
          const linked = myDossiers
            .map((d: any) => {
              const soc = allSocietes.find((s: any) => s.id === d.societe_id)
              return soc ? { id: d.id, nom: soc.nom, societe_id: d.societe_id } : null
            })
            .filter(Boolean)
            .filter((s: any) => !s.nom.endsWith("— Personnel") && !s.nom.endsWith("— En attente"))
          setSocietes(linked)
        }

        // Fallback for assistant/user roles: fetch from user_societes via client API
        if (!myDossiers.length || societes.length === 0) {
          const clientSocRes = await fetch("/api/client/societes")
          const clientSocData = await clientSocRes.json()
          const clientSocs = (clientSocData.societes || [])
            .filter((s: any) => !s.nom?.endsWith("— Personnel") && !s.nom?.endsWith("— En attente"))
            .map((s: any) => ({ id: s.id, nom: s.nom, societe_id: s.id }))
          if (clientSocs.length > 0) {
            setSocietes(clientSocs)
            if (!societeId) setSocieteId(clientSocs[0].societe_id)
          }
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

    // Determine which société to use
    let uploadSocieteId = selectedUploadSociete !== "auto"
      ? selectedUploadSociete
      : societeId

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
        if (res.ok && data.document) {
          const doc = data.document
          const detectedSociete = doc.societe_detectee
          const isAutoMode = selectedUploadSociete === "auto"

          // Handle needs_confirmation response
          if (data.needs_confirmation) {
            setConfirmSocDoc({ id: doc.id, filename: file.name, detected: data.societe_detectee })
            setConfirmSocId(societes.length > 0 ? societes[0].societe_id : "")
            setUploadSuccess(`${file.name} envoyé — veuillez confirmer la société.`)
          } else if (doc.statut === "traite" && doc.type_document) {
            const folderLabel = FOLDERS.find(f => f.key === doc.type_document)?.label || doc.type_document

            // Check if AI detected a société that doesn't match any known ones
            if (isAutoMode && detectedSociete && detectedSociete !== "INCONNU" && societes.length > 1) {
              const matched = societes.find(s =>
                s.nom.toLowerCase().includes(detectedSociete.toLowerCase()) ||
                detectedSociete.toLowerCase().includes(s.nom.toLowerCase())
              )
              if (!matched) {
                // Show reassignment dialog
                setReassignDoc({ id: doc.id, nom_fichier: file.name })
                setUploadSuccess(`${file.name} classé dans "${folderLabel}". Société détectée : "${detectedSociete}" — veuillez confirmer la société.`)
              } else {
                setUploadSuccess(`${file.name} classé dans "${folderLabel}" pour ${matched.nom}`)
              }
            } else {
              setUploadSuccess(`${file.name} analysé et classé dans "${folderLabel}" !`)
            }
          // Auto-reanalyze "autre" documents with low confidence
          if (doc.type_document === "autre") {
            const conf = doc.confiance_type ?? doc.n8n_result?.routing?.confiance_type ?? 100
            if (conf < 70) {
              setUploadSuccess(`${file.name} — Type non reconnu. Nouvelle analyse en cours...`)
              fetch(`/api/documents/${doc.id}/reanalyze`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }).then(() => fetchDocuments()).catch(() => fetchDocuments())
            }
          }
          } else if (doc.statut === "erreur") {
            setUploadError(`${file.name} : erreur d'analyse. Utilisez Réessayer.`)
          } else {
            setUploadSuccess(`${file.name} envoyé !`)
          }
        } else {
          if (res.status === 409 && data.doublon) {
            if (data.existingId && data.statut && data.statut !== 'traite') {
              // Show reprocess confirmation dialog for erreur/en_attente docs
              setReprocessDoc({ id: data.existingId, filename: file.name })
            } else {
              setUploadError(`⚠️ Ce document a déjà été importé : "${file.name}"`)
            }
          } else {
            setUploadError(data.error || "Erreur lors de l'envoi")
          }
        }
      } catch {
        setUploadError("Erreur de connexion au serveur")
      }
    }
    await fetchDocuments()
    setUploading(false)
    setSelectedFolder("recent")
    setTimeout(() => { setUploadSuccess(null); setUploadError(null) }, 8000)
  }

  const handleReassign = async () => {
    if (!reassignDoc || !reassignSocieteId) return
    try {
      // Find the dossier_id for the target société + client
      const dosRes = await fetch("/api/admin/dossiers")
      const dosData = await dosRes.json()
      const targetDossier = (dosData.dossiers || []).find(
        (d: any) => d.societe_id === reassignSocieteId && d.client_id === profile?.id
      )
      if (targetDossier) {
        // Call PATCH /api/documents/[id] to update dossier_id
        const patchRes = await fetch(`/api/documents/${reassignDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: reassignSocieteId,
            dossier_id: targetDossier.id,
            corrige_manuellement: true,
          }),
        })
        if (patchRes.ok) {
          setUploadSuccess(`Document réassigné avec succès à la société sélectionnée.`)
        } else {
          const errData = await patchRes.json()
          setUploadError(errData.error || "Erreur lors de la réassignation")
        }
      } else {
        setUploadError("Dossier introuvable pour cette société")
      }
    } catch {
      setUploadError("Erreur lors de la réassignation")
    }
    setReassignDoc(null)
    setReassignSocieteId("")
    await fetchDocuments()
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

  // Filter by selected société if not "auto"
  const filteredDocuments = selectedUploadSociete === "auto"
    ? documents
    : documents.filter(d => {
        // Match by societe_detectee or by dossier's société
        const matchSociete = d.societe_detectee && societes.some(s =>
          s.societe_id === selectedUploadSociete &&
          (d.societe_detectee?.toLowerCase().includes(s.nom.toLowerCase().split(' ')[0]) || s.nom.toLowerCase().includes(d.societe_detectee?.toLowerCase() || ''))
        )
        // Also check dossier_id belongs to the selected société
        const matchDossier = societes.some(s => s.societe_id === selectedUploadSociete && s.id === (d as any).dossier_id)
        return matchSociete || matchDossier || !d.societe_detectee
      })

  // Helper — does this doc need reprocessing (sans facture)?
  const docNeedsReprocess = (d: Document) => {
    const facStatus = d.n8n_result?.facture_status
    if (facStatus === 'needs_reprocess' || facStatus === 'error' || facStatus === 'skipped') return true
    // Invoice document with no facture row created
    if ((d.type_document === 'facture_client' || d.type_document === 'facture_fournisseur') && !facStatus) {
      // Heuristic: invoice processed but n8n_result has no facture_status field at all
      // Means it was uploaded BEFORE the BUG 1 fix or facture creation silently failed
      if (d.statut === 'traite') return true
    }
    return false
  }

  const folderDocs = getDocsForFolder(filteredDocuments, selectedFolder)
  const allCurrentDocs = folderDocs.filter(d => {
    if (docSearch) {
      if (!d.nom_fichier.toLowerCase().includes(docSearch.toLowerCase())) return false
    }
    if (statusFilter !== "all" && d.statut !== statusFilter) return false
    if (typeFilter !== "all" && d.type_document !== typeFilter) return false
    if (sansFactureOnly && !docNeedsReprocess(d)) return false
    if (filterSociete !== "all") {
      const socName = societes.find(s => s.societe_id === filterSociete)?.nom
      if (socName && d.societe_detectee) {
        if (!d.societe_detectee.toLowerCase().includes(socName.toLowerCase().split(' ')[0])) return false
      } else if (!d.societe_detectee) {
        return false
      }
    }
    return true
  })
  const currentDocs = allCurrentDocs.slice(0, visibleCount)
  const unassignedCount = documents.filter(d => !d.societe_detectee).length

  return (
    <div className="flex-1 overflow-auto p-4 pt-14 md:pt-6 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes Documents</h1>
        <p className="text-sm text-muted-foreground">
          Envoyez et consultez tous vos documents comptables
        </p>
      </div>

      {/* Société selector — optional */}
      {societes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium" style={{ color: NAVY }}>Société (optionnel)</span>
          <Select value={selectedUploadSociete} onValueChange={setSelectedUploadSociete}>
            <SelectTrigger className="w-full sm:w-[280px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Toutes les sociétés — détection auto</SelectItem>
              {societes.map(s => <SelectItem key={s.societe_id} value={s.societe_id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedUploadSociete === "auto" && (
            <span className="text-xs text-muted-foreground">Laissez vide pour détection automatique</span>
          )}
        </div>
      )}

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
            <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, XLSX — max 20 MB</p>
            <p className="text-xs text-muted-foreground mt-1">Le système analyse et classe automatiquement dans le bon dossier</p>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>Parcourir</Button>
              <Button size="sm" variant="outline" onClick={() => cameraInputRef.current?.click()}><Camera className="h-4 w-4 mr-1" />Prendre une photo</Button>
            </div>
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

      {/* Document counter */}
      <div className="flex items-center gap-3 text-xs text-gray-400 px-2">
        <span>{filteredDocuments.length} document(s) {selectedUploadSociete !== "auto" ? "(filtré par société)" : "(toutes sociétés)"}</span>
        {unassignedCount > 0 && (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">{unassignedCount} non assigné{unassignedCount > 1 ? "s" : ""}</Badge>
        )}
      </div>

      {/* Folder list */}
      <div>
        <h3 className="font-semibold mb-3" style={{ color: NAVY }}>Mes Dossiers</h3>
        <div className="grid gap-2">
          {FOLDERS.map((folder) => {
            const count = getDocsForFolder(filteredDocuments, folder.key).length
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
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
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
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="facture_client">Facture client</SelectItem>
              <SelectItem value="facture_fournisseur">Facture fournisseur</SelectItem>
              <SelectItem value="releve_bancaire">Relevé bancaire</SelectItem>
              <SelectItem value="fiche_paie">Fiche paie</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
            </SelectContent>
          </Select>
          {societes.length > 0 && (
            <Select value={filterSociete} onValueChange={setFilterSociete}>
              <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.societe_id} value={s.societe_id}>{s.nom}</SelectItem>)}
                <SelectItem value="all">Toutes sociétés</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant={sansFactureOnly ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSansFactureOnly(v => !v)}
            title="Afficher uniquement les documents sans facture créée"
          >
            Sans facture {sansFactureOnly ? "✓" : ""}
          </Button>
          {profile?.role === 'client_admin' && (
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs bg-[#0B0F2E]"
              disabled={bulkReprocessing}
              onClick={async () => {
                const candidates = allCurrentDocs.filter(docNeedsReprocess)
                if (candidates.length === 0) {
                  alert('Aucun document à retraiter dans la sélection courante')
                  return
                }
                if (!confirm(`Retraiter ${candidates.length} document(s) ?\n\nLe traitement est séquentiel et peut prendre plusieurs minutes.`)) return
                setBulkReprocessing(true)
                setBulkProgress({ done: 0, total: candidates.length })
                for (let i = 0; i < candidates.length; i++) {
                  try {
                    await fetch(`/api/documents/${candidates[i].id}/reanalyze`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
                    })
                  } catch (e) {
                    console.error('[bulk-reprocess]', candidates[i].id, e)
                  }
                  setBulkProgress({ done: i + 1, total: candidates.length })
                }
                await fetchDocuments()
                setBulkReprocessing(false)
                setBulkProgress(null)
              }}
            >
              {bulkReprocessing && bulkProgress
                ? `Retraitement... ${bulkProgress.done}/${bulkProgress.total}`
                : `Tout retraiter (${allCurrentDocs.filter(docNeedsReprocess).length})`}
            </Button>
          )}
          {(docSearch || statusFilter !== "all" || typeFilter !== "all" || filterSociete !== "all" || sansFactureOnly) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDocSearch(""); setStatusFilter("all"); setTypeFilter("all"); setFilterSociete("all"); setSansFactureOnly(false) }}>Effacer</Button>
          )}
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded" style={{ scrollbarGutter: 'stable' }}>
          <Table className="min-w-[900px]">
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
              {currentDocs.map((doc) => {
                const confiance = doc.confiance_type ?? doc.n8n_result?.routing?.confiance_type ?? null
                return (
                <TableRow key={doc.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Link
                      href={`/client/documents/${doc.id}`}
                      className="hover:underline text-sm font-medium truncate max-w-[260px] inline-block"
                      style={{ color: NAVY }}
                      title={doc.nom_fichier}
                    >
                      {doc.nom_fichier}
                    </Link>
                  </TableCell>
                  <TableCell>{new Date(doc.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>
                    {reassigningSocDocId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={reassigningSocValue} onValueChange={async (v) => {
                          setReassigningSocValue(v)
                          const reassignSocName = societes.find(s => s.societe_id === v)?.nom || null
                          try {
                            await fetch(`/api/documents/${doc.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ societe_id: v, societe_detectee: reassignSocName, corrige_manuellement: true }),
                            })
                            await fetchDocuments()
                          } catch { /* silent */ }
                          setReassigningSocDocId(null)
                        }}>
                          <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            {societes.map(s => <SelectItem key={s.societe_id} value={s.societe_id}>{s.nom}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setReassigningSocDocId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1 group">
                        {doc.societe_detectee ? (
                          <Badge variant="outline" className="text-xs" style={getSocieteBadgeStyle(normalizeSocieteName(doc.societe_detectee, societes))}>
                            {normalizeSocieteName(doc.societe_detectee, societes)}
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Non assignée</Badge>
                        )}
                        <button className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setReassigningSocDocId(doc.id); setReassigningSocValue("") }}>
                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-[#0B0F2E]" />
                        </button>
                      </span>
                    )}
                  </TableCell>
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
                    {confianceBadge(confiance)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {doc.storage_path && (
                        <Button variant="ghost" size="sm" title="Télécharger"
                          onClick={() => window.open(`/api/documents/${doc.id}/download`, '_blank')}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {doc.storage_path && (
                        <Button
                          variant="ghost" size="sm" className="text-xs"
                          style={{ color: doc.statut === "traite" ? undefined : GOLD }}
                          title={doc.statut === "traite" ? "Réanalyser" : "Réessayer"}
                          onClick={async () => {
                            if (doc.statut === "traite" && !confirm("Ce document a déjà été traité. Voulez-vous relancer l'analyse ? Les écritures comptables seront recalculées.")) return
                            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, statut: "en_cours" } : d))
                            try {
                              await fetch(`/api/documents/${doc.id}/reanalyze`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({}),
                              })
                            } catch { /* silent */ }
                            await fetchDocuments()
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {doc.statut === "traite" ? "Réanalyser" : "Réessayer"}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title="Changer catégorie"
                        onClick={() => { setChangeCatDoc(doc); setChangeCatType(doc.type_document || "autre"); setChangeCatHint("") }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        title="Supprimer"
                        onClick={async () => {
                          if (!confirm(`Supprimer "${doc.nom_fichier}" ? Cette action est irréversible.`)) return
                          try {
                            const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                            if (res.ok) { setDocuments(prev => prev.filter(d => d.id !== doc.id)) }
                            else { const d = await res.json(); alert(d.error || 'Erreur suppression') }
                          } catch { alert('Erreur de connexion') }
                        }}
                      >
                        🗑️
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
              {currentDocs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">Aucun document dans ce dossier.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {allCurrentDocs.length > visibleCount && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-2">Affichage {visibleCount} sur {allCurrentDocs.length} documents</p>
          <Button variant="outline" size="sm" onClick={() => setVisibleCount(v => v + pageSize)}>
            Charger plus
          </Button>
        </div>
      )}
      {allCurrentDocs.length > 0 && allCurrentDocs.length <= visibleCount && (
        <p className="text-xs text-muted-foreground text-center">{allCurrentDocs.length} document{allCurrentDocs.length > 1 ? "s" : ""}</p>
      )}

      {/* Société confirmation dialog */}
      <Dialog open={!!confirmSocDoc} onOpenChange={(o) => { if (!o) setConfirmSocDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la société du document</DialogTitle>
            <DialogDescription>
              Le document &quot;{confirmSocDoc?.filename}&quot; n&apos;a pas pu être automatiquement associé à une société.
              {confirmSocDoc?.detected && <><br />Société détectée : <strong>{confirmSocDoc.detected}</strong></>}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={confirmSocId} onValueChange={setConfirmSocId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner la société..." /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.societe_id} value={s.societe_id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSocDoc(null)}>Ignorer</Button>
            <Button
              disabled={!confirmSocId || confirmSocSaving}
              style={{ backgroundColor: NAVY }}
              onClick={async () => {
                if (!confirmSocDoc || !confirmSocId) return
                setConfirmSocSaving(true)
                try {
                  // Reassign société + update societe_detectee to the real name
                  const confirmedSocName = societes.find(s => s.societe_id === confirmSocId)?.nom || null
                  await fetch(`/api/documents/${confirmSocDoc.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      societe_id: confirmSocId,
                      societe_detectee: confirmedSocName,
                      corrige_manuellement: true,
                    }),
                  })
                  // Re-analyze with correct société context
                  await fetch(`/api/documents/${confirmSocDoc.id}/reanalyze`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  })
                  await fetchDocuments()
                } catch { /* silent */ }
                setConfirmSocSaving(false)
                setConfirmSocDoc(null)
              }}
            >
              {confirmSocSaving ? "Traitement..." : "Confirmer et traiter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassignment dialog for undetected société */}
      <Dialog open={!!reassignDoc} onOpenChange={(o) => { if (!o) { setReassignDoc(null); setReassignSocieteId("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la société</DialogTitle>
            <DialogDescription>
              Le document &quot;{reassignDoc?.nom_fichier}&quot; a été analysé mais la société n&apos;a pas pu être identifiée automatiquement. Veuillez sélectionner la société concernée.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Select value={reassignSocieteId} onValueChange={setReassignSocieteId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.societe_id} value={s.societe_id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignDoc(null); setReassignSocieteId("") }}>Ignorer</Button>
            <Button style={{ backgroundColor: GOLD }} onClick={handleReassign} disabled={!reassignSocieteId}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Category change dialog */}
      <Dialog open={!!changeCatDoc} onOpenChange={(o) => { if (!o) setChangeCatDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Changer le type de document</DialogTitle>
            <DialogDescription>
              {changeCatDoc?.nom_fichier}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={changeCatType} onValueChange={setChangeCatType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Indice pour l'IA (optionnel)"
              value={changeCatHint}
              onChange={(e) => setChangeCatHint(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeCatDoc(null)}>Annuler</Button>
            <Button
              disabled={changeCatSaving}
              style={{ backgroundColor: NAVY }}
              onClick={async () => {
                if (!changeCatDoc) return
                setChangeCatSaving(true)
                try {
                  await fetch(`/api/documents/${changeCatDoc.id}/reanalyze`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type_force: changeCatType, hint: changeCatHint || undefined }),
                  })
                  await fetchDocuments()
                } catch { /* silent */ }
                setChangeCatSaving(false)
                setChangeCatDoc(null)
              }}
            >
              {changeCatSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Analyse...</> : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess duplicate confirmation dialog */}
      <Dialog open={!!reprocessDoc} onOpenChange={(o) => { if (!o) setReprocessDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Document existant avec erreurs</DialogTitle>
            <DialogDescription>
              &quot;{reprocessDoc?.filename}&quot; a déjà été importé mais contient des erreurs. Voulez-vous le retraiter ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReprocessDoc(null)}>Annuler</Button>
            <Button
              style={{ backgroundColor: GOLD, color: NAVY }}
              onClick={async () => {
                if (!reprocessDoc) return
                try {
                  await fetch(`/api/documents/${reprocessDoc.id}/reanalyze`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  })
                  await fetchDocuments()
                } catch { /* silent */ }
                setReprocessDoc(null)
              }}
            >
              Retraiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
