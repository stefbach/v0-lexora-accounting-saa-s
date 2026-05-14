"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Briefcase, Download, Check, Send } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700',
  review:    'bg-blue-100 text-blue-800',
  approved:  'bg-emerald-100 text-emerald-800',
  submitted: 'bg-indigo-100 text-indigo-800',
  accepted:  'bg-emerald-100 text-emerald-900',
  rejected:  'bg-red-100 text-red-800',
}

export default function MraCitPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [cit, setCit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [adj, setAdj] = useState({
    ajustements_non_deductibles_mur: 0, donations_excess_mur: 0,
    entertainment_excess_mur: 0, depreciation_book_mur: 0, capital_allowance_mur: 0,
    ftc_applied_mur: 0, tds_credit_mur: 0, aps_credit_mur: 0,
  })

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const r = await fetch(`/api/comptable/mra/cit?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json())
      if (r.cit) {
        setCit(r.cit)
        setAdj({
          ajustements_non_deductibles_mur: r.cit.ajustements_non_deductibles_mur || 0,
          donations_excess_mur: r.cit.donations_excess_mur || 0,
          entertainment_excess_mur: r.cit.entertainment_excess_mur || 0,
          depreciation_book_mur: r.cit.depreciation_book_mur || 0,
          capital_allowance_mur: r.cit.capital_allowance_mur || 0,
          ftc_applied_mur: r.cit.ftc_applied_mur || 0,
          tds_credit_mur: r.cit.tds_credit_mur || 0,
          aps_credit_mur: r.cit.aps_credit_mur || 0,
        })
      }
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const computeAuto = async () => {
    if (!societeId) return
    setLoading(true)
    const r = await fetch('/api/comptable/mra/cit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ societe_id: societeId, exercice, action: 'compute_auto', ajustements: adj }) }).then(r => r.json())
    if (r.cit) setCit(r.cit)
    setLoading(false)
  }
  const doAction = async (action: string) => {
    if (!societeId) return
    await fetch('/api/comptable/mra/cit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ societe_id: societeId, exercice, action }) })
    load()
  }
  const exportXml = () => { if (societeId) window.location.href = `/api/comptable/mra/cit?societe_id=${societeId}&exercice=${exercice}&action=export_xml` }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('mra.cit.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('mra.cit.loading', locale)}</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="h-6 w-6 text-emerald-700" /> {t('mra.cit.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('mra.cit.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          {cit && <Badge className={STATUS_COLOR[cit.statut || 'draft']}>{cit.statut || 'draft'}</Badge>}
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">{t('mra.cit.adjustments', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['ajustements_non_deductibles_mur', t('mra.cit.adj.non_deductible', locale)],
            ['donations_excess_mur', t('mra.cit.adj.donations', locale)],
            ['entertainment_excess_mur', t('mra.cit.adj.entertainment', locale)],
            ['depreciation_book_mur', t('mra.cit.adj.depreciation', locale)],
            ['capital_allowance_mur', t('mra.cit.adj.capital_allowance', locale)],
            ['ftc_applied_mur', t('mra.cit.adj.ftc', locale)],
            ['tds_credit_mur', t('mra.cit.adj.tds_credit', locale)],
            ['aps_credit_mur', t('mra.cit.adj.aps_credit', locale)],
          ] as Array<[keyof typeof adj, string]>).map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-slate-600">{label} (MUR)</label>
              <input type="number" value={adj[k]} onChange={e => setAdj(a => ({ ...a, [k]: Number(e.target.value) || 0 }))} className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={computeAuto} className="bg-emerald-600 hover:bg-emerald-700 text-white">{t('mra.cit.compute', locale)}</Button>
        {cit?.statut === 'draft' && <Button onClick={() => doAction('submit_review')} variant="outline">{t('mra.cit.submit_review', locale)}</Button>}
        {cit?.statut === 'review' && <Button onClick={() => doAction('approve')} variant="outline" className="text-emerald-700"><Check className="h-4 w-4 mr-2" />{t('mra.cit.approve', locale)}</Button>}
        {cit?.statut === 'approved' && <Button onClick={() => doAction('submit_mra')} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Send className="h-4 w-4 mr-2" />{t('mra.cit.submit_mra', locale)}</Button>}
        {cit && <Button onClick={exportXml} variant="outline"><Download className="h-4 w-4 mr-2" />{t('mra.cit.xml', locale)}</Button>}
      </div>

      {cit && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('mra.cit.result', locale)}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr><td className="py-2">{t('mra.cit.row.revenue', locale)}</td><td className="py-2 text-right">{fmt(cit.chiffre_affaires_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.operating_expenses', locale)}</td><td className="py-2 text-right">({fmt(cit.charges_exploitation_mur)}) MUR</td></tr>
                <tr><td className="py-2 font-medium">{t('mra.cit.row.operating_result', locale)}</td><td className="py-2 text-right font-medium">{fmt(cit.resultat_exploitation_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.financial_result', locale)}</td><td className="py-2 text-right">{fmt(cit.resultat_financier_mur)} MUR</td></tr>
                <tr><td className="py-2 font-bold">{t('mra.cit.row.profit_before_tax', locale)}</td><td className="py-2 text-right font-bold">{fmt(cit.profit_avant_impot_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.add_non_deductible', locale)}</td><td className="py-2 text-right">{fmt(cit.ajustements_non_deductibles_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.add_book_depr', locale)}</td><td className="py-2 text-right">{fmt(cit.depreciation_book_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.minus_capital_allowance', locale)}</td><td className="py-2 text-right">({fmt(cit.capital_allowance_mur)}) MUR</td></tr>
                <tr><td className="py-2 font-bold">{t('mra.cit.row.taxable_profit', locale)}</td><td className="py-2 text-right font-bold text-indigo-700">{fmt(cit.profit_imposable_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.gross_tax_prefix', locale)}{cit.taux_is_pct}{t('mra.cit.row.gross_tax_suffix', locale)}</td><td className="py-2 text-right">{fmt(cit.impot_brut_mur)} MUR</td></tr>
                <tr><td className="py-2">{t('mra.cit.row.minus_credits', locale)}</td><td className="py-2 text-right">({fmt(Number(cit.ftc_applied_mur) + Number(cit.tds_credit_mur) + Number(cit.aps_credit_mur))}) MUR</td></tr>
                <tr className="bg-emerald-50"><td className="py-2 font-bold">{t('mra.cit.row.net_tax_due', locale)}</td><td className="py-2 text-right font-bold text-emerald-800 text-lg">{fmt(cit.impot_net_mur)} MUR</td></tr>
                <tr><td className="py-2 text-xs text-slate-500">{t('mra.cit.row.mra_deadline', locale)}</td><td className="py-2 text-right text-xs">{cit.date_limite}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
