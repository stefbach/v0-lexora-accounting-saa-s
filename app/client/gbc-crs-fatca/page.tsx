"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCw, AlertCircle, Download, FileText, Plus } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(n))

const EMPTY_H = {
  holder_type: 'individual', holder_name: '', holder_dob: '', holder_address: '',
  country_of_residence: '', tin: '', tin_issuing_country: '',
  account_number: '', account_balance_eoy_usd: 0, account_currency: 'USD',
  interest_paid_usd: 0, dividends_paid_usd: 0, gross_proceeds_usd: 0, other_income_usd: 0,
  is_fatca_reportable: false, is_crs_reportable: true,
  document_status: 'pending', notes: '',
}

export default function GbcCrsFatcaPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_H)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/crs-fatca?societe_id=${societeId}&year=${year}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, year])

  const declareHolder = async () => {
    if (!societeId || !form.holder_name || !form.country_of_residence || !form.account_number) {
      setError(t('gbc.crs.required_fields', locale)); return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/crs-fatca', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'declare_holder',
          payload: { ...form, societe_id: societeId, reporting_year: year,
            country_of_residence: form.country_of_residence.toUpperCase(),
            account_balance_eoy_usd: Number(form.account_balance_eoy_usd) || 0,
            interest_paid_usd: Number(form.interest_paid_usd) || 0,
            dividends_paid_usd: Number(form.dividends_paid_usd) || 0,
            gross_proceeds_usd: Number(form.gross_proceeds_usd) || 0,
            other_income_usd: Number(form.other_income_usd) || 0,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); setForm(EMPTY_H); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const generateXml = async () => {
    const res = await fetch('/api/comptable/gbc/crs-fatca', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_xml', societe_id: societeId, year }) })
    if (res.ok) {
      const blob = await res.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `crs_${societeId}_${year}.xml`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('gbc.common.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('gbc.common.loading', locale)}</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-indigo-600" /> {t('gbc.crs.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('gbc.crs.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('gbc.common.refresh', locale)}</Button>
          <Button onClick={generateXml} variant="outline" className="border-indigo-300 text-indigo-700"><Download className="h-4 w-4 mr-2" />{t('gbc.crs.xml_btn', locale)}</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />{t('gbc.crs.declare_holder_btn', locale)}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t('gbc.crs.dialog_title', locale)}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('gbc.crs.holder_type', locale)}</Label>
                    <Select value={form.holder_type} onValueChange={v => setForm({ ...form, holder_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">{t('gbc.crs.holder_individual', locale)}</SelectItem>
                        <SelectItem value="entity">{t('gbc.crs.holder_entity', locale)}</SelectItem>
                        <SelectItem value="controlling_person">{t('gbc.crs.holder_controlling', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.crs.holder_name', locale)}</Label><Input value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} /></div>
                  <div><Label>{t('gbc.crs.dob', locale)}</Label><Input type="date" value={form.holder_dob} onChange={e => setForm({ ...form, holder_dob: e.target.value })} /></div>
                  <div><Label>{t('gbc.crs.country_residence', locale)}</Label><Input value={form.country_of_residence} onChange={e => setForm({ ...form, country_of_residence: e.target.value })} placeholder="FR, GB, ZA..." /></div>
                  <div><Label>{t('gbc.crs.tin', locale)}</Label><Input value={form.tin} onChange={e => setForm({ ...form, tin: e.target.value })} /></div>
                  <div><Label>{t('gbc.crs.tin_country', locale)}</Label><Input value={form.tin_issuing_country} onChange={e => setForm({ ...form, tin_issuing_country: e.target.value })} /></div>
                  <div className="col-span-2"><Label>{t('gbc.crs.account_number', locale)}</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
                  <div><Label>{t('gbc.crs.balance_eoy', locale)}</Label><Input type="number" value={form.account_balance_eoy_usd} onChange={e => setForm({ ...form, account_balance_eoy_usd: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.crs.currency', locale)}</Label><Input value={form.account_currency} onChange={e => setForm({ ...form, account_currency: e.target.value })} /></div>
                  <div><Label>{t('gbc.crs.interest_paid', locale)}</Label><Input type="number" value={form.interest_paid_usd} onChange={e => setForm({ ...form, interest_paid_usd: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.crs.dividends_paid', locale)}</Label><Input type="number" value={form.dividends_paid_usd} onChange={e => setForm({ ...form, dividends_paid_usd: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.crs.gross_proceeds', locale)}</Label><Input type="number" value={form.gross_proceeds_usd} onChange={e => setForm({ ...form, gross_proceeds_usd: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.crs.other_income', locale)}</Label><Input type="number" value={form.other_income_usd} onChange={e => setForm({ ...form, other_income_usd: Number(e.target.value) || 0 })} /></div>
                  <div><Label>{t('gbc.crs.fatca_reportable', locale)}</Label>
                    <Select value={form.is_fatca_reportable ? 'oui' : 'non'} onValueChange={v => setForm({ ...form, is_fatca_reportable: v === 'oui' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="non">{t('gbc.common.no', locale)}</SelectItem><SelectItem value="oui">{t('gbc.common.yes', locale)}</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t('gbc.crs.crs_reportable', locale)}</Label>
                    <Select value={form.is_crs_reportable ? 'oui' : 'non'} onValueChange={v => setForm({ ...form, is_crs_reportable: v === 'oui' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="oui">{t('gbc.common.yes', locale)}</SelectItem><SelectItem value="non">{t('gbc.common.no', locale)}</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>{t('gbc.crs.address', locale)}</Label><Input value={form.holder_address} onChange={e => setForm({ ...form, holder_address: e.target.value })} /></div>
                <div><Label>{t('gbc.crs.notes', locale)}</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={declareHolder} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? t('gbc.common.saving', locale) : t('gbc.crs.declare_holder', locale)}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !open && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.crs.kpi_holders', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_holders || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.crs.kpi_crs', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_crs_reportable || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.crs.kpi_fatca', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_fatca_reportable || 0}</div><div className="text-xs text-slate-500">{t('gbc.crs.kpi_us_persons', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.crs.kpi_balance', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_balance_usd)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('gbc.crs.holders_title', locale)}</CardTitle></CardHeader>
        <CardContent>
          {(data?.holders?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('gbc.crs.no_holder_prefix', locale)} {year}. {t('gbc.crs.no_holder_suffix', locale)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('gbc.crs.col_holder', locale)}</th><th className="py-2 px-2">{t('gbc.crs.col_country', locale)}</th><th className="py-2 px-2">{t('gbc.crs.col_type', locale)}</th><th className="py-2 px-2 text-right">{t('gbc.crs.col_balance', locale)}</th><th className="py-2 px-2">{t('gbc.crs.col_crs', locale)}</th><th className="py-2 px-2">{t('gbc.crs.col_fatca', locale)}</th><th className="py-2 px-2">{t('gbc.crs.col_status', locale)}</th></tr></thead>
              <tbody>
                {data.holders.map((h: any) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{h.holder_name}</td>
                    <td className="py-2 px-2 text-xs">{h.country_of_residence}</td>
                    <td className="py-2 px-2 text-xs">{h.holder_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(h.account_balance_eoy_usd)}</td>
                    <td className="py-2 px-2 text-xs">{h.is_crs_reportable ? <Badge variant="outline">CRS</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{h.is_fatca_reportable ? <Badge className="bg-blue-100 text-blue-800">FATCA</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{h.document_status}</td>
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
