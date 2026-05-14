"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
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
import MonEspacePersonnel from "@/components/rh/MonEspacePersonnel"
import {
  Upload, FolderOpen, Loader2, FileText, CheckCircle, Search, X,
  Clock, Download, ChevronRight, Lock, AlertTriangle, Building2, RefreshCw, Camera, Pencil,
  User,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

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
  n8n_result?: { error?: string; routing?: any; extraction?: any } | null
}

interface Folder {
  key: string
  label: string
  readOnly: boolean
}

function getFolders(locale: Locale): Folder[] {
  return [
    { key: "recent", label: t('core.doc.folder_recent', locale), readOnly: false },
    { key: "facture_fournisseur", label: t('core.doc.folder_supplier_invoices', locale), readOnly: false },
    { key: "facture_client", label: t('core.doc.folder_client_invoices', locale), readOnly: false },
    { key: "releve_bancaire", label: t('core.doc.folder_bank_statements', locale), readOnly: false },
    { key: "fiche_paie", label: t('core.doc.folder_payslips', locale), readOnly: false },
    { key: "charges_sociales", label: t('core.doc.folder_social_charges', locale), readOnly: false },
    { key: "contrat", label: t('core.doc.folder_contracts', locale), readOnly: false },
    { key: "rapport", label: t('core.doc.folder_monthly_reports', locale), readOnly: true },
    { key: "autre", label: t('core.doc.folder_other', locale), readOnly: false },
  ]
}

function getDocumentTypes(locale: Locale) {
  return [
    { value: "facture_fournisseur", label: t('core.doc.type_supplier_invoice', locale) },
    { value: "facture_client", label: t('core.doc.type_client_invoice', locale) },
    { value: "releve_bancaire", label: t('core.doc.type_bank_statement', locale) },
    { value: "fiche_paie", label: t('core.doc.type_payslip', locale) },
    { value: "payroll_report", label: t('core.doc.type_payroll_excel', locale) },
    { value: "charges_sociales", label: t('core.doc.type_social_charges', locale) },
    { value: "contrat", label: t('core.doc.type_contract', locale) },
    { value: "autre", label: t('core.doc.type_other', locale) },
  ]
}

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

