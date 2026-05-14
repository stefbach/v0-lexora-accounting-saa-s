"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RefreshCw, AlertCircle, GitBranch, Plus, FileText } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const TIER_COLOR: Record<string, string> = {
  documentation_required: 'bg-red-100 text-red-800 border-red-200',
  recommended: 'bg-amber-100 text-amber-800 border-amber-200',
  optional: 'bg-slate-100 text-slate-700 border-slate-200',
}

const EMPTY_TX = {
  related_party_name: '', related_party_country: '', relationship_type: 'subsidiary',
  transaction_type: 'services', amount_mur: 0, tp_method: 'TNMM',
  arm_length_range_low: 0, arm_length_range_high: 0, benchmarking_source: '',
  is_within_range: true, rationale: '',
}
const EMPTY_MF = {
  group_structure: '', business_overview: '', intangibles_description: '',
  financing_strategy: '', financial_position: '', consolidated_revenue_mur: 0,
}

export default function GbcTpPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [openTx, setOpenTx] = useState(false)
  const [openMf, setOpenMf] = useState(false)
  const [formTx, setFormTx] = useState(EMPTY_TX)
  const [formMf, setFormMf] = useState(EMPTY_MF)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/transfer-pricing?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      if (json.master_file) setFormMf(json.master_file)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const saveTx = async () => {
    if (!societeId || !formTx.related_party_name) { setError(t('gbc.tp.required_related_party', locale)); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/transfer-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'transaction', payload: { ...formTx, societe_id: societeId, exercice, amount_mur: Number(formTx.amount_mur) || 0 } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenTx(false); setFormTx(EMPTY_TX); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const saveMf = async () => {
    if (!societeId) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/transfer-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'master_file', payload: { ...formMf, societe_id: societeId, exercice, consolidated_revenue_mur: Number(formMf.consolidated_revenue_mur) || 0 } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenMf(false); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('gbc.common.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('gbc.common.loading', locale)}</div>

  const s = data?.summary || {}
  const tier = (amt: number) => amt >= 5_000_000 ? 'documentation_required' : amt >= 1_000_000 ? 'recommended' : 'optional'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="h-6 w-6 text-indigo-600" /> {t('gbc.tp.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('gbc.tp.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Dialog open={openMf} onOpenChange={setOpenMf}>
            <DialogTrigger asChild><Button variant="outline"><FileText className="h-4 w-4 mr-2" />{t('gbc.tp.master_file_btn', locale)}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t('gbc.tp.master_file_title', locale)} — {exercice}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>{t('gbc.tp.group_structure', locale)}</Label><Textarea value={formMf.group_structure || ''} onChange={e => setFormMf({ ...formMf, group_structure: e.target.value })} rows={3} placeholder={t('gbc.tp.group_structure_placeholder', locale)} /></div>
                <div><Label>{t('gbc.tp.business_overview', locale)}</Label><Textarea value={formMf.business_overview || ''} onChange={e => setFormMf({ ...formMf, business_overview: e.target.value })} rows={3} /></div>
                <div><Label>{t('gbc.tp.intangibles', locale)}</Label><Textarea value={formMf.intangibles_description || ''} onChange={e => setFormMf({ ...formMf, intangibles_description: e.target.value })} rows={2} placeholder={t('gbc.tp.intangibles_placeholder', locale)} /></div>
                <div><Label>{t('gbc.tp.financing_strategy', locale)}</Label><Textarea value={formMf.financing_strategy || ''} onChange={e => setFormMf({ ...formMf, financing_strategy: e.target.value })} rows={2} /></div>
                <div><Label>{t('gbc.tp.financial_position', locale)}</Label><Textarea value={formMf.financial_position || ''} onChange={e => setFormMf({ ...formMf, financial_position: e.target.value })} rows={2} /></div>
                <div><Label>{t('gbc.tp.consolidated_revenue', locale)}</Label><Input type="number" value={formMf.consolidated_revenue_mur || 0} onChange={e => setFormMf({ ...formMf, consolidated_revenue_mur: Number(e.target.value) || 0 })} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={saveMf} disabled={saving} className="w-full">{saving ? t('gbc.common.saving', locale) : t('gbc.tp.save_master_file', locale)}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openTx} onOpenChange={setOpenTx}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />{t('gbc.tp.tp_transaction_btn', locale)}</Button></DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t('gbc.tp.tx_dialog_title', locale)}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>{t('gbc.tp.related_party', locale)}</Label><Input value={formTx.related_party_name} onChange={e => setFormTx({ ...formTx, related_party_name: e.target.value })} /></div>
                  <div><Label>{t('gbc.tp.country', locale)}</Label><Input value={formTx.related_party_country} onChange={e => setFormTx({ ...formTx, related_party_country: e.target.value })} placeholder="ZA/IN/FR" /></div>
                  <div><Label>{t('gbc.tp.relationship_type', locale)}</Label>
                    <Select value={formTx.relationship_type} onValueChange={v => setFormTx({ ...formTx, relationship_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parent">{t('gbc.tp.rel_parent', locale)}</SelectItem>
                        <SelectItem value="subsidiary">{t('gbc.tp.rel_subsidiary', locale)}</SelectItem>
                        <SelectItem value="sister">{t('gbc.tp.rel_sister', locale)}</SelectItem>
                        <SelectItem value="common_control">{t('gbc.tp.rel_common_control', locale)}</SelectItem>
                        <SelectItem value="key_management">{t('gbc.tp.rel_key_management', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.tp.transaction_type', locale)}</Label>
                    <Select value={formTx.transaction_type} onValueChange={v => setFormTx({ ...formTx, transaction_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="goods">{t('gbc.tp.tx_goods', locale)}</SelectItem>
                        <SelectItem value="services">{t('gbc.tp.tx_services', locale)}</SelectItem>
                        <SelectItem value="royalties">{t('gbc.tp.tx_royalties', locale)}</SelectItem>
                        <SelectItem value="interest">{t('gbc.tp.tx_interest', locale)}</SelectItem>
                        <SelectItem value="financing">{t('gbc.tp.tx_financing', locale)}</SelectItem>
                        <SelectItem value="cost_sharing">{t('gbc.tp.tx_cost_sharing', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.tp.amount', locale)}</Label><Input type="number" value={formTx.amount_mur} onChange={e => setFormTx({ ...formTx, amount_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.tp.tp_method', locale)}</Label>
                    <Select value={formTx.tp_method} onValueChange={v => setFormTx({ ...formTx, tp_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUP">CUP (Comparable Uncontrolled Price)</SelectItem>
                        <SelectItem value="RPM">RPM (Resale Price Method)</SelectItem>
                        <SelectItem value="CPM">CPM (Cost Plus Method)</SelectItem>
                        <SelectItem value="TNMM">TNMM (Transactional Net Margin)</SelectItem>
                        <SelectItem value="PSM">PSM (Profit Split Method)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.tp.arm_length_min', locale)}</Label><Input type="number" value={formTx.arm_length_range_low} onChange={e => setFormTx({ ...formTx, arm_length_range_low: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.tp.arm_length_max', locale)}</Label><Input type="number" value={formTx.arm_length_range_high} onChange={e => setFormTx({ ...formTx, arm_length_range_high: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.tp.within_range', locale)}</Label>
                    <Select value={formTx.is_within_range ? 'oui' : 'non'} onValueChange={v => setFormTx({ ...formTx, is_within_range: v === 'oui' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="oui">{t('gbc.tp.within_range_yes', locale)}</SelectItem><SelectItem value="non">{t('gbc.tp.within_range_no', locale)}</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.tp.benchmarking_source', locale)}</Label><Input value={formTx.benchmarking_source} onChange={e => setFormTx({ ...formTx, benchmarking_source: e.target.value })} placeholder={t('gbc.tp.benchmarking_placeholder', locale)} /></div>
                </div>
                <div><Label>{t('gbc.tp.rationale', locale)}</Label><Textarea value={formTx.rationale} onChange={e => setFormTx({ ...formTx, rationale: e.target.value })} rows={3} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={saveTx} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? t('gbc.common.saving', locale) : t('gbc.tp.save_tx', locale)}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !openTx && !openMf && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.tp.kpi_transactions', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.count || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.tp.kpi_total_intra', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_amount_mur)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.tp.kpi_doc_required', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-700">{s.by_tier?.documentation_required || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.tp.kpi_not_arms_length', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700">{s.flagged_not_arms_length || 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.tp.master_file_title', locale)} {data?.master_file ? t('gbc.tp.mf_filled', locale) : t('gbc.tp.mf_missing', locale)}</CardTitle></CardHeader>
        <CardContent>
          {data?.master_file ? (
            <div className="text-sm space-y-1">
              <div><strong>{t('gbc.tp.mf_consolidated_revenue', locale)}</strong> {fmt(data.master_file.consolidated_revenue_mur)} MUR</div>
              {data.master_file.business_overview && <div className="text-xs text-slate-600">{data.master_file.business_overview.slice(0, 300)}…</div>}
            </div>
          ) : <div className="text-sm text-slate-500">{t('gbc.tp.mf_click_hint', locale)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.tp.tx_section_title', locale)}</CardTitle></CardHeader>
        <CardContent>
          {(data?.transactions?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('gbc.tp.tx_none', locale)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('gbc.tp.col_related_party', locale)}</th><th className="py-2 px-2">{t('gbc.tp.col_type', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.tp.col_amount', locale)}</th><th className="py-2 px-2">{t('gbc.tp.col_method', locale)}</th><th className="py-2 px-2">{t('gbc.tp.col_tier', locale)}</th><th className="py-2 px-2">{t('gbc.tp.col_arms_length', locale)}</th></tr></thead>
              <tbody>
                {data.transactions.map((tx: any) => (
                  <tr key={tx.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{tx.related_party_name}</td>
                    <td className="py-2 px-2 text-xs">{tx.transaction_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(tx.amount_mur)}</td>
                    <td className="py-2 px-2 text-xs">{tx.tp_method || '—'}</td>
                    <td className="py-2 px-2"><Badge className={TIER_COLOR[tier(Number(tx.amount_mur))]}>{tier(Number(tx.amount_mur))}</Badge></td>
                    <td className="py-2 px-2 text-xs">{tx.is_within_range == null ? '—' : tx.is_within_range ? '✓' : '✗'}</td>
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
