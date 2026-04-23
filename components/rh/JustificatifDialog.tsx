"use client"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, Eye, Trash2, AlertCircle, FileText, Send, Inbox } from "lucide-react"
import {
  CATEGORIE_LABELS, EXTENSIONS_LISIBLES, TAILLE_MAX_OCTETS,
  formaterTaille, getIconeMimeType, validerFichier,
  type DocumentRH, type DocumentCategorie,
} from "@/lib/rh/documents-rh"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  demande: {
    id: string
    employe_id?: string
    employe?: { prenom?: string; nom?: string } | null
    type_conge?: string
    date_debut?: string
  }
  onChange?: () => void
}

/**
 * DOC1 hotfix — Modale 'Justificatifs d'une demande de congé'.
 *
 * Pré-remplit employe_id + lien_demande_conge_id + direction='employe_vers_rh'
 * + categorie='justificatif_conge' (RH upload pour le compte de l'employé).
 *
 * 2 onglets :
 *   - Documents (N) : liste + preview + suppression
 *   - Ajouter : file input + description optionnelle + envoi
 */
export function JustificatifDialog({ open, onOpenChange, demande, onChange }: Props) {
  const [docs, setDocs] = useState<DocumentRH[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [activeTab, setActiveTab] = useState<'liste' | 'ajouter'>('liste')

  useEffect(() => {
    if (!open || !demande.id) return
    let cancelled = false
    setLoading(true)
    const q = new URLSearchParams({ lien_demande_conge_id: demande.id })
    fetch(`/api/documents-rh?${q.toString()}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => { if (!cancelled) setDocs((d?.documents || []) as DocumentRH[]) })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, demande.id, refreshTick])

  // Si on arrive sans doc, ouvrir directement l'onglet 'Ajouter'.
  useEffect(() => {
    if (open && !loading && docs.length === 0) setActiveTab('ajouter')
    else if (open) setActiveTab('liste')
  }, [open, loading, docs.length])

  const handleRefresh = () => {
    setRefreshTick(t => t + 1)
    onChange?.()
  }

  const titreDemande = (() => {
    const type = demande.type_conge || '—'
    const date = demande.date_debut
      ? new Date(demande.date_debut).toLocaleDateString('fr-FR')
      : '—'
    const who = demande.employe
      ? `${demande.employe.prenom || ''} ${demande.employe.nom || ''}`.trim()
      : ''
    return `${type} du ${date}${who ? ` — ${who}` : ''}`
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            📎 Justificatifs — {titreDemande}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="liste">
              Documents ({docs.length})
            </TabsTrigger>
            <TabsTrigger value="ajouter">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Ajouter
            </TabsTrigger>
          </TabsList>

          {/* Onglet Documents */}
          <TabsContent value="liste" className="pt-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Aucun document attaché à cette demande.
                <button
                  type="button"
                  className="block mx-auto mt-2 text-indigo-600 underline text-xs"
                  onClick={() => setActiveTab('ajouter')}
                >
                  Uploader un justificatif
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(d => <DocRow key={d.id} doc={d} onChange={handleRefresh} />)}
              </div>
            )}
          </TabsContent>

          {/* Onglet Ajouter */}
          <TabsContent value="ajouter" className="pt-4">
            <UploadForm
              demande={demande}
              onUploaded={() => {
                handleRefresh()
                setActiveTab('liste')
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Ligne document ──────────────────────────────────────────────────
function DocRow({ doc, onChange }: { doc: DocumentRH; onChange: () => void }) {
  const [loading, setLoading] = useState(false)
  const isIncoming = doc.direction === 'employe_vers_rh'

  const voir = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents-rh/${doc.id}/url`)
      const d = await res.json()
      if (!res.ok || !d?.url) { alert(d?.error || 'URL indisponible'); return }
      window.open(d.url, '_blank')
    } finally { setLoading(false) }
  }

  const supprimer = async () => {
    if (!confirm(`Supprimer "${doc.nom_fichier_original}" ? Irréversible.`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/documents-rh/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Échec suppression')
      }
      onChange()
    } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
      <span className="text-xl shrink-0">{getIconeMimeType(doc.mime_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.nom_fichier_original}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            {isIncoming ? <Inbox className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            {CATEGORIE_LABELS[doc.categorie]}
          </span>
          <span>· {formaterTaille(doc.taille_octets)}</span>
          <span>· {new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={voir} disabled={loading} className="h-8 text-xs">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
        Voir
      </Button>
      <Button size="sm" variant="ghost" onClick={supprimer} disabled={loading} className="h-8" title="Supprimer">
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </Button>
    </div>
  )
}

// ─── Formulaire upload ───────────────────────────────────────────────
function UploadForm({
  demande, onUploaded,
}: {
  demande: Props['demande']
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [categorie, setCategorie] = useState<DocumentCategorie>('justificatif_conge')
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const submit = async () => {
    setErreur(null)
    if (!file) { setErreur('Aucun fichier sélectionné.'); return }
    if (!demande.employe_id) { setErreur('Employé inconnu pour cette demande.'); return }
    const v = validerFichier(file)
    if (!v.valide) { setErreur(v.erreur || 'Fichier invalide'); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('employe_id', demande.employe_id)
      fd.append('categorie', categorie)
      // Le RH agit pour le compte de l'employé sur un justificatif remis en
      // main propre : direction = 'employe_vers_rh' (comme si c'était lui
      // qui l'avait uploadé).
      fd.append('direction', 'employe_vers_rh')
      fd.append('lien_demande_conge_id', demande.id)
      if (description) fd.append('description', description)

      const res = await fetch('/api/documents-rh/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data?.error || `Erreur ${res.status}`)
        return
      }
      setFile(null); setDescription('')
      onUploaded()
    } catch (e: any) {
      setErreur(e?.message || 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">Catégorie</Label>
        <Select value={categorie} onValueChange={v => setCategorie(v as DocumentCategorie)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="justificatif_conge">Justificatif congé</SelectItem>
            <SelectItem value="certificat_medical">Certificat médical</SelectItem>
            <SelectItem value="autre">Autre</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm">Description (optionnel)</Label>
        <Input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Ex: Scan certificat apporté le 24/04"
        />
      </div>
      <div>
        <Label className="text-sm">Fichier</Label>
        <Input
          type="file"
          accept={EXTENSIONS_LISIBLES.replace(/\s/g, '')}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Max {formaterTaille(TAILLE_MAX_OCTETS)}. Acceptés : {EXTENSIONS_LISIBLES}.
        </p>
        {file && (
          <p className="text-xs text-gray-600 mt-1">
            {getIconeMimeType(file.type)} {file.name} ({formaterTaille(file.size)})
          </p>
        )}
      </div>
      {erreur && (
        <div className="rounded-md bg-red-50 text-red-700 p-2 text-sm border border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{erreur}</span>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={submit} disabled={submitting || !file} style={{ backgroundColor: GOLD, color: NAVY }}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Envoyer
        </Button>
      </div>
    </div>
  )
}

// ─── Bouton de ligne ─────────────────────────────────────────────────
/**
 * Bouton compact 📎 N à placer sur chaque ligne de demande. Gère son
 * propre état (count local + modale) pour fonctionner même si l'API
 * /api/rh/conges ne renvoie pas encore documents_count (commit 2).
 */
export function JustificatifBouton({
  demande, requisManquant, initialCount,
}: {
  demande: Props['demande']
  requisManquant?: boolean
  initialCount?: number
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(initialCount ?? null)

  useEffect(() => {
    if (initialCount !== undefined) { setCount(initialCount); return }
    if (!demande.id) return
    let cancelled = false
    const q = new URLSearchParams({ lien_demande_conge_id: demande.id })
    fetch(`/api/documents-rh?${q.toString()}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => { if (!cancelled) setCount((d?.documents || []).length) })
      .catch(() => { if (!cancelled) setCount(0) })
    return () => { cancelled = true }
  }, [demande.id, initialCount])

  const n = count ?? 0
  const manque = Boolean(requisManquant) && n === 0
  const color = manque ? 'text-red-600 border-red-300' : n > 0 ? 'text-emerald-600 border-emerald-300' : 'text-gray-500 border-gray-300'

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={`h-7 text-[11px] px-2 ${color}`}
        title={manque ? 'Justificatif requis — cliquer pour uploader' : 'Gérer les justificatifs'}
        onClick={() => setOpen(true)}
      >
        <FileText className="h-3 w-3 mr-1" />
        📎 {count == null ? '…' : n}
      </Button>
      <JustificatifDialog
        open={open}
        onOpenChange={setOpen}
        demande={demande}
        onChange={() => {
          // Re-fetch count après ajout/suppression.
          if (!demande.id) return
          const q = new URLSearchParams({ lien_demande_conge_id: demande.id })
          fetch(`/api/documents-rh?${q.toString()}`)
            .then(r => r.ok ? r.json() : { documents: [] })
            .then(d => setCount((d?.documents || []).length))
            .catch(() => {})
        }}
      />
    </>
  )
}
