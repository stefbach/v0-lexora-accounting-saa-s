"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Globe } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

export default function GbcPillarTwoPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/pillar-two?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6 text-indigo-600" /> BEPS Pillar Two GloBE</h1>
          <p className="text-sm text-slate-500">OECD Pillar Two — taxe minimale 15% pour MNE &gt; €750M</p>
        </div>
        <div className="flex gap-2"><input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" /><Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button></div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

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
            <div className="text-sm text-slate-500 p-4 text-center">Aucune juridiction renseignée pour cet exercice.</div>
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
