"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, Building2, Check, Send } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', review: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800', submitted: 'bg-indigo-100 text-indigo-800',
}

export default function MraRocPage() {
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
  })

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

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-slate-700" /> ROC Annual Return</h1>
          <p className="text-sm text-slate-500">Companies Act 2001 Maurice — dépôt 28 jours après l'AGM</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          {roc && <Badge className={STATUS_COLOR[roc.statut || 'draft']}>{roc.statut || 'draft'}</Badge>}
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Informations société</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-600">Adresse registered office</label><input value={form.registered_office_address} onChange={e => setForm({ ...form, registered_office_address: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">Date anniversaire AGM</label><input type="date" value={form.date_anniversaire} onChange={e => setForm({ ...form, date_anniversaire: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">Capital autorisé (MUR)</label><input type="number" value={form.share_capital_authorized} onChange={e => setForm({ ...form, share_capital_authorized: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">Capital émis (MUR)</label><input type="number" value={form.share_capital_issued} onChange={e => setForm({ ...form, share_capital_issued: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">Nb board meetings</label><input type="number" value={form.board_meetings_count} onChange={e => setForm({ ...form, board_meetings_count: parseInt(e.target.value) || 0 })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">AGM tenue ?</label><select value={form.agm_held ? '1' : '0'} onChange={e => setForm({ ...form, agm_held: e.target.value === '1' })} className="w-full border rounded px-2 py-1 text-sm"><option value="0">Non</option><option value="1">Oui</option></select></div>
          <div><label className="text-xs text-slate-600">Date AGM</label><input type="date" value={form.agm_date || ''} onChange={e => setForm({ ...form, agm_date: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-slate-600">Auditeur</label><input value={form.auditor_name || ''} onChange={e => setForm({ ...form, auditor_name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div className="col-span-2"><label className="text-xs text-slate-600">Notes</label><textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={2} /></div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={save} className="bg-slate-700 hover:bg-slate-800 text-white">Enregistrer</Button>
        {roc?.statut === 'draft' && <Button onClick={() => doAction('submit_review')} variant="outline">Soumettre révision</Button>}
        {roc?.statut === 'review' && <Button onClick={() => doAction('approve')} variant="outline" className="text-emerald-700"><Check className="h-4 w-4 mr-2" />Approuver</Button>}
        {roc?.statut === 'approved' && <Button onClick={() => doAction('submit_mra')} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Send className="h-4 w-4 mr-2" />Soumettre ROC</Button>}
      </div>
    </div>
  )
}
