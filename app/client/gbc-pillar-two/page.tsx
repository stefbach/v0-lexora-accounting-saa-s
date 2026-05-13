"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw, AlertCircle, Globe, Plus } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

const EMPTY_J = {
  jurisdiction: '', globe_income_mur: 0, covered_taxes_mur: 0,
  payroll_mur: 0, tangible_assets_mur: 0,
}
const EMPTY_GIR = { consolidated_revenue_eur: 0, total_top_up_mur: 0, total_dmtt_mur: 0 }

export default function GbcPillarTwoPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [open, setOpen] = useState(false)
  const [openGir, setOpenGir] = useState(false)
  const [form, setForm] = useState(EMPTY_J)
  const [formGir, setFormGir] = useState(EMPTY_GIR)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/pillar-two?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      if (json.gir) setFormGir({
        consolidated_revenue_eur: json.gir.consolidated_revenue_eur || 0,
        total_top_up_mur: json.gir.total_top_up_mur || 0,
        total_dmtt_mur: json.gir.total_dmtt_mur || 0,
      })
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const addJurisdiction = async () => {
    if (!societeId || !form.jurisdiction) { setError('Juridiction requise'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/pillar-two', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'declare_jurisdiction',
          payload: {
            societe_id: societeId, exercice,
            jurisdiction: form.jurisdiction.toUpperCase(),
            globe_income_mur: Number(form.globe_income_mur) || 0,
            covered_taxes_mur: Number(form.covered_taxes_mur) || 0,
            payroll_mur: Number(form.payroll_mur) || 0,
            tangible_assets_mur: Number(form.tangible_assets_mur) || 0,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); setForm(EMPTY_J); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const submitGir = async () => {
    if (!societeId) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/pillar-two', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_gir', societe_id: societeId, exercice, ...formGir }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenGir(false); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  // Preview calc
  const etr = form.globe_income_mur > 0 ? (form.covered_taxes_mur / form.globe_income_mur) * 100 : 0
  const sbie = (form.payroll_mur * 0.05) + (form.tangible_assets_mur * 0.05)
  const excess = Math.max(0, form.globe_income_mur - sbie)
  const topUp = etr < 15 ? excess * (15 - etr) / 100 : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6 text-indigo-600" /> BEPS Pillar Two GloBE</h1>
          <p className="text-sm text-slate-500">OECD Pillar Two — taxe minimale 15% pour MNE &gt; €750M</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Dialog open={openGir} onOpenChange={setOpenGir}>
            <DialogTrigger asChild><Button variant="outline">GIR Submission</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>GloBE Information Return — {exercice}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>CA consolidé groupe (EUR) *</Label><Input type="number" value={formGir.consolidated_revenue_eur} onChange={e => setFormGir({ ...formGir, consolidated_revenue_eur: Number(e.target.value) || 0 })} /></div>
                <div><Label>Total Top-up Tax (MUR)</Label><Input type="number" value={formGir.total_top_up_mur} onChange={e => setFormGir({ ...formGir, total_top_up_mur: Number(e.target.value) || 0 })} /></div>
                <div><Label>DMTT Maurice (MUR)</Label><Input type="number" value={formGir.total_dmtt_mur} onChange={e => setFormGir({ ...formGir, total_dmtt_mur: Number(e.target.value) || 0 })} /></div>
                <div className="text-xs text-slate-500">Threshold Pillar Two : €750M. Si CA consolidé &lt; threshold, le GIR n'est pas requis.</div>
                <Button onClick={submitGir} disabled={saving} className="w-full">{saving ? 'Soumission…' : 'Soumettre GIR'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />Juridiction GloBE</Button></DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Ajouter une juridiction GloBE</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Juridiction (ISO) *</Label><Input value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })} placeholder="MU, IE, NL..." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>GloBE Income (MUR)</Label><Input type="number" value={form.globe_income_mur} onChange={e => setForm({ ...form, globe_income_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Covered Taxes (MUR)</Label><Input type="number" value={form.covered_taxes_mur} onChange={e => setForm({ ...form, covered_taxes_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Payroll (MUR)</Label><Input type="number" value={form.payroll_mur} onChange={e => setForm({ ...form, payroll_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Tangible Assets (MUR)</Label><Input type="number" value={form.tangible_assets_mur} onChange={e => setForm({ ...form, tangible_assets_mur: Number(e.target.value) || 0 })} /></div>
                </div>
                <div className="rounded bg-indigo-50 border border-indigo-200 p-3 text-xs space-y-1">
                  <div><strong>ETR :</strong> {etr.toFixed(2)}%</div>
                  <div><strong>SBIE (5%/5%) :</strong> {fmt(sbie)} MUR</div>
                  <div><strong>Excess Profit :</strong> {fmt(excess)} MUR</div>
                  <div className={`font-bold ${etr < 15 ? 'text-red-700' : 'text-emerald-700'}`}>
                    Top-up Tax : {fmt(topUp)} MUR {etr < 15 ? '⚠ Low-taxed' : '✓ OK'}
                  </div>
                </div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={addJurisdiction} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? 'Enregistrement…' : 'Ajouter juridiction'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !open && !openGir && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      {s.in_scope === false && <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex gap-2"><AlertCircle className="h-4 w-4" />Société hors scope Pillar Two (CA consolidé &lt; €750M). Aucune obligation GIR.</div>}
      {s.in_scope === true && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><AlertCircle className="h-4 w-4" />Société <strong>in scope</strong> Pillar Two. GIR à soumettre dans 18 mois après clôture.</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Juridictions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_jurisdictions || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Low-taxed (&lt; 15%)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-700">{s.nb_low_taxed || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Top-up Tax total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_top_up_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Statut GIR</CardTitle></CardHeader><CardContent><Badge>{data?.gir?.status || 'aucun'}</Badge></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ETR par juridiction</CardTitle></CardHeader>
        <CardContent>
          {(data?.jurisdictions?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune juridiction renseignée. Clique sur "Juridiction GloBE".</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Juridiction</th><th className="py-2 px-2 text-right">GloBE Income</th><th className="py-2 px-2 text-right">Covered Taxes</th><th className="py-2 px-2 text-right">ETR %</th><th className="py-2 px-2 text-right">Top-up</th></tr></thead>
              <tbody>
                {data.jurisdictions.map((j: any) => (
                  <tr key={j.id} className={`border-b ${j.is_low_taxed ? 'bg-red-50' : ''}`}>
                    <td className="py-2 px-2 font-medium">{j.jurisdiction}</td>
                    <td className="py-2 px-2 text-right">{fmt(j.globe_income_mur)}</td>
                    <td className="py-2 px-2 text-right">{fmt(j.covered_taxes_mur)}</td>
                    <td className={`py-2 px-2 text-right font-semibold ${j.is_low_taxed ? 'text-red-700' : 'text-emerald-700'}`}>{Number(j.etr_pct).toFixed(2)}%</td>
                    <td className="py-2 px-2 text-right">{fmt(j.top_up_tax_mur)}</td>
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
