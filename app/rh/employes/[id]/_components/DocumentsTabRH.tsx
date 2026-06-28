"use client"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  FolderOpen, Loader2, Upload, Eye, Trash2, Archive, EyeOff,
  Inbox, Send, CheckCircle2, AlertCircle,
} from "lucide-react"
import {
  CATEGORIE_LABELS, EXTENSIONS_LISIBLES, TAILLE_MAX_OCTETS,
  formaterTaille, getIconeMimeType, validerFichier,
  type DocumentRH, type DocumentCategorie,
} from "@/lib/rh/documents-rh"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Props {
  employeId: string
  employeNom?: string
}

// DOC1 — Onglet Documents RH sur fiche employé (côté RH/admin).
// Vue complète (reçus + envoyés), filtres, upload direction=rh_vers_employe,
// actions archivage / suppression / marquage confidentiel.
export function DocumentsTabRH({ employeId, employeNom }: Props) {
  const locale = getLocale()
  const [docs, setDocs] = useState<DocumentRH[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  // Filtres
  const [filtreCat, setFiltreCat] = useState<string>('all')
  const [filtreDir, setFiltreDir] = useState<string>('all')
  const [showArchive, setShowArchive] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const q = new URLSearchParams({ employe_id: employeId })
    if (!showArchive) q.set('archive', 'false')
    fetch(`/api/documents-rh?${q.toString()}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => { if (!cancelled) setDocs((d?.documents || []) as DocumentRH[]) })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [employeId, showArchive, refreshTick])

  const docsFiltered = useMemo(() => {
    return docs.filter(d => {
      if (filtreCat !== 'all' && d.categorie !== filtreCat) return false
      if (filtreDir !== 'all' && d.direction !== filtreDir) return false
      return true
    })
  }, [docs, filtreCat, filtreDir])

  const recus = docs.filter(d => d.direction === 'employe_vers_rh' && !d.archive).length
  const envoyes = docs.filter(d => d.direction === 'rh_vers_employe' && !d.archive).length
  const nonLus = docs.filter(d => d.direction === 'employe_vers_rh' && !d.vu_par_destinataire_le && !d.archive).length

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#4191FF]" />
            {t('sarh.docrh.title', locale)}
            <span className="text-xs font-normal text-gray-500">
              · {recus} {recus > 1 ? t('sarh.docrh.received_pl', locale) : t('sarh.docrh.received_sg', locale)} · {envoyes} {envoyes > 1 ? t('sarh.docrh.sent_pl', locale) : t('sarh.docrh.sent_sg', locale)}
              {nonLus > 0 && <span className="ml-2 text-red-600 font-semibold">· {nonLus} {nonLus > 1 ? t('sarh.docrh.unread_pl', locale) : t('sarh.docrh.unread_sg', locale)}</span>}
            </span>
          </CardTitle>
          <Button size="sm" className="text-white" style={{ backgroundColor: NAVY }} onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> {t('sarh.docrh.transmit', locale)}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filtres */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={filtreCat} onValueChange={setFiltreCat}>
              <SelectTrigger className="w-48 h-8"><SelectValue placeholder={t('sarh.docrh.categorie', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sarh.docrh.all_categories', locale)}</SelectItem>
                {(Object.keys(CATEGORIE_LABELS) as DocumentCategorie[]).map(k => (
                  <SelectItem key={k} value={k}>{CATEGORIE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtreDir} onValueChange={setFiltreDir}>
              <SelectTrigger className="w-48 h-8"><SelectValue placeholder={t('sarh.docrh.direction', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sarh.docrh.all_directions', locale)}</SelectItem>
                <SelectItem value="employe_vers_rh">{t('sarh.docrh.received_from', locale)}</SelectItem>
                <SelectItem value="rh_vers_employe">{t('sarh.docrh.sent_to', locale)}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-2">
              <Switch checked={showArchive} onCheckedChange={setShowArchive} />
              <span className="text-xs text-gray-600">{t('sarh.docrh.include_archived', locale)}</span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : docsFiltered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-6">{t('srh.docs.empty', locale)}{showArchive ? '' : t('srh.docs.empty_active_suffix', locale)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{t('sarh.docrh.th_fichier', locale)}</TableHead>
                    <TableHead>{t('sarh.docrh.th_categorie', locale)}</TableHead>
                    <TableHead>{t('sarh.docrh.th_direction', locale)}</TableHead>
                    <TableHead>{t('sarh.docrh.th_taille', locale)}</TableHead>
                    <TableHead>{t('sarh.docrh.th_date', locale)}</TableHead>
                    <TableHead>{t('sarh.docrh.th_statut', locale)}</TableHead>
                    <TableHead className="text-right">{t('sarh.docrh.th_actions', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docsFiltered.map(d => (
                    <DocRhTableRow key={d.id} doc={d} onChange={() => setRefreshTick(t => t + 1)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UploadModalRH
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        employeId={employeId}
        employeNom={employeNom}
        onUploaded={() => setRefreshTick(t => t + 1)}
      />
    </div>
  )
}

// ─── Ligne table ─────────────────────────────────────────────────────
function DocRhTableRow({ doc, onChange }: { doc: DocumentRH; onChange: () => void }) {
  const locale = getLocale()
  const [loading, setLoading] = useState(false)
  const isIncoming = doc.direction === 'employe_vers_rh'
  const nonLu = isIncoming && !doc.vu_par_destinataire_le

  const voir = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents-rh/${doc.id}/url`)
      const d = await res.json()
      if (!res.ok || !d?.url) { alert(d?.error || t('sarh.docrh.url_unavailable', locale)); return }
      window.open(d.url, '_blank')
    } finally { setLoading(false) }
  }

  const markVu = async () => {
    setLoading(true)
    try {
      await fetch(`/api/documents-rh/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vu: true }),
      })
      onChange()
    } finally { setLoading(false) }
  }

  const toggleArchive = async () => {
    setLoading(true)
    try {
      await fetch(`/api/documents-rh/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: !doc.archive }),
      })
      onChange()
    } finally { setLoading(false) }
  }

  const toggleConfidentiel = async () => {
    setLoading(true)
    try {
      await fetch(`/api/documents-rh/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confidentiel_rh_only: !doc.confidentiel_rh_only }),
      })
      onChange()
    } finally { setLoading(false) }
  }

  const supprimer = async () => {
    if (!confirm(t('sarh.docrh.confirm_delete', locale).replace('{name}', doc.nom_fichier_original))) return
    setLoading(true)
    try {
      const res = await fetch(`/api/documents-rh/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || t('sarh.docrh.delete_failed', locale))
      }
      onChange()
    } finally { setLoading(false) }
  }

  return (
    <TableRow className={doc.archive ? 'opacity-60' : ''}>
      <TableCell className="text-xl">{getIconeMimeType(doc.mime_type)}</TableCell>
      <TableCell className="font-medium max-w-xs truncate" title={doc.nom_fichier_original}>
        {doc.nom_fichier_original}
        {doc.description && (
          <p className="text-[11px] text-gray-400 italic truncate">{doc.description}</p>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">{CATEGORIE_LABELS[doc.categorie]}</Badge>
      </TableCell>
      <TableCell className="text-xs">
        {isIncoming ? (
          <span className="flex items-center gap-1 text-blue-700"><Inbox className="h-3 w-3" /> {t('sarh.docrh.received_sg', locale)}</span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-700"><Send className="h-3 w-3" /> {t('sarh.docrh.sent_sg', locale)}</span>
        )}
      </TableCell>
      <TableCell className="text-xs">{formaterTaille(doc.taille_octets)}</TableCell>
      <TableCell className="text-xs">
        {new Date(doc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
      </TableCell>
      <TableCell className="text-xs">
        <div className="flex flex-wrap gap-1">
          {doc.archive && <Badge className="bg-gray-100 text-gray-600 text-[10px]">{t('sarh.docrh.badge_archived', locale)}</Badge>}
          {doc.confidentiel_rh_only && <Badge className="bg-purple-100 text-purple-700 text-[10px]"><EyeOff className="h-2.5 w-2.5 mr-0.5" /> {t('sarh.docrh.badge_rh_only', locale)}</Badge>}
          {nonLu && <Badge className="bg-red-500 text-white text-[10px]">{t('sarh.docrh.badge_to_read', locale)}</Badge>}
          {!nonLu && isIncoming && doc.vu_par_destinataire_le && (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> {t('sarh.docrh.badge_read', locale)}</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={voir} disabled={loading} title={t('sarh.docrh.tip_view', locale)}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          {nonLu && (
            <Button size="sm" variant="ghost" onClick={markVu} disabled={loading} title={t('sarh.docrh.tip_mark_read', locale)}>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={toggleConfidentiel} disabled={loading}
            title={doc.confidentiel_rh_only ? t('sarh.docrh.tip_make_visible', locale) : t('sarh.docrh.tip_hide', locale)}>
            <EyeOff className={`h-3.5 w-3.5 ${doc.confidentiel_rh_only ? 'text-purple-600' : 'text-gray-400'}`} />
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleArchive} disabled={loading}
            title={doc.archive ? t('sarh.docrh.tip_unarchive', locale) : t('sarh.docrh.tip_archive', locale)}>
            <Archive className={`h-3.5 w-3.5 ${doc.archive ? 'text-amber-600' : 'text-gray-400'}`} />
          </Button>
          <Button size="sm" variant="ghost" onClick={supprimer} disabled={loading} title={t('sarh.docrh.tip_delete', locale)}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Modale upload côté RH ───────────────────────────────────────────
function UploadModalRH({
  open, onOpenChange, employeId, employeNom, onUploaded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employeId: string
  employeNom?: string
  onUploaded: () => void
}) {
  const locale = getLocale()
  const [file, setFile] = useState<File | null>(null)
  const [categorie, setCategorie] = useState<DocumentCategorie>('contrat')
  const [description, setDescription] = useState("")
  const [confidentiel, setConfidentiel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const reset = () => {
    setFile(null); setCategorie('contrat'); setDescription(""); setConfidentiel(false); setErreur(null)
  }

  const submit = async () => {
    setErreur(null)
    if (!file) { setErreur(t('sarh.docrh.err_no_file', locale)); return }
    const v = validerFichier(file)
    if (!v.valide) { setErreur(v.erreur || t('sarh.docrh.err_invalid_file', locale)); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('employe_id', employeId)
      fd.append('categorie', categorie)
      fd.append('direction', 'rh_vers_employe')
      if (description) fd.append('description', description)
      if (confidentiel) fd.append('confidentiel', 'true')

      const res = await fetch('/api/documents-rh/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data?.error || t('sarh.docrh.err_status', locale).replace('{status}', String(res.status)))
        return
      }
      onUploaded()
      reset()
      onOpenChange(false)
    } catch (e: any) {
      setErreur(e?.message || t('sarh.docrh.err_network', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ color: NAVY }}>
            {employeNom ? t('sarh.docrh.dlg_title_to', locale).replace('{name}', employeNom) : t('sarh.docrh.dlg_title', locale)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-sm">{t('sarh.docrh.categorie', locale)}</Label>
            <Select value={categorie} onValueChange={v => setCategorie(v as DocumentCategorie)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contrat">{t('sarh.docrh.cat_contrat', locale)}</SelectItem>
                <SelectItem value="avenant">{t('sarh.docrh.cat_avenant', locale)}</SelectItem>
                <SelectItem value="attestation_employeur">{t('sarh.docrh.cat_attestation', locale)}</SelectItem>
                <SelectItem value="fiche_paie">{t('sarh.docrh.cat_fiche_paie', locale)}</SelectItem>
                <SelectItem value="note_rh">{t('sarh.docrh.cat_note_rh', locale)}</SelectItem>
                <SelectItem value="autre">{t('sarh.docrh.cat_autre', locale)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">{t('sarh.docrh.lbl_description', locale)}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('sarh.docrh.ph_description', locale)} />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-purple-50 border border-purple-200">
            <Switch checked={confidentiel} onCheckedChange={setConfidentiel} />
            <div>
              <p className="text-sm font-medium text-purple-900">{t('sarh.docrh.confidentiel', locale)}</p>
              <p className="text-[11px] text-purple-700">{t('sarh.docrh.confidentiel_hint', locale)}</p>
            </div>
          </div>
          <div>
            <Label className="text-sm">{t('sarh.docrh.lbl_fichier', locale)}</Label>
            <Input
              type="file"
              accept={EXTENSIONS_LISIBLES.replace(/\s/g, '')}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {t('sarh.docrh.max_accepted', locale).replace('{x}', formaterTaille(TAILLE_MAX_OCTETS)).replace('{y}', EXTENSIONS_LISIBLES)}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('sarh.docrh.cancel', locale)}</Button>
          <Button onClick={submit} disabled={submitting || !file} style={{ backgroundColor: GOLD, color: NAVY }}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('sarh.docrh.transmit_btn', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
