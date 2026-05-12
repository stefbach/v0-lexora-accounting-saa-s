"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, AlertCircle, Layers } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

export default function GbcConsolidationPage() {
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
      const res = await fetch(`/api/comptable/gbc/consolidate?parent_societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="h-6 w-6 text-indigo-600" /> Consolidation IFRS 10</h1>
          <p className="text-sm text-slate-500">États consolidés du groupe — Goodwill IFRS 3 + NCI + éliminations</p>
        </div>
        <div className="flex gap-2"><input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" /><Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button></div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Filiales consolidées</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.consolidation_scope?.full || 0}</div><div className="text-xs text-slate-500">méthode intégrale</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Goodwill total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(data?.total_goodwill_mur)}</div><div className="text-xs text-slate-500">MUR (IFRS 3)</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Éliminations</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.eliminations?.length || 0}</div><div className="text-xs text-slate-500">retraitements</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">NCI</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt((data?.nci || []).reduce((s: number, n: any) => s + Number(n.nci_share_mur || 0), 0))}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Périmètre de consolidation</CardTitle></CardHeader>
        <CardContent>
          {(data?.relationships?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune filiale rattachée à cette holding.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Filiale</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">% Détention</th><th className="py-2 px-2">Méthode</th><th className="py-2 px-2 text-right">Coût acquisition</th><th className="py-2 px-2 text-right">Goodwill</th></tr></thead>
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
