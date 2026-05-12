"use client"

/**
 * Page /client/ifrs9-ecl — Provision IFRS 9 (Expected Credit Loss).
 *
 * Vue niveau audit-ready :
 *   • KPIs globaux : exposure, ECL base, ECL forward-looking, taux couverture
 *   • Table par contrepartie avec Stage 1/2/3, PD/LGD utilisés, ECL
 *   • Disclosure IFRS 7 §35M : exposure par stage
 *   • Bouton "Refresh stages" (rappelle ifrs9_refresh_all_stages côté DB)
 *   • Override manuel d'un stage (avec raison) → trace audit
 *
 * Source : /api/comptable/ifrs9/ecl
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, Shield, TrendingUp, Info } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

type EclRow = {
  tiers: string
  stage: number
  exposure_mur: number
  pd_used_pct: number
  lgd_pct: number
  ead_factor_pct: number
  macro_multiplier: number
  ecl_base_mur: number
  ecl_with_macro_mur: number
}

type DisclosureRow = { stage: number; nb_contreparties: number; nb_factures: number; exposure_total_mur: number }

type EclResponse = {
  societe_id: string
  computed_at: string
  ecl_by_counterparty: EclRow[]
  disclosure_by_stage: DisclosureRow[]
  totals: {
    exposure_total_mur: number
    ecl_base_total_mur: number
    ecl_with_macro_total_mur: number
    macro_impact_mur: number
    coverage_ratio_pct: number
  }
}

function fmtMUR(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))
}

const STAGE_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Stage 1 — Performing', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  2: { label: 'Stage 2 — SICR',       color: 'bg-amber-100 text-amber-800 border-amber-200' },
  3: { label: 'Stage 3 — Default',    color: 'bg-red-100 text-red-800 border-red-200' },
}

export default function Ifrs9EclPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<EclResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (!societeId) { setLoading(false); return }
    setError(null)
    if (refresh) setRefreshing(true); else setLoading(true)
    try {
      const url = `/api/comptable/ifrs9/ecl?societe_id=${societeId}${refresh ? '&refresh=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [societeId])

  useEffect(() => { load(false) }, [load])

  const overrideStage = async (tiers: string, stage: number) => {
    const reason = window.prompt(`Override Stage IFRS 9 pour "${tiers}" → Stage ${stage}\n\nRaison (audit trail) :`)
    if (!reason) return
    try {
      const res = await fetch('/api/comptable/ifrs9/ecl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, action: 'override_stage', tiers, stage, reason }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load(false)
    } catch (e: any) {
      setError(e?.message || 'Override échoué')
    }
  }

  if (loading && !data) {
    return <div className="p-8 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin h-5 w-5" /> Chargement IFRS 9…</div>
  }

  if (!societeId) {
    return (
      <div className="p-8">
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Aucune société sélectionnée.</strong> Choisis une société dans la barre supérieure pour calculer son ECL IFRS 9.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-indigo-600" /> Provision IFRS 9 — ECL</h1>
          <p className="text-sm text-slate-500">Expected Credit Loss avec Stages 1/2/3, SICR automatique, PD/LGD paramétrables, ajustement forward-looking.</p>
        </div>
        <Button onClick={() => load(true)} disabled={refreshing} variant="outline">
          {refreshing ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh stages
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">Exposure total</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmtMUR(data.totals.exposure_total_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">ECL base</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmtMUR(data.totals.ecl_base_total_mur)}</div><div className="text-xs text-slate-500">EAD × PD × LGD</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">ECL forward-looking</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-700">{fmtMUR(data.totals.ecl_with_macro_total_mur)}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> impact macro : {fmtMUR(data.totals.macro_impact_mur)}</div>
              </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">Taux couverture</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{data.totals.coverage_ratio_pct.toFixed(2)}%</div><div className="text-xs text-slate-500">ECL / exposure</div></CardContent></Card>
          </div>

          {/* Disclosure IFRS 7 par stage */}
          <Card>
            <CardHeader><CardTitle className="text-base">Disclosure IFRS 7 — exposition par stage</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(stage => {
                  const row = data.disclosure_by_stage.find(d => d.stage === stage)
                  return (
                    <div key={stage} className={`rounded border p-4 ${STAGE_LABEL[stage].color}`}>
                      <div className="text-xs font-medium uppercase tracking-wide">{STAGE_LABEL[stage].label}</div>
                      <div className="mt-2 text-xl font-bold">{fmtMUR(row?.exposure_total_mur || 0)} MUR</div>
                      <div className="text-xs mt-1">{row?.nb_contreparties || 0} contreparties · {row?.nb_factures || 0} factures</div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Table détaillée par contrepartie */}
          <Card>
            <CardHeader><CardTitle className="text-base">Détail par contrepartie</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {data.ecl_by_counterparty.length === 0 ? (
                <div className="text-sm text-slate-500 p-4 text-center">Aucune créance client non payée. ECL = 0.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                      <th className="py-2 px-2">Contrepartie</th>
                      <th className="py-2 px-2">Stage</th>
                      <th className="py-2 px-2 text-right">Exposure</th>
                      <th className="py-2 px-2 text-right">PD %</th>
                      <th className="py-2 px-2 text-right">LGD %</th>
                      <th className="py-2 px-2 text-right">Macro ×</th>
                      <th className="py-2 px-2 text-right">ECL base</th>
                      <th className="py-2 px-2 text-right">ECL ajustée</th>
                      <th className="py-2 px-2 text-center">Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ecl_by_counterparty.map((r) => (
                      <tr key={r.tiers} className="border-b hover:bg-slate-50">
                        <td className="py-2 px-2 font-medium">{r.tiers}</td>
                        <td className="py-2 px-2"><Badge variant="outline" className={STAGE_LABEL[r.stage]?.color}>Stage {r.stage}</Badge></td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMUR(r.exposure_mur)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Number(r.pd_used_pct).toFixed(2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Number(r.lgd_pct).toFixed(2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Number(r.macro_multiplier).toFixed(2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMUR(r.ecl_base_mur)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold text-indigo-700">{fmtMUR(r.ecl_with_macro_mur)}</td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex gap-1 justify-center">
                            {[1, 2, 3].filter(s => s !== r.stage).map(s => (
                              <button key={s} onClick={() => overrideStage(r.tiers, s)}
                                className="text-xs px-1.5 py-0.5 rounded border hover:bg-slate-100" title={`Forcer Stage ${s}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
            <Info className="h-4 w-4 mt-0.5" />
            <div>
              <strong>Méthodologie :</strong> ECL = EAD × PD × LGD × Macro_adj.
              PD 12 mois si Stage 1, PD lifetime si Stage 2/3. SICR auto : retard &gt; 30j → Stage 2, &gt; 90j → Stage 3.
              Override manuel possible (audit trail dans <code>ifrs9_stage_history</code>).
              Conforme IFRS 9 §5.5 et IFRS 7 §35M.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
