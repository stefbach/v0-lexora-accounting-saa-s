"use client"
import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, TrendingUp, TrendingDown, Brain } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n).replace("€","MUR") }
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` }

export default function TableauDeBordFinancierPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0,7))

  const generer = useCallback(async () => {
    if (!societeId) return
    setGenerating(true)
    try {
      const res = await fetch("/api/generer-tableau-de-bord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ societe_id: societeId, periode, type_periode: "mensuel" }) })
      const d = await res.json()
      setData(d)
    } catch (e) { console.error(e) }
    finally { setGenerating(false) }
  }, [societeId, periode])

  const kpis = data?.dashboard?.kpis || []
  const recommandations = data?.dashboard?.recommandations || []
  const alertes = data?.dashboard?.alertes || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#0B0F2E]">{t('core.tdbf.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('core.tdbf.subtitle', locale)}</p></div>
        <div className="flex gap-2">
          <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="border rounded px-3 py-2 text-sm"/>
          <Button onClick={generer} disabled={generating || !societeId} className="bg-[#0B0F2E] text-white gap-1">
            {generating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Brain className="w-4 h-4"/>}
            {t('core.tdbf.analyze_with_ai', locale)}
          </Button>
        </div>
      </div>

      {!data && !generating && (
        <Card className="border-dashed"><CardContent className="p-8 text-center">
          <Brain className="w-12 h-12 text-[#D4AF37] mx-auto mb-3"/>
          <p className="text-gray-500">{t('core.tdbf.empty_prompt_1', locale)} <strong>{t('core.tdbf.analyze_with_ai', locale)}</strong> {t('core.tdbf.empty_prompt_2', locale)}</p>
        </CardContent></Card>
      )}

      {generating && (
        <Card><CardContent className="p-8 flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]"/>
          <p className="text-gray-500">{t('core.tdbf.loading_msg', locale)}</p>
        </CardContent></Card>
      )}

      {data && !generating && (
        <>
          {/* KPIs */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpis.map((k: any, i: number) => (
                <Card key={i}><CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <p className="text-xl font-bold text-[#0B0F2E]">{typeof k.valeur === 'number' ? fmt(k.valeur) : k.valeur}</p>
                  {k.variation !== undefined && (
                    <p className={`text-xs ${k.variation >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {k.variation >= 0 ? <TrendingUp className="w-3 h-3 inline mr-1"/> : <TrendingDown className="w-3 h-3 inline mr-1"/>}
                      {pct(k.variation)} {t('core.tdbf.vs_prev_month', locale)}
                    </p>
                  )}
                </CardContent></Card>
              ))}
            </div>
          )}

          {/* Alertes */}
          {alertes.length > 0 && (
            <div className="space-y-2">
              {alertes.map((a: any, i: number) => (
                <div key={i} className={`p-3 rounded-lg text-sm flex items-start gap-2 ${a.type === 'critique' ? 'bg-red-50 text-red-700' : a.type === 'attention' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                  <span className="font-bold">{a.type === 'critique' ? '🔴' : a.type === 'attention' ? '🟡' : 'ℹ️'}</span>
                  {a.message}
                </div>
              ))}
            </div>
          )}

          {/* Recommandations IA */}
          {recommandations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><Brain className="w-4 h-4 text-[#D4AF37]"/>{t('core.tdbf.cfo_recommendations', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {recommandations.map((r: any, i: number) => (
                  <div key={i} className="border-l-4 border-[#D4AF37] pl-4 py-1">
                    <p className="text-sm text-[#0B0F2E] font-medium">{r.titre || r}</p>
                    {r.detail && <p className="text-xs text-gray-500 mt-1">{r.detail}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Résumé textuel */}
          {data?.dashboard?.resume && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-sm text-blue-800">{data.dashboard.resume}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
