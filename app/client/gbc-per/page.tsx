"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCw, AlertCircle, Banknote, Info, Plus, FileDown } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))
}

const EMPTY_FTC = {
  source_country: '', income_type: 'dividends', foreign_income_mur: 0, foreign_tax_paid_mur: 0,
  treaty_rate_pct: 0, notes: '',
}

export default function GbcPerPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FTC)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportPDF = async () => {
    if (!societeId || !exercice) return
    setExporting(true)
    try {
      const res = await fetch(`/api/comptable/gbc/per-computation/export-pdf?societe_id=${societeId}&exercice=${exercice}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gbc-per-${exercice}-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message || 'Erreur export PDF')
    } finally {
      setExporting(false)
    }
  }

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/per-computation?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const declareFtc = async () => {
    if (!societeId || !form.source_country) { setError(t('gbc.per.required_source', locale)); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/per-computation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId, exercice,
          source_country: form.source_country.toUpperCase(),
          income_type: form.income_type,
          foreign_income_mur: Number(form.foreign_income_mur) || 0,
          foreign_tax_paid_mur: Number(form.foreign_tax_paid_mur) || 0,
          treaty_rate_pct: Number(form.treaty_rate_pct) || null,
          notes: form.notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); setForm(EMPTY_FTC); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('gbc.common.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin h-5 w-5" /> {t('gbc.per.loading', locale)}</div>

  const tax = data?.tax_breakdown || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-indigo-600" /> {t('gbc.per.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('gbc.per.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" placeholder="2025-2026" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('gbc.common.refresh', locale)}</Button>
          <Button onClick={exportPDF} variant="outline" disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Exporter PDF
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />{t('gbc.per.ftc_btn', locale)}</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t('gbc.per.ftc_dialog', locale)}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('gbc.per.source_country', locale)}</Label><Input value={form.source_country} onChange={e => setForm({ ...form, source_country: e.target.value })} placeholder="ZA, IN, FR..." /></div>
                  <div><Label>{t('gbc.per.income_type', locale)}</Label>
                    <Select value={form.income_type} onValueChange={v => setForm({ ...form, income_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dividends">{t('gbc.per.income_dividends', locale)}</SelectItem>
                        <SelectItem value="interest">{t('gbc.per.income_interest', locale)}</SelectItem>
                        <SelectItem value="royalties">{t('gbc.per.income_royalties', locale)}</SelectItem>
                        <SelectItem value="business_profits">{t('gbc.per.income_business', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.per.foreign_income', locale)}</Label><Input type="number" value={form.foreign_income_mur} onChange={e => setForm({ ...form, foreign_income_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.per.foreign_tax_paid', locale)}</Label><Input type="number" value={form.foreign_tax_paid_mur} onChange={e => setForm({ ...form, foreign_tax_paid_mur: Number(e.target.value) || 0 })} /></div>
                  <div className="col-span-2"><Label>{t('gbc.per.treaty_rate', locale)}</Label><Input type="number" value={form.treaty_rate_pct} onChange={e => setForm({ ...form, treaty_rate_pct: Number(e.target.value) || 0 })} /></div>
                </div>
                <div><Label>{t('gbc.per.notes', locale)}</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={t('gbc.per.notes_placeholder', locale)} /></div>
                <div className="rounded bg-indigo-50 border border-indigo-200 p-3 text-xs">
                  <strong>{t('gbc.per.ftc_applied', locale)}</strong> {t('gbc.per.ftc_min_foreign', locale)} {fmt(form.foreign_tax_paid_mur)}, {t('gbc.per.ftc_min_mu', locale)} {fmt(Number(form.foreign_income_mur) * 0.15)})
                </div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={declareFtc} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? t('gbc.common.saving', locale) : t('gbc.per.declare_ftc', locale)}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !open && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">{t('gbc.per.kpi_total_revenue', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(tax.total_revenue_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">{t('gbc.per.kpi_per_eligible', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-700">{fmt(tax.per_eligible_revenue_mur)}</div><div className="text-xs text-slate-500">{t('gbc.per.kpi_per_eligible_sub', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">{t('gbc.per.kpi_non_eligible', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(tax.non_eligible_revenue_mur)}</div><div className="text-xs text-slate-500">{t('gbc.per.kpi_non_eligible_sub', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">{t('gbc.per.kpi_net_tax', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(tax.net_tax_liability_mur)}</div><div className="text-xs text-slate-500">{t('gbc.per.kpi_net_tax_sub', locale)} {fmt(tax.ftc_applied)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.per.categories_title', locale)}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('gbc.per.col_code', locale)}</th><th className="py-2 px-2">{t('gbc.per.col_label', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.per.col_exemption', locale)}</th><th className="py-2 px-2">{t('gbc.per.col_substance', locale)}</th><th className="py-2 px-2">{t('gbc.per.col_reference', locale)}</th></tr></thead>
            <tbody>
              {(data?.per_categories || []).map((c: any) => (
                <tr key={c.code} className="border-b">
                  <td className="py-2 px-2 font-mono text-xs">{c.code}</td>
                  <td className="py-2 px-2">{c.libelle}</td>
                  <td className="py-2 px-2 text-right">{c.exemption_pct}%</td>
                  <td className="py-2 px-2">{c.substance_required ? <Badge variant="outline">{t('gbc.per.required_label', locale)}</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="py-2 px-2 text-xs text-slate-500">{c.legal_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.per.ftc_declared_title', locale)} ({data?.ftc_records?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {(data?.ftc_records?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('gbc.per.ftc_none', locale)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('gbc.per.col_country', locale)}</th><th className="py-2 px-2">{t('gbc.per.col_type', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.per.col_income', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.per.col_foreign_tax', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.per.col_ftc_applied', locale)}</th></tr></thead>
              <tbody>
                {data.ftc_records.map((r: any) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 px-2">{r.source_country}</td>
                    <td className="py-2 px-2 text-xs">{r.income_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(r.foreign_income_mur)}</td>
                    <td className="py-2 px-2 text-right">{fmt(r.foreign_tax_paid_mur)}</td>
                    <td className="py-2 px-2 text-right font-semibold text-emerald-700">{fmt(r.ftc_applied_mur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Info className="h-4 w-4 mt-0.5" />
        <div>{t('gbc.per.footer_info', locale)}</div>
      </div>
    </div>
  )
}
