"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Download, FileText } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(n))

export default function GbcCrsFatcaPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear() - 1)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/crs-fatca?societe_id=${societeId}&year=${year}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, year])

  const generateXml = async () => {
    const res = await fetch('/api/comptable/gbc/crs-fatca', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_xml', societe_id: societeId, year }) })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `crs_${societeId}_${year}.xml`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-indigo-600" /> CRS / FATCA</h1>
          <p className="text-sm text-slate-500">OECD CRS + US-Mauritius IGA Model 1A — déclarations annuelles MRA</p>
        </div>
        <div className="flex gap-2">
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
          <Button onClick={generateXml} variant="outline" className="border-indigo-300 text-indigo-700"><Download className="h-4 w-4 mr-2" />XML CRS</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Account holders</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_holders || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">CRS reportable</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_crs_reportable || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">FATCA reportable</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_fatca_reportable || 0}</div><div className="text-xs text-slate-500">US Persons</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Balance totale USD</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_balance_usd)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Account holders</CardTitle></CardHeader>
        <CardContent>
          {(data?.holders?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun holder déclaré pour {year}.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Holder</th><th className="py-2 px-2">Pays</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">Balance USD</th><th className="py-2 px-2">CRS</th><th className="py-2 px-2">FATCA</th><th className="py-2 px-2">Statut</th></tr></thead>
              <tbody>
                {data.holders.map((h: any) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{h.holder_name}</td>
                    <td className="py-2 px-2 text-xs">{h.country_of_residence}</td>
                    <td className="py-2 px-2 text-xs">{h.holder_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(h.account_balance_eoy_usd)}</td>
                    <td className="py-2 px-2 text-xs">{h.is_crs_reportable ? <Badge variant="outline">CRS</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{h.is_fatca_reportable ? <Badge className="bg-blue-100 text-blue-800">FATCA</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{h.document_status}</td>
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
