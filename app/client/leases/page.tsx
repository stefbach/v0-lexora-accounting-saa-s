"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, FileSignature } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-slate-100 text-slate-700',
  terminated: 'bg-red-100 text-red-800',
  expired: 'bg-amber-100 text-amber-800',
}

export default function LeasesPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/leases?societe_id=${societeId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileSignature className="h-6 w-6 text-indigo-600" /> Contrats de location IFRS 16</h1>
          <p className="text-sm text-slate-500">IFRS 16 §22-28 — Right-of-Use + Lease Liability</p>
        </div>
        <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Leases actifs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_active || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Right-of-Use total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(s.total_rou_mur)}</div><div className="text-xs text-slate-500">MUR (compte 2151)</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Dette location</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_liability_mur)}</div><div className="text-xs text-slate-500">MUR (comptes 1751/1752)</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Leases du portefeuille</CardTitle></CardHeader>
        <CardContent>
          {(data?.leases?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun lease enregistré.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Bailleur</th><th className="py-2 px-2">Actif</th><th className="py-2 px-2">Catégorie</th><th className="py-2 px-2 text-right">Mensualité</th><th className="py-2 px-2 text-right">Durée</th><th className="py-2 px-2 text-right">RoU initial</th><th className="py-2 px-2">Statut</th></tr></thead>
              <tbody>
                {data.leases.map((l: any) => (
                  <tr key={l.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{l.lessor}</td>
                    <td className="py-2 px-2 text-xs">{l.asset_description}</td>
                    <td className="py-2 px-2 text-xs">{l.asset_category}</td>
                    <td className="py-2 px-2 text-right">{fmt(l.monthly_payment_amount)} {l.currency}</td>
                    <td className="py-2 px-2 text-right">{l.term_months} mois</td>
                    <td className="py-2 px-2 text-right">{fmt(l.initial_rou_mur)}</td>
                    <td className="py-2 px-2"><Badge className={STATUS_COLOR[l.status]}>{l.status}</Badge>{(l.short_term_exemption || l.low_value_exemption) && <Badge variant="outline" className="ml-1 text-[10px]">exempt</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <AlertCircle className="h-4 w-4 mt-0.5" />
        <div>Exemptions IFRS 16 §5 : leases ≤ 12 mois (short-term) ou actifs &lt; USD 5,000 (low-value) → traités comme charge directe (sans RoU/liability).</div>
      </div>
    </div>
  )
}
