"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, AlertTriangle, Download } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

export default function MraSftPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [threshold, setThreshold] = useState(50000)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const r = await fetch(`/api/comptable/mra/sft?societe_id=${societeId}&year=${year}&threshold=${threshold}`).then(r => r.json())
      setData(r)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, year, threshold])

  const exportXml = () => { if (societeId) window.location.href = `/api/comptable/mra/sft?societe_id=${societeId}&year=${year}&action=export_xml` }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-rose-600" /> SFT — Statement of Financial Transactions</h1>
          <p className="text-sm text-slate-500">Obligation AML/CFT — transactions ≥ seuil à déclarer à la MRA</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
          <input type="number" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="border rounded px-2 py-1 text-sm w-32" placeholder="Seuil MUR" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
          <Button onClick={exportXml} variant="outline"><Download className="h-4 w-4 mr-2" />XML MRA</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Détectées (auto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-700">{s.nb_detected || 0}</div><div className="text-xs text-slate-500">≥ {fmt(threshold)} MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Déclarées</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-700">{s.nb_declared || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Total détecté</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_amount_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions détectées — {year}</CardTitle></CardHeader>
        <CardContent>
          {(data?.detected?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune transaction au-dessus du seuil.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Date</th><th className="py-2 px-2">Source</th><th className="py-2 px-2">Contrepartie</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">Montant MUR</th></tr></thead>
              <tbody>
                {data.detected.map((t: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-2 text-xs">{t.date_trans}</td>
                    <td className="py-2 px-2 text-xs"><Badge variant="outline">{t.source}</Badge></td>
                    <td className="py-2 px-2 font-medium">{t.counterparty}</td>
                    <td className="py-2 px-2 text-xs">{t.transaction_type}</td>
                    <td className="py-2 px-2 text-right font-semibold">{fmt(t.amount_mur)}</td>
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
