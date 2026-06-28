"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle2, Lock, AlertCircle, ChevronRight, Loader2 } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface MonthStats {
  mois: string // YYYY-MM
  total_tx: number
  rapproche: number
  a_verifier: number
  non_identifie: number
  interne: number
  nb_factures: number
  factures_payees: number
  factures_retard: number
  factures_attente: number
  montant_factures_total: number
  ecritures_401_non_lettrees: number
  ecritures_411_non_lettrees: number
  solde_580: number
  reconciliation_status: string | null
  completion_pct: number
}

const MOIS_KEYS = [
  "scmsc.per.mois_janv", "scmsc.per.mois_fevr", "scmsc.per.mois_mars", "scmsc.per.mois_avr",
  "scmsc.per.mois_mai", "scmsc.per.mois_juin", "scmsc.per.mois_juil", "scmsc.per.mois_aout",
  "scmsc.per.mois_sept", "scmsc.per.mois_oct", "scmsc.per.mois_nov", "scmsc.per.mois_dec",
]

function formatMoisLong(ym: string, locale: ReturnType<typeof getLocale>) {
  const [y, m] = ym.split("-")
  return `${t(MOIS_KEYS[parseInt(m, 10) - 1], locale)} ${y}`
}

function statusBadge(status: string | null, locale: ReturnType<typeof getLocale>) {
  if (status === "locked") return <Badge className="bg-slate-900 text-white border-0 text-[10px]"><Lock className="w-2.5 h-2.5 mr-1" />{t('scmsc.per.status_verrouille', locale)}</Badge>
  if (status === "validated") return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />{t('scmsc.per.status_valide', locale)}</Badge>
  if (status === "submitted") return <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">{t('scmsc.per.status_soumis', locale)}</Badge>
  if (status === "draft") return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">{t('scmsc.per.status_brouillon', locale)}</Badge>
  return <Badge variant="outline" className="text-[10px]">{t('scmsc.per.status_ouvert', locale)}</Badge>
}

export function PeriodeBar({
  societeId,
  activeMonth,
  onSelectMonth,
  onCloturer,
}: {
  societeId: string | null
  activeMonth: string | null
  onSelectMonth: (month: string | null) => void
  onCloturer?: (month: string) => void
}) {
  const locale = getLocale()
  const [months, setMonths] = useState<MonthStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    setError(null)
    fetch(`/api/comptable/rapprochement/mois-overview?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.error) {
          setError(d.error)
          setMonths([])
        } else {
          setMonths(d.months || [])
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [societeId])

  if (!societeId) {
    return (
      <Card className="border-2 border-slate-200 bg-slate-50">
        <CardContent className="p-3 text-sm text-slate-500">
          {t('scmsc.per.select_societe', locale)}
        </CardContent>
      </Card>
    )
  }

  const activeStats = months.find(m => m.mois === activeMonth)

  return (
    <Card className="border-2 border-[#D4AF37]/30 bg-gradient-to-r from-[#FFFAF0] to-white">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Calendar className="w-4 h-4 text-[#0B0F2E]" />
          <h3 className="font-semibold text-sm text-[#0B0F2E]">
            {t('scmsc.per.periode_active', locale).replace('{label}', activeMonth ? formatMoisLong(activeMonth, locale) : t('scmsc.per.toutes_periodes', locale))}
          </h3>
          {activeStats && statusBadge(activeStats.reconciliation_status, locale)}
          {activeStats && (
            <span className="text-xs text-slate-500">
              {t('scmsc.per.stats_summary', locale)
                .replace('{pct}', String(activeStats.completion_pct))
                .replace('{av}', String(activeStats.a_verifier))
                .replace('{ni}', String(activeStats.non_identifie))
                .replace('{ec}', String(activeStats.ecritures_401_non_lettrees))}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onSelectMonth(null)}
            >
              {t('scmsc.per.toutes_periodes', locale)}
            </Button>
            {activeMonth && activeStats && activeStats.reconciliation_status !== "locked" && onCloturer && (
              <Button
                size="sm"
                className="h-7 text-xs bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white"
                onClick={() => onCloturer(activeMonth)}
                disabled={activeStats.a_verifier > 0 || activeStats.non_identifie > 0}
                title={
                  activeStats.a_verifier > 0 || activeStats.non_identifie > 0
                    ? t('scmsc.per.cloturer_disabled_tip', locale).replace('{n}', String(activeStats.a_verifier + activeStats.non_identifie))
                    : t('scmsc.per.cloturer_enabled_tip', locale)
                }
              >
                <Lock className="w-3 h-3 mr-1" />
                {t('scmsc.per.cloturer_ce_mois', locale)}
              </Button>
            )}
          </div>
        </div>

        {loading && months.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('scmsc.per.chargement_periodes', locale)}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-red-600 py-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : months.length === 0 ? (
          <div className="text-sm text-slate-500 py-2">
            {t('scmsc.per.aucune_periode', locale)}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {months.map(m => {
              const isActive = m.mois === activeMonth
              return (
                <button
                  key={m.mois}
                  onClick={() => onSelectMonth(m.mois)}
                  className={`shrink-0 min-w-[180px] text-left rounded-lg border-2 transition-all p-2 relative ${
                    isActive
                      ? "border-[#D4AF37] bg-white shadow-md"
                      : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-xs text-[#0B0F2E]">{formatMoisLong(m.mois, locale)}</span>
                    {statusBadge(m.reconciliation_status, locale)}
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <Progress value={m.completion_pct} className="h-1.5 flex-1" />
                    <span className="text-[10px] font-mono text-slate-600 w-8 text-right">{m.completion_pct}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-600 flex-wrap">
                    <span>{m.total_tx} {t('scmsc.per.tx', locale)}</span>
                    {m.a_verifier > 0 && <span className="text-amber-600">• {m.a_verifier} ⚠</span>}
                    {m.non_identifie > 0 && <span className="text-red-600">• {m.non_identifie} ?</span>}
                    {m.ecritures_401_non_lettrees > 0 && <span className="text-blue-600">• {m.ecritures_401_non_lettrees} 401</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
