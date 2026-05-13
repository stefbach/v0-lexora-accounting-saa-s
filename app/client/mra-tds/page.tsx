"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Download, RefreshCw, AlertCircle, Banknote } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const STATUS_COLOR: Record<string, string> = { paye: 'bg-emerald-100 text-emerald-800', declare: 'bg-blue-100 text-blue-800', a_faire: 'bg-amber-100 text-amber-800', retard: 'bg-red-100 text-red-800' }

export default function MraTdsPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [annual, setAnnual] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periode, setPeriode] = useState(() => new Date().toISOString().slice(0, 7))
  const [year, setYear] = useState(new Date().getFullYear() - 1)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/comptable/mra/tds?societe_id=${societeId}&periode=${periode}`).then(r => r.json()),
        fetch(`/api/comptable/mra/tds?societe_id=${societeId}&year=${year}&action=annual`).then(r => r.json()),
      ])
      setData(r1); setAnnual(r2)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, periode, year])

  const exportCsv = () => { if (societeId) window.location.href = `/api/comptable/mra/tds?societe_id=${societeId}&periode=${periode}&action=export_csv` }
  const markAction = async (action: string) => {
    if (!societeId) return
    await fetch('/api/comptable/mra/tds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ societe_id: societeId, periode, action }) })
    load()
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}
  const d = data?.declaration

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-amber-600" /> TDS — Tax Deducted at Source</h1>
          <p className="text-sm text-slate-500">Section 111A Income Tax Act 1995 — retenue automatique sur paiements fournisseurs</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Paiements TDS</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_paiements || 0}</div><div className="text-xs text-slate-500">période {periode}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Total brut</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_paiements_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">TDS retenu</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700">{fmt(s.total_tds_mur)}</div><div className="text-xs text-slate-500">à reverser MRA</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Échéance</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{s.date_limite || '—'}</div><Badge className={STATUS_COLOR[d?.statut || 'a_faire']}>{d?.statut || 'à faire'}</Badge></CardContent></Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={exportCsv} variant="outline"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
        {d?.statut !== 'declare' && d?.statut !== 'paye' && <Button onClick={() => markAction('mark_declared')} variant="outline">Marquer déclaré</Button>}
        {d?.statut === 'declare' && <Button onClick={() => markAction('mark_paid')} variant="outline" className="bg-emerald-50 text-emerald-700">Marquer payé</Button>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Détail des factures avec TDS — {periode}</CardTitle></CardHeader>
        <CardContent>
          {(data?.factures?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune facture avec TDS pour cette période.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Date</th><th className="py-2 px-2">Tiers</th><th className="py-2 px-2">Catégorie</th><th className="py-2 px-2 text-right">Brut</th><th className="py-2 px-2 text-right">Taux</th><th className="py-2 px-2 text-right">TDS</th></tr></thead>
              <tbody>
                {data.factures.map((f: any) => (
                  <tr key={f.id} className="border-b">
                    <td className="py-2 px-2 text-xs">{f.date_facture}</td>
                    <td className="py-2 px-2 font-medium">{f.tiers}</td>
                    <td className="py-2 px-2 text-xs"><Badge variant="outline">{f.tds_category}</Badge></td>
                    <td className="py-2 px-2 text-right">{fmt(f.montant_mur)}</td>
                    <td className="py-2 px-2 text-right">{f.tds_rate_pct}%</td>
                    <td className="py-2 px-2 text-right font-semibold text-amber-700">{fmt(f.tds_amount_mur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Annual statement */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">TDS Annual Statement — {year}</CardTitle>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
        </CardHeader>
        <CardContent>
          {(annual?.records?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun TDS pour {year}.</div>
          ) : (
            <>
              <div className="mb-2 text-sm">Total TDS {year} : <span className="font-bold">{fmt(annual.total_tds_mur)} MUR</span></div>
              <table className="w-full text-sm">
                <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Tiers</th><th className="py-2 px-2">Catégorie</th><th className="py-2 px-2 text-right">Brut total</th><th className="py-2 px-2 text-right">TDS total</th><th className="py-2 px-2 text-right">Nb factures</th></tr></thead>
                <tbody>
                  {annual.records.map((r: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 px-2 font-medium">{r.tiers}</td>
                      <td className="py-2 px-2 text-xs">{r.category_libelle}</td>
                      <td className="py-2 px-2 text-right">{fmt(r.total_paiements_mur)}</td>
                      <td className="py-2 px-2 text-right font-semibold">{fmt(r.total_tds_mur)}</td>
                      <td className="py-2 px-2 text-right">{r.nb_factures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
