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
          {roc && <Badge className={STATUS_COLOR[roc.statut || 'draft']}>{roc.statut || 'draft'}</Badge>}
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
        {roc?.statut === 'approved' && <Button onClick={() => doAction('submit_mra')} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Send className="h-4 w-4 mr-2" />{t('mra.roc.submit_mra', locale)}</Button>}
        {!canSubmitReview && roc?.statut === 'draft' && (
          <span className="text-xs text-slate-500 italic">
            Companies Act s.223 — directors ≥ 1 et somme actions = 100%
          </span>
        )}
      </div>
    </div>
  )
}