function statutBadge(s: string, locale: Locale) {
  if (s === "traite") return <Badge className="bg-green-100 text-green-700">{t('core.doc.status_processed', locale)}</Badge>
  if (s === "en_cours" || s === "en_attente") return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />{t('core.doc.status_analyzing', locale)}</Badge>
  if (s === "erreur") return <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />{t('core.doc.status_error', locale)}</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function confianceBadge(confiance: number | undefined | null) {
  if (confiance == null) return <span className="text-xs text-muted-foreground">—</span>
  if (confiance >= 80) return <Badge className="bg-green-100 text-green-700 text-xs">{confiance}%</Badge>
  if (confiance >= 50) return <Badge className="bg-orange-100 text-orange-700 text-xs">{confiance}%</Badge>
  return <Badge className="bg-red-100 text-red-700 text-xs">{confiance}%</Badge>
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

export default function AssistantPage() {
  const locale = getLocale()
  const FOLDERS = getFolders(locale)
  const DOCUMENT_TYPES = getDocumentTypes(locale)
  const isAssistantMode = true
  const { profile } = useProfile()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const { societeId, societe, societes: providerSocietes } = useSocieteActive()
  const societes = providerSocietes
    .filter((s: any) => !s.nom?.endsWith("— Personnel") && !s.nom?.endsWith("— En attente"))
    .map((s: any) => ({ id: s.id, nom: s.nom }))
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
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
      try { await fetchDocuments() } catch { /* silent */ } finally { setLoading(false) }
    }
    if (profile?.id) init()
  }, [profile?.id, fetchDocuments])

  // Auto-refresh documents every 10 seconds to pick up processing results
  useEffect(() => {
    if (!profile?.id) return
    const interval = setInterval(fetchDocuments, 10000)
    return () => clearInterval(interval)
  }, [profile?.id, fetchDocuments])
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    if (!societeId) {
      setUploadError(t('core.doc.no_active_company', locale))
      setTimeout(() => setUploadError(null), 5000)
      return
    }
    const uploadSocieteId = societeId

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

          // Handle needs_confirmation response
          if (data.needs_confirmation) {
            setConfirmSocDoc({ id: doc.id, filename: file.name, detected: data.societe_detectee })
            setConfirmSocId(societes.length > 0 ? societes[0].id : "")
            setUploadSuccess(`${file.name} ${t('core.doc.sent_confirm_company', locale)}`)
          } else if (doc.statut === "traite" && doc.type_document) {
            const folderLabel = FOLDERS.find(f => f.key === doc.type_document)?.label || doc.type_document

            // Filet anti-mauvais-rattachement: OCR détecte une autre société accessible
            if (detectedSociete && detectedSociete !== "INCONNU" && societes.length > 1) {
              const matched = societes.find(s =>
                s.nom.toLowerCase().includes(detectedSociete.toLowerCase()) ||
                detectedSociete.toLowerCase().includes(s.nom.toLowerCase())
              )
              if (!matched) {
                // Show reassignment dialog
                setReassignDoc({ id: doc.id, nom_fichier: file.name })
                setUploadSuccess(`${file.name} ${t('core.doc.classified_in', locale)} "${folderLabel}". ${t('core.doc.company_detected', locale)} : "${detectedSociete}" — ${t('core.doc.sent_confirm_company', locale)}`)
              } else {
                setUploadSuccess(`${file.name} ${t('core.doc.classified_in', locale)} "${folderLabel}" — ${matched.nom}`)
              }
            } else {
              setUploadSuccess(`${file.name} ${t('core.doc.analyzed_classified_in', locale)} "${folderLabel}" !`)
            }
          // Auto-reanalyze "autre" documents with low confidence
          if (doc.type_document === "autre") {
            const conf = doc.confiance_type ?? doc.n8n_result?.routing?.confiance_type ?? 100
            if (conf < 70) {
              setUploadSuccess(`${file.name} — ${t('core.doc.unrecognized_type_reanalyze', locale)}`)
              fetch(`/api/documents/${doc.id}/reanalyze`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }).then(() => fetchDocuments()).catch(() => fetchDocuments())
            }
          }
          } else if (doc.statut === "erreur") {
            setUploadError(`${file.name} : ${t('core.doc.error_analyze_retry', locale)}`)
          } else {
            setUploadSuccess(`${file.name} ${t('core.doc.sent', locale)}`)
          }
        } else {
          if (res.status === 409 && data.doublon) {
            if (data.existingId && data.statut && data.statut !== 'traite') {
              // Show reprocess confirmation dialog for erreur/en_attente docs
              setReprocessDoc({ id: data.existingId, filename: file.name })
            } else {
              setUploadError(`⚠️ ${t('core.doc.already_imported', locale)} : "${file.name}"`)
            }
          } else {
            setUploadError(data.error || t('core.doc.error_uploading', locale))
          }
        }
      } catch {
        setUploadError(t('core.doc.connection_error_server', locale))
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
          setUploadSuccess(t('core.doc.doc_reassigned_success', locale))
        } else {
          const errData = await patchRes.json()
          setUploadError(errData.error || t('core.doc.error_reassign', locale))
        }
      } else {
        setUploadError(t('core.doc.error_reassign', locale))
      }
    } catch {
      setUploadError(t('core.doc.error_reassign', locale))
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

  // En mode mono-société: l'API retourne déjà uniquement les docs accessibles.
  const filteredDocuments = documents

  const folderDocs = getDocsForFolder(filteredDocuments, selectedFolder)
  const allCurrentDocs = folderDocs.filter(d => {
    if (docSearch) {
      if (!d.nom_fichier.toLowerCase().includes(docSearch.toLowerCase())) return false
    }
    if (statusFilter !== "all" && d.statut !== statusFilter) return false
    return true
  })
  const currentDocs = allCurrentDocs.slice(0, visibleCount)
  const unassignedCount = documents.filter(d => !d.societe_detectee).length

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('core.ast.title', locale)}</h1>
          <p className="text-sm text-muted-foreground">
            {t('core.ast.subtitle', locale)}
          </p>
        </div>
        {/* Double-access link — takes client-assistants who also have an
            employe record to their personal salarié portal (pointage,
            congés, bulletins). Middleware (/salarie gate in
            lib/supabase/middleware.ts) handles the final check: users
            without an employe link are redirected back to /redirect. */}
        <Link href="/salarie" className="shrink-0">
          <Button
            variant="outline"
            className="gap-2 border-[#0B0F2E] text-[#0B0F2E] hover:bg-[#0B0F2E] hover:text-white"
          >
            <User className="h-4 w-4" />
            {t('core.ast.my_employee_space', locale)}
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* TÂCHE 7 — Mon espace personnel (rendu uniquement si le user
          assistant a une fiche employé liée — cas Daril chez OCC). */}
      <MonEspacePersonnel />

      {/* Bandeau info: les documents seront uploadés sur la société active */}
      {societe && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm" style={{ color: NAVY }}>
            {t('core.doc.upload_on', locale)} : <strong>{societe.nom}</strong>
          </span>
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
            <p className="text-sm text-muted-foreground">{t('core.doc.status_analyzing', locale)}</p>
            <p className="text-xs text-muted-foreground">{t('core.doc.your_doc_auto_classed', locale)}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t('core.doc.drop_files', locale)}</p>
            <p className="text-xs text-muted-foreground">{t('core.doc.file_types', locale)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('core.doc.system_classifies', locale)}</p>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>{t('core.doc.browse', locale)}</Button>
              <Button size="sm" variant="outline" onClick={() => cameraInputRef.current?.click()}><Camera className="h-4 w-4 mr-1" />{t('core.doc.take_photo', locale)}</Button>
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
      <div className="text-xs text-gray-400 px-2">
        {filteredDocuments.length} {t('core.doc.documents_count', locale)}
      </div>

      {/* Folder list */}
      <div>
        <h3 className="font-semibold mb-3" style={{ color: NAVY }}>{t('core.doc.my_folders', locale)}</h3>
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
                        {count} {t('core.doc.documents_word', locale)}{count === 0 ? t('core.doc.empty_suffix', locale) : ""}
                        {folder.readOnly ? t('core.doc.filled_by_accountant', locale) : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {folder.key === "recent" && documents.some(d => d.statut === "en_attente" || d.statut === "en_cours") && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('core.doc.in_progress', locale)}
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
                <Upload className="mr-1 h-4 w-4" />{t('core.doc.upload_here', locale)}
              </Button>
            )}
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t('core.doc.search_filename', locale)} className="pl-9 h-8 text-sm" value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('core.doc.all_statuses', locale)}</SelectItem>
              <SelectItem value="traite">{t('core.doc.processed', locale)}</SelectItem>
              <SelectItem value="en_cours">{t('core.doc.in_progress_filter', locale)}</SelectItem>
              <SelectItem value="erreur">{t('core.doc.error', locale)}</SelectItem>
            </SelectContent>
          </Select>
          {(docSearch || statusFilter !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDocSearch(""); setStatusFilter("all") }}>{t('core.doc.clear', locale)}</Button>
          )}
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded" style={{ scrollbarGutter: 'stable' }}>
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t('core.doc.col_file', locale)}</TableHead>
                <TableHead>{t('core.doc.col_date', locale)}</TableHead>
                <TableHead>{t('core.doc.col_company', locale)}</TableHead>
                <TableHead>{t('core.doc.col_type_detected', locale)}</TableHead>
                <TableHead>{t('core.doc.col_status', locale)}</TableHead>
                <TableHead>{t('core.doc.col_ai_confidence', locale)}</TableHead>
                <TableHead>{t('core.doc.col_actions', locale)}</TableHead>
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
                  <TableCell>{new Date(doc.created_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}</TableCell>
                  <TableCell>
                    {reassigningSocDocId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={reassigningSocValue} onValueChange={async (v) => {
                          setReassigningSocValue(v)
                          const reassignSocName = societes.find(s => s.id === v)?.nom || null
                          try {
                            await fetch(`/api/documents/${doc.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ societe_id: v, societe_detectee: reassignSocName, corrige_manuellement: true }),
                            })
                            await fetchDocuments()
                          } catch { /* silent */ }
                          setReassigningSocDocId(null)
                        }}>
                          <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder={t('core.doc.choose', locale)} /></SelectTrigger>
                          <SelectContent>
                            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
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
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">{t('core.doc.unassigned_badge', locale)}</Badge>
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
                      <span className="text-xs text-muted-foreground italic">{t('core.doc.pending_dots', locale)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {statutBadge(doc.statut, locale)}
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
                        <Button variant="ghost" size="sm" title={t('core.doc.download', locale)}
                          onClick={() => window.open(`/api/documents/${doc.id}/download`, '_blank')}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {doc.storage_path && (
                        <Button
                          variant="ghost" size="sm" className="text-xs"
                          style={{ color: doc.statut === "traite" ? undefined : GOLD }}
                          title={doc.statut === "traite" ? t('core.doc.reanalyze', locale) : t('core.doc.retry', locale)}
                          onClick={async () => {
                            if (doc.statut === "traite" && !confirm(t('core.doc.confirm_reanalyze_processed', locale))) return
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
                          {doc.statut === "traite" ? t('core.doc.reanalyze', locale) : t('core.doc.retry', locale)}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title={t('core.doc.change_category', locale)}
                        onClick={() => { setChangeCatDoc(doc); setChangeCatType(doc.type_document || "autre"); setChangeCatHint("") }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        title={t('core.doc.delete', locale)}
                        onClick={async () => {
                          if (!confirm(`${t('core.doc.confirm_delete_one_a', locale)} "${doc.nom_fichier}" ? ${t('core.doc.confirm_delete_one_b', locale)}`)) return
                          try {
                            const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                            if (res.ok) { setDocuments(prev => prev.filter(d => d.id !== doc.id)) }
                            else { const d = await res.json(); alert(d.error || t('core.doc.delete_error', locale)) }
                          } catch { alert(t('core.doc.connection_error', locale)) }
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
                    <p className="text-muted-foreground">{t('core.doc.no_docs_folder', locale)}</p>
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
          <p className="text-xs text-muted-foreground mb-2">{t('core.doc.display_of', locale)} {visibleCount} {t('core.doc.of', locale)} {allCurrentDocs.length} {t('core.doc.documents_word', locale)}</p>
          <Button variant="outline" size="sm" onClick={() => setVisibleCount(v => v + pageSize)}>
            {t('core.doc.load_more', locale)}
          </Button>
        </div>
      )}
      {allCurrentDocs.length > 0 && allCurrentDocs.length <= visibleCount && (
        <p className="text-xs text-muted-foreground text-center">{allCurrentDocs.length} {t('core.doc.documents_word', locale)}</p>
      )}

      {/* Société confirmation dialog */}
      <Dialog open={!!confirmSocDoc} onOpenChange={(o) => { if (!o) setConfirmSocDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('core.doc.confirm_company_doc', locale)}</DialogTitle>
            <DialogDescription>
              {t('core.doc.confirm_company_msg_a', locale)} &quot;{confirmSocDoc?.filename}&quot; {t('core.doc.confirm_company_msg_b', locale)}
              {confirmSocDoc?.detected && <><br />{t('core.doc.company_detected', locale)} : <strong>{confirmSocDoc.detected}</strong></>}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={confirmSocId} onValueChange={setConfirmSocId}>
              <SelectTrigger><SelectValue placeholder={t('core.doc.select_company_dots', locale)} /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSocDoc(null)}>{t('core.doc.ignore', locale)}</Button>
            <Button
              disabled={!confirmSocId || confirmSocSaving}
              style={{ backgroundColor: NAVY }}
              onClick={async () => {
                if (!confirmSocDoc || !confirmSocId) return
                setConfirmSocSaving(true)
                try {
                  // Reassign société + update societe_detectee to the real name
                  const confirmedSocName = societes.find(s => s.id === confirmSocId)?.nom || null
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
              {confirmSocSaving ? t('core.doc.processing', locale) : t('core.doc.confirm_and_process', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassignment dialog for undetected société */}
      <Dialog open={!!reassignDoc} onOpenChange={(o) => { if (!o) { setReassignDoc(null); setReassignSocieteId("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('core.doc.confirm_company', locale)}</DialogTitle>
            <DialogDescription>
              {t('core.doc.confirm_company_msg_a', locale)} &quot;{reassignDoc?.nom_fichier}&quot; {t('core.doc.confirm_company_undet', locale)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Select value={reassignSocieteId} onValueChange={setReassignSocieteId}>
              <SelectTrigger><SelectValue placeholder={t('core.doc.select_company', locale)} /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignDoc(null); setReassignSocieteId("") }}>{t('core.doc.ignore', locale)}</Button>
            <Button style={{ backgroundColor: GOLD }} onClick={handleReassign} disabled={!reassignSocieteId}>{t('core.doc.confirm', locale)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Category change dialog */}
      <Dialog open={!!changeCatDoc} onOpenChange={(o) => { if (!o) setChangeCatDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('core.doc.change_doc_type', locale)}</DialogTitle>
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
              placeholder={t('core.doc.ai_hint_optional', locale)}
              value={changeCatHint}
              onChange={(e) => setChangeCatHint(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeCatDoc(null)}>{t('core.doc.cancel', locale)}</Button>
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
              {changeCatSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{t('core.doc.analyzing', locale)}</> : t('core.doc.confirm', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess duplicate confirmation dialog */}
      <Dialog open={!!reprocessDoc} onOpenChange={(o) => { if (!o) setReprocessDoc(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('core.doc.existing_doc_with_errors', locale)}</DialogTitle>
            <DialogDescription>
              &quot;{reprocessDoc?.filename}&quot; {t('core.doc.already_imported_reprocess', locale)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReprocessDoc(null)}>{t('core.doc.cancel', locale)}</Button>
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
              {t('core.doc.reprocess', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ClientPageShell>
  )
}
