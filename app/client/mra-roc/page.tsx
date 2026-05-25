"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, Building2, Check, Send, Plus, X, Users, PieChart, Upload, FileText, ExternalLink } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Parse les notes ROC : peut être JSON {manual_submission:{...}} ou texte legacy. */
function parseManualSubmission(notes: string | null | undefined): {
  ack_ref: string; ack_pdf_path: string; submitted_at: string; status: string
} | null {
  if (!notes) return null
  try {
    const obj = JSON.parse(notes)
    return obj?.manual_submission || null
  } catch { return null }
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', review: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800', submitted: 'bg-indigo-100 text-indigo-800',
  submitted_manual: 'bg-indigo-100 text-indigo-800', accepted: 'bg-emerald-200 text-emerald-900',
}

export default function MraRocPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [roc, setRoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [form, setForm] = useState<any>({
    date_anniversaire: '', registered_office_address: '',
    board_meetings_count: 0, agm_held: false, agm_date: '', auditor_name: '',
    share_capital_authorized: 0, share_capital_issued: 0, notes: '',
    directors: [] as Array<any>,
    shareholders: [] as Array<any>,
  })

  // ── Directors / Shareholders (Companies Act s.223) ───────────────────────
  const addDirector = () => setForm((f: any) => ({
    ...f,
    directors: [
      ...(f.directors || []),
      { name: '', nic: '', nationality: 'MU', date_appointed: '', resigned: false, address: '' },
    ],
  }))
  const updateDirector = (i: number, key: string, value: any) => setForm((f: any) => {
    const arr = [...(f.directors || [])]
    arr[i] = { ...arr[i], [key]: value }
    return { ...f, directors: arr }
  })
  const removeDirector = (i: number) => setForm((f: any) => ({
    ...f,
    directors: (f.directors || []).filter((_: any, j: number) => j !== i),
  }))

  const addShareholder = () => setForm((f: any) => ({
    ...f,
    shareholders: [
      ...(f.shareholders || []),
      { name: '', brn_or_nic: '', shares: 0, pct: 0, type: 'ordinary' },
    ],
  }))
  const updateShareholder = (i: number, key: string, value: any) => setForm((f: any) => {
    const arr = [...(f.shareholders || [])]
    arr[i] = { ...arr[i], [key]: value }
    return { ...f, shareholders: arr }
  })
  const removeShareholder = (i: number) => setForm((f: any) => ({
    ...f,
    shareholders: (f.shareholders || []).filter((_: any, j: number) => j !== i),
  }))

  const totalPct = (form.shareholders || []).reduce(
    (sum: number, s: any) => sum + (Number(s.pct) || 0),
    0,
  )
  const pctOk = Math.abs(totalPct - 100) <= 0.5 && (form.shareholders || []).length > 0
  const directorsOk = (form.directors || []).some((d: any) => (d?.name || '').trim().length > 0)
  const canSubmitReview = directorsOk && pctOk

  // ── Soumission manuelle (portail CBRD/MRA — pas d'API) ─────────────────
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitAckRef, setSubmitAckRef] = useState('')
  const [submitFile, setSubmitFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const manualSub = roc ? parseManualSubmission(roc?.notes) : null
  // Statut effectif (override par flag interne stocké dans notes JSON).
  const effectiveStatut = manualSub?.status || roc?.statut || 'draft'

  const submitManual = async () => {
    if (!societeId || !submitAckRef.trim() || !submitFile) return
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('societe_id', societeId)
      fd.append('exercice', exercice)
      fd.append('action', 'submit_manual')
      fd.append('mra_ack_ref', submitAckRef.trim())
      fd.append('ack_pdf', submitFile)
      const r = await fetch('/api/comptable/mra/roc', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Échec soumission manuelle')
      setSubmitOpen(false); setSubmitAckRef(''); setSubmitFile(null)
      load()
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const r = await fetch(`/api/comptable/mra/roc?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json())
      if (r.roc) { setRoc(r.roc); setForm({ ...form, ...r.roc }) }
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const save = async () => {
    if (!societeId) return
    await fetch('/api/comptable/mra/roc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ societe_id: societeId, exercice, action: 'save', payload: form }) })
    load()
  }
  const doAction = async (action: string) => {
    if (!societeId) return
    await fetch('/api/comptable/mra/roc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ societe_id: societeId, exercice, action }) })
    load()
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('mra.roc.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('mra.roc.loading', locale)}</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-slate-700" /> {t('mra.roc.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('mra.roc.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          {roc && <Badge className={STATUS_COLOR[effectiveStatut] || STATUS_COLOR.draft}>{effectiveStatut}</Badge>}
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">{t('mra.roc.company_info', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.address', locale)}</label><input value={form.registered_office_address} onChange={e => setForm({ ...form, registered_office_address: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.agm_anniversary', locale)}</label><input type="date" value={form.date_anniversaire} onChange={e => setForm({ ...form, date_anniversaire: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.capital_authorized', locale)}</label><input type="number" value={form.share_capital_authorized} onChange={e => setForm({ ...form, share_capital_authorized: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.capital_issued', locale)}</label><input type="number" value={form.share_capital_issued} onChange={e => setForm({ ...form, share_capital_issued: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.board_meetings', locale)}</label><input type="number" value={form.board_meetings_count} onChange={e => setForm({ ...form, board_meetings_count: parseInt(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.agm_held', locale)}</label><select value={form.agm_held ? '1' : '0'} onChange={e => setForm({ ...form, agm_held: e.target.value === '1' })} className="w-full border rounded px-2 py-1 text-sm"><option value="0">{t('mra.roc.opt.no', locale)}</option><option value="1">{t('mra.roc.opt.yes', locale)}</option></select></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.agm_date', locale)}</label><input type="date" value={form.agm_date || ''} onChange={e => setForm({ ...form, agm_date: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">{t('mra.roc.field.auditor', locale)}</label><input value={form.auditor_name || ''} onChange={e => setForm({ ...form, auditor_name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div className="col-span-2"><label className="text-xs text-slate-600">{t('mra.roc.field.notes', locale)}</label><textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={2} /></div>
        </CardContent>
      </Card>

      {/* Directors — Companies Act 2001 s.223(1)(a) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-600" />
            Administrateurs ({(form.directors || []).length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addDirector} aria-label="Ajouter un administrateur">
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent>
          {(form.directors || []).length === 0 && (
            <p className="text-sm text-amber-700 italic">
              Aucun administrateur saisi — Companies Act s.223 requiert au moins un directeur nommé.
            </p>
          )}
          <div className="space-y-2">
            {(form.directors || []).map((d: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 p-2 border rounded bg-slate-50/50">
                <input
                  placeholder="Prénom"
                  value={d.first_name || ''}
                  onChange={e => updateDirector(i, 'first_name', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <input
                  placeholder="Nom"
                  value={d.name || ''}
                  onChange={e => updateDirector(i, 'name', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <input
                  placeholder="NIC / Passeport"
                  value={d.nic || ''}
                  onChange={e => updateDirector(i, 'nic', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <input
                  type="date"
                  title="Date de nomination"
                  value={d.date_appointed || ''}
                  onChange={e => updateDirector(i, 'date_appointed', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <label className="col-span-3 flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!d.resigned}
                    onChange={e => updateDirector(i, 'resigned', e.target.checked)}
                  />
                  Démissionnaire
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="col-span-1 text-red-600 hover:text-red-700"
                  onClick={() => removeDirector(i)}
                  aria-label={`Supprimer le directeur ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
                <input
                  placeholder="Adresse complète"
                  value={d.address || ''}
                  onChange={e => updateDirector(i, 'address', e.target.value)}
                  className="col-span-12 border rounded px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shareholders — Companies Act 2001 s.223(1)(b) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-slate-600" />
            Actionnaires ({(form.shareholders || []).length})
            <Badge className={pctOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
              Total {totalPct.toFixed(2)}%
            </Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addShareholder} aria-label="Ajouter un actionnaire">
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent>
          {(form.shareholders || []).length === 0 && (
            <p className="text-sm text-amber-700 italic">
              Aucun actionnaire saisi — Companies Act s.223 requiert la liste des membres.
            </p>
          )}
          <div className="space-y-2">
            {(form.shareholders || []).map((s: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 p-2 border rounded bg-slate-50/50 items-center">
                <input
                  placeholder="Nom / dénomination"
                  value={s.name || ''}
                  onChange={e => updateShareholder(i, 'name', e.target.value)}
                  className="col-span-4 border rounded px-2 py-1 text-sm"
                />
                <input
                  placeholder="BRN / NIC"
                  value={s.brn_or_nic || ''}
                  onChange={e => updateShareholder(i, 'brn_or_nic', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  placeholder="Nb parts"
                  value={s.shares ?? 0}
                  onChange={e => updateShareholder(i, 'shares', parseInt(e.target.value) || 0)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="%"
                  value={s.pct ?? 0}
                  onChange={e => updateShareholder(i, 'pct', parseFloat(e.target.value) || 0)}
                  className="col-span-1 border rounded px-2 py-1 text-sm"
                />
                <select
                  value={s.type || 'ordinary'}
                  onChange={e => updateShareholder(i, 'type', e.target.value)}
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                  aria-label="Type d'action"
                >
                  <option value="ordinary">Ordinaire</option>
                  <option value="preference">Préférentielle</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="col-span-1 text-red-600 hover:text-red-700"
                  onClick={() => removeShareholder(i)}
                  aria-label={`Supprimer l'actionnaire ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {(form.shareholders || []).length > 0 && !pctOk && (
            <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Total % actions = {totalPct.toFixed(2)}% — doit atteindre 100% pour soumission review.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap items-center">
        <Button onClick={save} className="bg-slate-700 hover:bg-slate-800 text-white">{t('mra.roc.save', locale)}</Button>
        {roc?.statut === 'draft' && (
          <Button
            onClick={() => doAction('submit_review')}
            variant="outline"
            disabled={!canSubmitReview}
            title={!canSubmitReview ? 'Renseigner au moins 1 directeur nommé et un actionnariat = 100%' : ''}
          >
            {t('mra.roc.submit_review', locale)}
          </Button>
        )}
        {roc?.statut === 'review' && <Button onClick={() => doAction('approve')} variant="outline" className="text-emerald-700"><Check className="h-4 w-4 mr-2" />{t('mra.roc.approve', locale)}</Button>}
        {roc?.statut === 'approved' && !manualSub && (
          <Button onClick={() => setSubmitOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Upload className="h-4 w-4 mr-2" />J'ai soumis sur le portail MRA/CBRD
          </Button>
        )}
        {!canSubmitReview && roc?.statut === 'draft' && (
          <span className="text-xs text-slate-500 italic">
            Companies Act s.223 — directors ≥ 1 et somme actions = 100%
          </span>
        )}
      </div>

      {/* Soumission manuelle — preuve d'archivage du dépôt CBRD/MRA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-600" />
            Soumission manuelle (portail CBRD/MRA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-600 mb-3">
            Le ROC Annual Return se dépose manuellement sur le portail{' '}
            <a href="https://onlinebrd.govmu.org" target="_blank" rel="noopener noreferrer"
               className="text-indigo-600 hover:underline inline-flex items-center gap-1">
              CBRD <ExternalLink className="h-3 w-3" />
            </a>.
            Après dépôt, remontez ici la référence et l'accusé PDF pour preuve réglementaire.
          </p>
          {manualSub ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <Check className="h-4 w-4" />
                Déclaration soumise manuellement
              </div>
              <div className="text-xs text-emerald-900 space-y-1">
                <div><span className="font-semibold">Référence :</span> {manualSub.ack_ref}</div>
                <div><span className="font-semibold">Date :</span> {new Date(manualSub.submitted_at).toLocaleString('fr-FR')}</div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span className="font-mono break-all">{manualSub.ack_pdf_path}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSubmitOpen(true)}>
                Re-soumettre / mettre à jour
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setSubmitOpen(true)}
              variant="outline"
              disabled={!roc || roc.statut === 'draft'}
              title={!roc || roc.statut === 'draft' ? 'Passer en revue puis approuver avant soumission' : ''}
            >
              <Upload className="h-4 w-4 mr-2" />J'ai soumis sur le portail MRA/CBRD
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={submitOpen} onOpenChange={(o) => { if (!submitting) setSubmitOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la soumission manuelle</DialogTitle>
            <DialogDescription>
              Renseignez la référence de dépôt CBRD/MRA et joignez l'accusé PDF (max 10MB).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Référence MRA / CBRD *</label>
              <input
                type="text"
                value={submitAckRef}
                onChange={e => setSubmitAckRef(e.target.value)}
                placeholder="ex: AR-2025-12345"
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Accusé de réception PDF *</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setSubmitFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {submitFile && (
                <p className="text-xs text-slate-500 mt-1">
                  {submitFile.name} ({(submitFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>Annuler</Button>
            <Button
              onClick={submitManual}
              disabled={submitting || !submitAckRef.trim() || !submitFile}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
