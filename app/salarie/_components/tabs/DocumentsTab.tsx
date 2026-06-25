"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  FolderOpen, Loader2, Download, FileText, CreditCard, ShieldCheck,
  Upload, Paperclip, Eye, Inbox, Send,
} from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"
import { t, getLocale } from "@/lib/i18n"
import {
  CATEGORIE_LABELS, EXTENSIONS_LISIBLES, TAILLE_MAX_OCTETS,
  formaterTaille, getIconeMimeType, validerFichier,
  type DocumentRH, type DocumentCategorie,
} from "@/lib/rh/documents-rh"

type SalarieDocument = {
  id: string
  source_id: string
  categorie: 'contrat' | 'bulletin'
  type: string
  titre: string
  date: string | null
  statut: string
  url: string
  periode?: string
  salaire_net?: number
}

// DOC1 — Documents RH bidirectionnels + upload côté salarié.
export function DocumentsTab({ employe: _employe }: { employe: any }) {
  const locale = getLocale()
  const [docs, setDocs] = useState<SalarieDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Documents RH (DOC1).
  const [docsRh, setDocsRh] = useState<DocumentRH[]>([])
  const [loadingRh, setLoadingRh] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/salarie/documents")
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || t('sal.documents.loadError', locale))
          setDocs([])
        } else {
          setDocs(data.documents || [])
        }
      } catch {
        if (!cancelled) setError(t('sal.documents.networkError', locale))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Documents RH — (re)fetch à chaque refreshTick.
  useEffect(() => {
    let cancelled = false
    setLoadingRh(true)
    fetch('/api/documents-rh?archive=false')
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => { if (!cancelled) setDocsRh((d?.documents || []) as DocumentRH[]) })
      .catch(() => { if (!cancelled) setDocsRh([]) })
      .finally(() => { if (!cancelled) setLoadingRh(false) })
    return () => { cancelled = true }
  }, [refreshTick])

  const contrats = docs.filter(d => d.categorie === 'contrat')
  const bulletins = docs.filter(d => d.categorie === 'bulletin')
  const recus = docsRh.filter(d => d.direction === 'rh_vers_employe')
  const envois = docsRh.filter(d => d.direction === 'employe_vers_rh')
  const recusNonLus = recus.filter(d => !d.vu_par_destinataire_le).length

  return (
    <div className="space-y-4">
      {/* Documents RH bidirectionnels (DOC1) */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <Paperclip className="h-4 w-4" style={{ color: GOLD }} />
            {t('sal.documents.title', locale)}
            {recusNonLus > 0 && (
              <Badge className="bg-red-500 text-white text-[10px] h-5">
                {recusNonLus} {recusNonLus > 1 ? t('sal.documents.unreadPlural', locale) : t('sal.documents.unreadSingular', locale)}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm" className="text-white" style={{ backgroundColor: NAVY }}
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" /> {t('sal.documents.send', locale)}
          </Button>
        </CardHeader>
        <CardContent>
          {loadingRh ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : (
            <div className="space-y-5">
              {/* Reçus du RH */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                  <Inbox className="h-3.5 w-3.5" /> {t('sal.documents.receivedFromHr', locale)} ({recus.length})
                </p>
                {recus.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">{t('sal.documents.noneReceived', locale)}</p>
                ) : (
                  <div className="space-y-2">
                    {recus.map(d => <DocRhRow key={d.id} doc={d} onChange={() => setRefreshTick(t => t + 1)} />)}
                  </div>
                )}
              </div>

              {/* Mes envois */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> {t('sal.documents.mySends', locale)} ({envois.length})
                </p>
                {envois.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">{t('sal.documents.noneSent', locale)}</p>
                ) : (
                  <div className="space-y-2">
                    {envois.map(d => <DocRhRow key={d.id} doc={d} onChange={() => setRefreshTick(t => t + 1)} />)}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents agrégés legacy (contrats signés + bulletins) */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <FolderOpen className="h-4 w-4" style={{ color: GOLD }} />
            {t('sal.documents.officialDocs', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          ) : docs.length === 0 ? (
            <p className="text-gray-400 text-center py-8 text-sm">{t('sal.documents.noneAvailable', locale)}</p>
          ) : (
            <div className="space-y-5">
              {contrats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: GREEN }} /> {t('sal.documents.contracts', locale)}
                  </p>
                  <div className="space-y-2">
                    {contrats.map(d => <DocumentRow key={d.id} doc={d} />)}
                  </div>
                </div>
              )}
              {bulletins.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5" style={{ color: BLUE }} /> {t('sal.documents.payslips', locale)}
                  </p>
                  <div className="space-y-2">
                    {bulletins.map(d => <DocumentRow key={d.id} doc={d} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => setRefreshTick(t => t + 1)}
      />
    </div>
  )
}

// ─── Ligne document RH (DOC1) ────────────────────────────────────────
function DocRhRow({ doc, onChange }: { doc: DocumentRH; onChange: () => void }) {
  const locale = getLocale()
  const [downloading, setDownloading] = useState(false)
  const icon = getIconeMimeType(doc.mime_type)
  const isIncoming = doc.direction === 'rh_vers_employe'
  const nonLu = isIncoming && !doc.vu_par_destinataire_le
  const accent = isIncoming ? GOLD : BLUE

  const voir = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/documents-rh/${doc.id}/url`)
      const data = await res.json()
      if (!res.ok || !data?.url) {
        alert(data?.error || t('sal.documents.urlUnavailable', locale))
        return
      }
      window.open(data.url, '_blank')
      if (nonLu) onChange()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border bg-white"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="text-xl shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: NAVY }}>
          {doc.nom_fichier_original}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-gray-500">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: accent, color: accent }}>
            {CATEGORIE_LABELS[doc.categorie]}
          </Badge>
          <span>{formaterTaille(doc.taille_octets)}</span>
          <span>· {new Date(doc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {doc.lien_demande_conge_id && (
            <span className="italic">· {t('sal.documents.linkedToRequest', locale)}</span>
          )}
          {nonLu && (
            <Badge className="bg-red-500 text-white text-[10px] py-0 px-1.5">{t('sal.documents.new', locale)}</Badge>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 text-xs h-8" onClick={voir} disabled={downloading}>
        {downloading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
        {t('sal.documents.view', locale)}
      </Button>
    </div>
  )
}

// ─── Modale upload (DOC1) ────────────────────────────────────────────
function UploadModal({
  open, onOpenChange, onUploaded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onUploaded: () => void
}) {
  const locale = getLocale()
  const [file, setFile] = useState<File | null>(null)
  const [categorie, setCategorie] = useState<DocumentCategorie>('certificat_medical')
  const [description, setDescription] = useState("")
  const [demandes, setDemandes] = useState<Array<{ id: string; type_conge: string; date_debut: string }>>([])
  const [lienDemandeId, setLienDemandeId] = useState<string>('none')
  const [submitting, setSubmitting] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Charger demandes récentes (ouvertes + approuvées derniers 30j) pour lier.
  useEffect(() => {
    if (!open) return
    fetch('/api/rh/conges?self=1')
      .then(r => r.ok ? r.json() : { conges: [] })
      .then(d => {
        const rows = (d?.conges || d?.demandes || []) as Array<{ id: string; type_conge: string; date_debut: string }>
        setDemandes(rows.slice(0, 20).map(r => ({
          id: r.id, type_conge: r.type_conge, date_debut: r.date_debut,
        })))
      })
      .catch(() => setDemandes([]))
  }, [open])

  const reset = () => {
    setFile(null); setCategorie('certificat_medical'); setDescription("")
    setLienDemandeId('none'); setErreur(null)
  }

  const submit = async () => {
    setErreur(null)
    if (!file) { setErreur(t('sal.documents.noFileSelected', locale)); return }
    const v = validerFichier(file)
    if (!v.valide) { setErreur(v.erreur || t('sal.documents.invalidFile', locale)); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('categorie', categorie)
      fd.append('direction', 'employe_vers_rh')
      if (description) fd.append('description', description)
      if (lienDemandeId && lienDemandeId !== 'none') fd.append('lien_demande_conge_id', lienDemandeId)

      const res = await fetch('/api/documents-rh/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data?.error || `${t('sal.documents.errorPrefix', locale)} ${res.status}`)
        return
      }
      onUploaded()
      reset()
      onOpenChange(false)
    } catch (e: any) {
      setErreur(e?.message || t('sal.documents.networkError', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>{t('sal.documents.uploadTitle', locale)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-sm">{t('sal.documents.category', locale)}</Label>
            <Select value={categorie} onValueChange={v => setCategorie(v as DocumentCategorie)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="certificat_medical">{t('sal.documents.catMedical', locale)}</SelectItem>
                <SelectItem value="justificatif_conge">{t('sal.documents.catLeaveProof', locale)}</SelectItem>
                <SelectItem value="piece_identite">{t('sal.documents.catId', locale)}</SelectItem>
                <SelectItem value="autre">{t('sal.documents.catOther', locale)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">{t('sal.documents.description', locale)}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('sal.documents.descriptionPlaceholder', locale)} />
          </div>
          {demandes.length > 0 && (
            <div>
              <Label className="text-sm">{t('sal.documents.linkToLeave', locale)}</Label>
              <Select value={lienDemandeId} onValueChange={setLienDemandeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('sal.documents.noLink', locale)}</SelectItem>
                  {demandes.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.type_conge} · {d.date_debut}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-sm">{t('sal.documents.file', locale)}</Label>
            <Input
              type="file"
              accept={EXTENSIONS_LISIBLES.replace(/\s/g, '')}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {t('sal.documents.max', locale)} {formaterTaille(TAILLE_MAX_OCTETS)}. {t('sal.documents.accepted', locale)} {EXTENSIONS_LISIBLES}.
            </p>
            {file && (
              <p className="text-xs text-gray-600 mt-1">
                {getIconeMimeType(file.type)} {file.name} ({formaterTaille(file.size)})
              </p>
            )}
          </div>
          {erreur && (
            <div className="rounded-md bg-red-50 text-red-700 p-2 text-sm border border-red-200">{erreur}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('sal.documents.cancel', locale)}</Button>
          <Button onClick={submit} disabled={submitting || !file} style={{ backgroundColor: NAVY, color: 'white' }}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('sal.documents.submit', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentRow({ doc }: { doc: SalarieDocument }) {
  const locale = getLocale()
  const icon = doc.categorie === 'contrat'
    ? <FileText className="h-4 w-4" style={{ color: GREEN }} />
    : <CreditCard className="h-4 w-4" style={{ color: BLUE }} />
  const accent = doc.categorie === 'contrat' ? GREEN : BLUE
  const statutLabel: Record<string, string> = {
    signe: `${t('sal.documents.statutSigne', locale)} ✓✓`,
    signe_employe: t('sal.documents.statutSigneEmploye', locale),
    valide: t('sal.documents.statutValide', locale),
    paye: t('sal.documents.statutPaye', locale),
    declare_mra: t('sal.documents.statutDeclareMra', locale),
  }
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-white" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}12` }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: NAVY }}>{doc.titre}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: accent, color: accent }}>
            {statutLabel[doc.statut] || doc.statut}
          </Badge>
          {doc.date && (
            <span>{new Date(doc.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
          )}
        </div>
      </div>
      <a href={doc.url} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="outline" className="shrink-0 text-xs h-8">
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
      </a>
    </div>
  )
}
