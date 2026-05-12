"use client"
/**
 * /client/gbc-per — Phase B : PER 80% + Foreign Tax Credit
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Banknote, Info } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))
}

export default function GbcPerPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [error, setError] = useState<string | null>(null)

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

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin h-5 w-5" /> Chargement PER…</div>

  const tax = data?.tax_breakdown || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-indigo-600" /> PER 80% + Foreign Tax Credit</h1>
          <p className="text-sm text-slate-500">Income Tax Act 1995 §50C + §77 — GBC partial exemption regime</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" placeholder="2025-2026" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">Revenu total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(tax.total_revenue_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">PER-éligible</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-700">{fmt(tax.per_eligible_revenue_mur)}</div><div className="text-xs text-slate-500">imposable à 3%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">Non éligible</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(tax.non_eligible_revenue_mur)}</div><div className="text-xs text-slate-500">imposable à 15%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">IS net</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(tax.net_tax_liability_mur)}</div><div className="text-xs text-slate-500">après FTC : {fmt(tax.ftc_applied)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Catégories PER (ITA §50C)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Code</th><th className="py-2 px-2">Libellé</th><th className="py-2 px-2 text-right">Exemption %</th><th className="py-2 px-2">Substance</th><th className="py-2 px-2">Référence</th></tr></thead>
            <tbody>
              {(data?.per_categories || []).map((c: any) => (
                <tr key={c.code} className="border-b">
                  <td className="py-2 px-2 font-mono text-xs">{c.code}</td>
                  <td className="py-2 px-2">{c.libelle}</td>
                  <td className="py-2 px-2 text-right">{c.exemption_pct}%</td>
                  <td className="py-2 px-2">{c.substance_required ? <Badge variant="outline">Requise</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="py-2 px-2 text-xs text-slate-500">{c.legal_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Foreign Tax Credits déclarés ({data?.ftc_records?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {(data?.ftc_records?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun FTC pour cet exercice.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Pays</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">Revenu</th><th className="py-2 px-2 text-right">Impôt étranger</th><th className="py-2 px-2 text-right">FTC appliqué</th></tr></thead>
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
        <div>PER 80% : revenu éligible imposé à 15% × 20% = <strong>3%</strong>. Substance ITA §73A obligatoire. FTC limité au min(impôt étranger payé, impôt Maurice sur le revenu).</div>
      </div>
    </div>
  )
}
