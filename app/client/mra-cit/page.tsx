"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Briefcase, Download, Check, Send } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

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

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="h-6 w-6 text-emerald-700" /> CIT — Corporate Income Tax Return</h1>
          <p className="text-sm text-slate-500">Income Tax Act 1995 — déclaration annuelle 6 mois après clôture exercice</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          {cit && <Badge className={STATUS_COLOR[cit.statut || 'draft']}>{cit.statut || 'draft'}</Badge>}
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Ajustements fiscaux</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['ajustements_non_deductibles_mur', 'Non déductibles'],
            ['donations_excess_mur', 'Dons (excess)'],
            ['entertainment_excess_mur', 'Entertainment (excess)'],
            ['depreciation_book_mur', 'Amort. comptables'],
            ['capital_allowance_mur', 'Capital allowance (déduction)'],
            ['ftc_applied_mur', 'Foreign Tax Credit'],
            ['tds_credit_mur', 'TDS subi en amont'],
            ['aps_credit_mur', 'APS credit'],
          ] as Array<[keyof typeof adj, string]>).map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-slate-600">{label} (MUR)</label>
              <input type="number" value={adj[k]} onChange={e => setAdj(a => ({ ...a, [k]: Number(e.target.value) || 0 }))} className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={computeAuto} className="bg-emerald-600 hover:bg-emerald-700 text-white">Calculer IS depuis P&L</Button>
        {cit?.statut === 'draft' && <Button onClick={() => doAction('submit_review')} variant="outline">Soumettre pour révision</Button>}
        {cit?.statut === 'review' && <Button onClick={() => doAction('approve')} variant="outline" className="text-emerald-700"><Check className="h-4 w-4 mr-2" />Approuver</Button>}
        {cit?.statut === 'approved' && <Button onClick={() => doAction('submit_mra')} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Send className="h-4 w-4 mr-2" />Soumettre MRA</Button>}
        {cit && <Button onClick={exportXml} variant="outline"><Download className="h-4 w-4 mr-2" />XML MRA</Button>}
      </div>

      {cit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Résultat du calcul</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr><td className="py-2">Chiffre d'affaires</td><td className="py-2 text-right">{fmt(cit.chiffre_affaires_mur)} MUR</td></tr>
                <tr><td className="py-2">Charges exploitation</td><td className="py-2 text-right">({fmt(cit.charges_exploitation_mur)}) MUR</td></tr>
                <tr><td className="py-2 font-medium">Résultat exploitation</td><td className="py-2 text-right font-medium">{fmt(cit.resultat_exploitation_mur)} MUR</td></tr>
                <tr><td className="py-2">Résultat financier</td><td className="py-2 text-right">{fmt(cit.resultat_financier_mur)} MUR</td></tr>
                <tr><td className="py-2 font-bold">Profit avant impôt</td><td className="py-2 text-right font-bold">{fmt(cit.profit_avant_impot_mur)} MUR</td></tr>
                <tr><td className="py-2">+ Non déductibles</td><td className="py-2 text-right">{fmt(cit.ajustements_non_deductibles_mur)} MUR</td></tr>
                <tr><td className="py-2">+ Amort. book</td><td className="py-2 text-right">{fmt(cit.depreciation_book_mur)} MUR</td></tr>
                <tr><td className="py-2">− Capital allowance</td><td className="py-2 text-right">({fmt(cit.capital_allowance_mur)}) MUR</td></tr>
                <tr><td className="py-2 font-bold">Profit imposable</td><td className="py-2 text-right font-bold text-indigo-700">{fmt(cit.profit_imposable_mur)} MUR</td></tr>
                <tr><td className="py-2">IS brut ({cit.taux_is_pct}%)</td><td className="py-2 text-right">{fmt(cit.impot_brut_mur)} MUR</td></tr>
                <tr><td className="py-2">− FTC + TDS + APS</td><td className="py-2 text-right">({fmt(Number(cit.ftc_applied_mur) + Number(cit.tds_credit_mur) + Number(cit.aps_credit_mur))}) MUR</td></tr>
                <tr className="bg-emerald-50"><td className="py-2 font-bold">IS net à payer</td><td className="py-2 text-right font-bold text-emerald-800 text-lg">{fmt(cit.impot_net_mur)} MUR</td></tr>
                <tr><td className="py-2 text-xs text-slate-500">Échéance MRA</td><td className="py-2 text-right text-xs">{cit.date_limite}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
