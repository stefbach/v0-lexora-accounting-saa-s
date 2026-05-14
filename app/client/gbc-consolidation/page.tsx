"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCw, AlertCircle, Layers, Plus } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

const EMPTY_REL = {
  child_societe_id: '', pct_detention: 100, pct_voting_rights: 100,
  relationship_type: 'subsidiary', acquisition_date: new Date().toISOString().slice(0, 10),
  acquisition_cost_mur: 0, fair_value_net_assets_acquisition_mur: 0,
  consolidation_method: 'full',
}

export default function GbcConsolidationPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [allSocietes, setAllSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_REL)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/comptable/gbc/consolidate?parent_societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/comptable/mes-societes`).then(r => r.json()).catch(() => ({ societes: [] })),
      ])
      if (r1.error) throw new Error(r1.error)
      setData(r1)
      // Robust extraction : l'API peut renvoyer { societes: [] }, [...], { error } ou autre
      const list = Array.isArray(r2?.societes) ? r2.societes
        : Array.isArray(r2) ? r2 : []
      setAllSocietes(list.filter((s: any) => s.id !== societeId))
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const addRelationship = async () => {
    if (!societeId || !form.child_societe_id) { setError(t('gbc.consolidation.required_subsidiary', locale)); return }
    setSaving(true); setError(null)
    try {
      // Calcul goodwill : cost - FV × pct
      const goodwill = Number(form.acquisition_cost_mur) - (Number(form.fair_value_net_assets_acquisition_mur) * Number(form.pct_detention) / 100)
      const res = await fetch('/api/comptable/gbc/consolidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_relationship',
          payload: {
            parent_societe_id: societeId,
            child_societe_id: form.child_societe_id,
            pct_detention: Number(form.pct_detention),
            pct_voting_rights: Number(form.pct_voting_rights),
            relationship_type: form.relationship_type,
            acquisition_date: form.acquisition_date,
            acquisition_cost_mur: Number(form.acquisition_cost_mur),
            fair_value_net_assets_acquisition_mur: Number(form.fair_value_net_assets_acquisition_mur),
            goodwill_mur: Math.round(goodwill * 100) / 100,
            consolidation_method: form.consolidation_method,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); setForm(EMPTY_REL); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('gbc.common.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('gbc.common.loading', locale)}</div>

  const goodwillPreview = Number(form.acquisition_cost_mur) - (Number(form.fair_value_net_assets_acquisition_mur) * Number(form.pct_detention) / 100)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="h-6 w-6 text-indigo-600" /> {t('gbc.consolidation.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('gbc.consolidation.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('gbc.common.refresh', locale)}</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />{t('gbc.consolidation.add_subsidiary', locale)}</Button></DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>{t('gbc.consolidation.add_subsidiary_dialog', locale)}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label>{t('gbc.consolidation.subsidiary_label', locale)}</Label>
                  <Select value={form.child_societe_id} onValueChange={v => setForm({ ...form, child_societe_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t('gbc.consolidation.subsidiary_placeholder', locale)} /></SelectTrigger>
                    <SelectContent>
                      {allSocietes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('gbc.consolidation.pct_detention', locale)}</Label><Input type="number" min="0" max="100" step="0.01" value={form.pct_detention} onChange={e => setForm({ ...form, pct_detention: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.consolidation.pct_voting', locale)}</Label><Input type="number" min="0" max="100" step="0.01" value={form.pct_voting_rights} onChange={e => setForm({ ...form, pct_voting_rights: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.consolidation.type', locale)}</Label>
                    <Select value={form.relationship_type} onValueChange={v => setForm({ ...form, relationship_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subsidiary">{t('gbc.consolidation.type_subsidiary', locale)}</SelectItem>
                        <SelectItem value="associate">{t('gbc.consolidation.type_associate', locale)}</SelectItem>
                        <SelectItem value="joint_venture">{t('gbc.consolidation.type_jv', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.consolidation.method', locale)}</Label>
                    <Select value={form.consolidation_method} onValueChange={v => setForm({ ...form, consolidation_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">{t('gbc.consolidation.method_full', locale)}</SelectItem>
                        <SelectItem value="equity">{t('gbc.consolidation.method_equity', locale)}</SelectItem>
                        <SelectItem value="proportional">{t('gbc.consolidation.method_proportional', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.consolidation.acquisition_date', locale)}</Label><Input type="date" value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} /></div>
                  <div><Label>{t('gbc.consolidation.acquisition_cost', locale)}</Label><Input type="number" min="0" value={form.acquisition_cost_mur} onChange={e => setForm({ ...form, acquisition_cost_mur: Number(e.target.value) || 0 })} /></div>
                  <div className="col-span-2"><Label>{t('gbc.consolidation.fv_net_assets', locale)}</Label><Input type="number" min="0" value={form.fair_value_net_assets_acquisition_mur} onChange={e => setForm({ ...form, fair_value_net_assets_acquisition_mur: Number(e.target.value) || 0 })} /></div>
                </div>
                <div className="rounded bg-indigo-50 border border-indigo-200 p-3 text-sm">
                  <strong>{t('gbc.consolidation.goodwill_calculated', locale)}</strong> {fmt(goodwillPreview)} MUR
                  <div className="text-xs text-slate-500 mt-1">{t('gbc.consolidation.goodwill_formula_cost', locale)} {fmt(form.acquisition_cost_mur)} {t('gbc.consolidation.goodwill_formula_fv', locale)} {fmt(form.fair_value_net_assets_acquisition_mur)} × {form.pct_detention}%)</div>
                </div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={addRelationship} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? t('gbc.common.saving', locale) : t('gbc.consolidation.add_subsidiary_btn', locale)}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !open && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.consolidation.kpi_consolidated', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.consolidation_scope?.full || 0}</div><div className="text-xs text-slate-500">{t('gbc.consolidation.kpi_full_method', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.consolidation.kpi_total_goodwill', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(data?.total_goodwill_mur)}</div><div className="text-xs text-slate-500">{t('gbc.consolidation.kpi_goodwill_unit', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.consolidation.kpi_eliminations', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.eliminations?.length || 0}</div><div className="text-xs text-slate-500">{t('gbc.consolidation.kpi_eliminations_sub', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.consolidation.kpi_nci', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt((data?.nci || []).reduce((s: number, n: any) => s + Number(n.nci_share_mur || 0), 0))}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.consolidation.scope_title', locale)}</CardTitle></CardHeader>
        <CardContent>
          {(data?.relationships?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('gbc.consolidation.no_subsidiary', locale)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('gbc.consolidation.col_subsidiary', locale)}</th><th className="py-2 px-2">{t('gbc.consolidation.col_type', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.consolidation.col_pct', locale)}</th><th className="py-2 px-2">{t('gbc.consolidation.col_method', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.consolidation.col_cost', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.consolidation.col_goodwill', locale)}</th></tr></thead>
              <tbody>
                {data.relationships.map((r: any) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{r.child?.nom || '—'}</td>
                    <td className="py-2 px-2 text-xs">{r.relationship_type}</td>
                    <td className="py-2 px-2 text-right">{Number(r.pct_detention).toFixed(2)}%</td>
                    <td className="py-2 px-2 text-xs">{r.consolidation_method}</td>
                    <td className="py-2 px-2 text-right">{fmt(r.acquisition_cost_mur)}</td>
                    <td className="py-2 px-2 text-right">{fmt(r.goodwill_mur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
