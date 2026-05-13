"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, GitBranch } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const TIER_COLOR: Record<string, string> = {
  documentation_required: 'bg-red-100 text-red-800 border-red-200',
  recommended: 'bg-amber-100 text-amber-800 border-amber-200',
  optional: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function GbcTpPage() {
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
      const res = await fetch(`/api/comptable/gbc/transfer-pricing?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}
  const tier = (amt: number) => amt >= 5_000_000 ? 'documentation_required' : amt >= 1_000_000 ? 'recommended' : 'optional'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="h-6 w-6 text-indigo-600" /> Transfer Pricing</h1>
          <p className="text-sm text-slate-500">Maurice TP Act 2023 + OECD TPG — documentation intragroupe</p>
        </div>
        <div className="flex gap-2"><input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" /><Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button></div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Transactions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.count || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Total intragroupe</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_amount_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Doc obligatoire</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-700">{s.by_tier?.documentation_required || 0}</div><div className="text-xs text-slate-500">≥ MUR 5M</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Hors arm's length</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700">{s.flagged_not_arms_length || 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Master File</CardTitle></CardHeader>
        <CardContent>
          {data?.master_file ? (
            <div className="text-sm space-y-1">
              <div><strong>CA consolidé :</strong> {fmt(data.master_file.consolidated_revenue_mur)} MUR</div>
              {data.master_file.business_overview && <div><strong>Overview :</strong> {data.master_file.business_overview.slice(0, 200)}…</div>}
            </div>
          ) : <div className="text-sm text-slate-500">Master file non renseigné pour cet exercice.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions intragroupe</CardTitle></CardHeader>
        <CardContent>
          {(data?.transactions?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune transaction intragroupe.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Partie liée</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">Montant</th><th className="py-2 px-2">Méthode</th><th className="py-2 px-2">Tier</th><th className="py-2 px-2">Arm's length</th></tr></thead>
              <tbody>
                {data.transactions.map((t: any) => (
                  <tr key={t.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{t.related_party_name}</td>
                    <td className="py-2 px-2 text-xs">{t.transaction_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(t.amount_mur)}</td>
                    <td className="py-2 px-2 text-xs">{t.tp_method || '—'}</td>
                    <td className="py-2 px-2"><Badge className={TIER_COLOR[tier(Number(t.amount_mur))]}>{tier(Number(t.amount_mur))}</Badge></td>
                    <td className="py-2 px-2 text-xs">{t.is_within_range == null ? '—' : t.is_within_range ? '✓' : '✗'}</td>
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
