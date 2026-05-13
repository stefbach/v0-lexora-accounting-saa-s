"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, UserCheck } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : Number(n).toFixed(2)

export default function GbcUboPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/beneficial-owners?societe_id=${societeId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const attest = async (uboId: string) => {
    await fetch('/api/comptable/gbc/beneficial-owners', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'attest', ubo_id: uboId, societe_id: societeId }) })
    load()
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="h-6 w-6 text-indigo-600" /> Beneficial Owners (UBO)</h1>
          <p className="text-sm text-slate-500">FSC AML Act + FATF — registre UBO ≥ 10%</p>
        </div>
        <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
      {s.compliance_warning && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><AlertCircle className="h-4 w-4" />{s.compliance_warning}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">UBO actifs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_active}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">% Détention déclarée</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_pct_declared)}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Audit trail</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.history?.length || 0}</div><div className="text-xs text-slate-500">événements</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">UBO actifs</CardTitle></CardHeader>
        <CardContent>
          {(data?.ubos?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun UBO déclaré.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Nom</th><th className="py-2 px-2">Nationalité</th><th className="py-2 px-2 text-right">% Détention</th><th className="py-2 px-2">Contrôle</th><th className="py-2 px-2">PEP</th><th className="py-2 px-2">Sanctions</th><th className="py-2 px-2">Actions</th></tr></thead>
              <tbody>
                {data.ubos.map((u: any) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{u.prenom} {u.nom}</td>
                    <td className="py-2 px-2 text-xs">{u.nationalite}</td>
                    <td className="py-2 px-2 text-right">{Number(u.pct_detention).toFixed(2)}%</td>
                    <td className="py-2 px-2 text-xs">{u.nature_controle}</td>
                    <td className="py-2 px-2">{u.is_pep ? <Badge className="bg-amber-100 text-amber-800">PEP</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{u.sanctions_clear == null ? '—' : u.sanctions_clear ? '✓' : '✗'}</td>
                    <td className="py-2 px-2"><Button size="sm" variant="outline" onClick={() => attest(u.id)} className="text-xs">Attester</Button></td>
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
