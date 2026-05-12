"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(Number(n))
const STATUS_COLOR: Record<string, string> = {
  compliant: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  at_risk: 'bg-amber-100 text-amber-800 border-amber-200',
  non_compliant: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function GbcSubstancePage() {
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
      const res = await fetch(`/api/comptable/gbc/substance?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const ass = data?.auto_assessment || {}
  const tr = data?.tracking || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-indigo-600" /> Substance Requirements (CIGA)</h1>
          <p className="text-sm text-slate-500">Income Tax Act §73A + FSC Guidelines — exigences pour bénéficier du PER</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Statut compliance</CardTitle></CardHeader><CardContent>
          <Badge className={STATUS_COLOR[ass?.overall_status || 'pending']}>{ass?.overall_status || 'pending'}</Badge>
          {tr?.activity_code && <div className="text-xs text-slate-500 mt-2">Activité : {tr.activity_code}</div>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Dépenses Maurice</CardTitle></CardHeader><CardContent>
          <div className="text-xl font-bold">{fmt(ass?.actual_expenditure_mur)}</div>
          <div className="text-xs text-slate-500">Requis : {fmt(ass?.required_expenditure_mur)} MUR</div>
          <div className={`text-xs mt-1 ${ass?.expenditure_compliant ? 'text-emerald-700' : 'text-red-700'}`}>{ass?.expenditure_compliant ? '✓ conforme' : '✗ insuffisant'}</div>
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Employés</CardTitle></CardHeader><CardContent>
          <div className="text-xl font-bold">{ass?.actual_employees ?? '—'}</div>
          <div className="text-xs text-slate-500">Requis : {ass?.required_employees ?? '—'}</div>
          <div className={`text-xs mt-1 ${ass?.employees_compliant ? 'text-emerald-700' : 'text-red-700'}`}>{ass?.employees_compliant ? '✓ conforme' : '✗ insuffisant'}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Référentiel des activités</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Code</th><th className="py-2 px-2">Activité</th><th className="py-2 px-2 text-right">Dépenses min</th><th className="py-2 px-2 text-right">Employés min</th></tr></thead>
            <tbody>
              {(data?.requirements || []).map((r: any) => (
                <tr key={r.activity_code} className={`border-b ${tr?.activity_code === r.activity_code ? 'bg-indigo-50' : ''}`}>
                  <td className="py-2 px-2 font-mono text-xs">{r.activity_code}</td>
                  <td className="py-2 px-2">{r.libelle}</td>
                  <td className="py-2 px-2 text-right">{fmt(r.min_expenditure_mur)} MUR</td>
                  <td className="py-2 px-2 text-right">{r.min_employees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
