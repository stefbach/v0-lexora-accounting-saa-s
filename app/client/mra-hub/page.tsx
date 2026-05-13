"use client"
/**
 * /client/mra-hub — Hub central MRA Maurice + Tax Calendar.
 *
 * Affiche en une page :
 * - 5 KPI (overdue / urgent / soon / done / total)
 * - Tax Calendar groupé par priorité avec liens vers chaque module
 * - Cards d'accès rapide aux modules (TVA, TDS, PAYE, CSG, CIT, ROC, SFT, IT3)
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Calendar, Receipt, FileText, Briefcase, Building2, AlertTriangle, Banknote } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import Link from 'next/link'

const PRIORITY_COLOR: Record<string, string> = {
  overdue: 'bg-red-100 text-red-900 border-red-200',
  urgent:  'bg-amber-100 text-amber-900 border-amber-200',
  soon:    'bg-blue-100 text-blue-900 border-blue-200',
  future:  'bg-slate-100 text-slate-700 border-slate-200',
  done:    'bg-emerald-100 text-emerald-900 border-emerald-200',
}
const TYPE_HREF: Record<string, string> = {
  TVA: '/client/tva',
  TDS: '/client/mra-tds',
  CIT: '/client/mra-cit',
  ROC: '/client/mra-roc',
}

export default function MraHubPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/mra/tax-calendar?societe_id=${societeId}`, { cache: 'no-store' })
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6 text-indigo-600" /> MRA Hub — Tax Calendar</h1>
          <p className="text-sm text-slate-500">Toutes vos obligations MRA Maurice en un coup d'œil</p>
        </div>
        <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={`rounded-xl border p-4 ${PRIORITY_COLOR.overdue}`}><div className="text-xs uppercase font-semibold opacity-75">En retard</div><div className="text-3xl font-bold mt-1">{s.overdue || 0}</div></div>
        <div className={`rounded-xl border p-4 ${PRIORITY_COLOR.urgent}`}><div className="text-xs uppercase font-semibold opacity-75">Urgent (&lt; 7j)</div><div className="text-3xl font-bold mt-1">{s.urgent || 0}</div></div>
        <div className={`rounded-xl border p-4 ${PRIORITY_COLOR.soon}`}><div className="text-xs uppercase font-semibold opacity-75">À venir (&lt; 30j)</div><div className="text-3xl font-bold mt-1">{s.soon || 0}</div></div>
        <div className={`rounded-xl border p-4 ${PRIORITY_COLOR.future}`}><div className="text-xs uppercase font-semibold opacity-75">Plus tard</div><div className="text-3xl font-bold mt-1">{s.future || 0}</div></div>
        <div className={`rounded-xl border p-4 ${PRIORITY_COLOR.done}`}><div className="text-xs uppercase font-semibold opacity-75">Réglés</div><div className="text-3xl font-bold mt-1">{s.done || 0}</div></div>
      </div>

      {/* Modules access */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/client/tva" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><Receipt className="h-5 w-5 text-indigo-600 mb-2" /><div className="font-semibold text-sm">TVA</div><div className="text-xs text-slate-500">VAT 3/4 + Reverse Charge</div></Link>
        <Link href="/client/mra-tds" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><Banknote className="h-5 w-5 text-amber-600 mb-2" /><div className="font-semibold text-sm">TDS</div><div className="text-xs text-slate-500">Section 111A auto</div></Link>
        <Link href="/client/declarations-sociales" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><FileText className="h-5 w-5 text-blue-600 mb-2" /><div className="font-semibold text-sm">PAYE + CSG/NSF</div><div className="text-xs text-slate-500">Mensuel</div></Link>
        <Link href="/client/it-form3" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><FileText className="h-5 w-5 text-purple-600 mb-2" /><div className="font-semibold text-sm">IT Form 3</div><div className="text-xs text-slate-500">TDS annuel</div></Link>
        <Link href="/client/mra-cit" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><Briefcase className="h-5 w-5 text-emerald-600 mb-2" /><div className="font-semibold text-sm">CIT</div><div className="text-xs text-slate-500">Income Tax Return</div></Link>
        <Link href="/client/mra-roc" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><Building2 className="h-5 w-5 text-slate-700 mb-2" /><div className="font-semibold text-sm">ROC Annual</div><div className="text-xs text-slate-500">Companies Act</div></Link>
        <Link href="/client/mra-sft" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><AlertTriangle className="h-5 w-5 text-rose-600 mb-2" /><div className="font-semibold text-sm">SFT</div><div className="text-xs text-slate-500">Transactions &gt; 50k</div></Link>
        <Link href="/client/annual-return" className="rounded-xl border bg-white p-4 hover:shadow-md transition"><Building2 className="h-5 w-5 text-cyan-600 mb-2" /><div className="font-semibold text-sm">Annual Return</div><div className="text-xs text-slate-500">FSC + ROC</div></Link>
      </div>

      {/* Tax Calendar par priorité */}
      {(['overdue', 'urgent', 'soon', 'future', 'done'] as const).map(pri => {
        const items = data?.calendar?.[pri] || []
        if (items.length === 0) return null
        const labels: Record<string, string> = { overdue: '🚨 En retard', urgent: '⚠️ Urgent', soon: '📅 À venir', future: 'Plus tard', done: '✅ Réglés' }
        return (
          <Card key={pri}>
            <CardHeader><CardTitle className="text-base">{labels[pri]} ({items.length})</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Type</th><th className="py-2 px-2">Référence</th><th className="py-2 px-2">Échéance</th><th className="py-2 px-2">Statut</th><th className="py-2 px-2"></th></tr></thead>
                <tbody>
                  {items.map((row: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 px-2"><Badge className={PRIORITY_COLOR[pri]}>{row.type_declaration}</Badge></td>
                      <td className="py-2 px-2 font-mono text-xs">{row.reference}</td>
                      <td className="py-2 px-2 text-xs">{row.date_limite}</td>
                      <td className="py-2 px-2 text-xs">{row.statut}</td>
                      <td className="py-2 px-2 text-right">{TYPE_HREF[row.type_declaration] && <Link href={TYPE_HREF[row.type_declaration]} className="text-indigo-600 hover:underline text-xs">Ouvrir →</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
