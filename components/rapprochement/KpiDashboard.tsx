"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Activity,
  Shield,
  Clock,
  Target,
  Info,
  HelpCircle,
  Loader2,
} from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface KpiIndicator {
  value: number
  target: number
  status: "ok" | "warning" | "error"
  label: string
}

interface KpiData {
  taux_auto: KpiIndicator
  transactions_inconnu: KpiIndicator
  taux_lettrage_401: KpiIndicator
  solde_580_transit: KpiIndicator
  alertes_critiques: KpiIndicator
  qualification_requise: KpiIndicator
  factures: {
    total: number
    paye: number
    partiel: number
    attente: number
    taux_paye: number
  }
  aged_balance: {
    "0-30": number
    "31-60": number
    "61-90": number
    ">90": number
  }
  reconciliations: {
    locked: number
    validated: number
    draft: number
    total: number
  }
  compliance: {
    critical: number
    high: number
    total_open: number
  }
  summary: {
    total_transactions: number
    matched: number
    unknown: number
  }
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusColor(status: "ok" | "warning" | "error") {
  if (status === "ok") return "text-emerald-600 bg-emerald-50 border-emerald-200"
  if (status === "warning") return "text-amber-600 bg-amber-50 border-amber-200"
  return "text-red-600 bg-red-50 border-red-200"
}

function statusIcon(status: "ok" | "warning" | "error") {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4" />
  if (status === "warning") return <AlertTriangle className="h-4 w-4" />
  return <AlertCircle className="h-4 w-4" />
}

function KpiCard({
  indicator,
  icon,
  suffix = "",
  tooltip,
  prefix = "",
}: {
  indicator: KpiIndicator
  icon: React.ReactNode
  suffix?: string
  prefix?: string
  tooltip: string
}) {
  const color = statusColor(indicator.status)
  const locale = getLocale()
  return (
    <Card className={`border-l-4 ${indicator.status === "ok" ? "border-l-emerald-500" : indicator.status === "warning" ? "border-l-amber-500" : "border-l-red-500"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            {icon}
            <span className="text-xs font-medium">{indicator.label}</span>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">{tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Badge variant="outline" className={`text-xs ${color} gap-1`}>
            {statusIcon(indicator.status)}
          </Badge>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{prefix}{indicator.value.toLocaleString("fr-FR")}{suffix}</span>
          <span className="text-xs text-slate-500">/ {t('cdlg.kpi.target', locale)} {indicator.target}{suffix}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function RapprochementKpiDashboard({ societeId }: { societeId: string | null }) {
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(false)
  const locale = getLocale()

  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    fetch(`/api/comptable/rapprochement/kpis?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.kpis) setData(d.kpis)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [societeId])

  if (!societeId) return null
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('cdlg.kpi.computing', locale)}
      </div>
    )
  }
  if (!data) return null

  const totalAged = data.aged_balance["0-30"] + data.aged_balance["31-60"] + data.aged_balance["61-90"] + data.aged_balance[">90"]

  return (
    <div className="space-y-4">
      {/* Bandeau indicateurs référentiel */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-slate-700" />
          <h3 className="font-semibold text-sm">{t('cdlg.kpi.ref_title', locale)}</h3>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-slate-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs">
                {t('cdlg.kpi.ref_tooltip', locale)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            indicator={data.taux_auto}
            icon={<Activity className="h-4 w-4" />}
            suffix="%"
            tooltip={t('cdlg.kpi.tt_taux_auto', locale)}
          />
          <KpiCard
            indicator={data.transactions_inconnu}
            icon={<AlertCircle className="h-4 w-4" />}
            tooltip={t('cdlg.kpi.tt_inconnu', locale)}
          />
          <KpiCard
            indicator={data.taux_lettrage_401}
            icon={<CheckCircle2 className="h-4 w-4" />}
            suffix="%"
            tooltip={t('cdlg.kpi.tt_lettrage_401', locale)}
          />
          <KpiCard
            indicator={data.solde_580_transit}
            icon={<Clock className="h-4 w-4" />}
            prefix="Rs "
            tooltip={t('cdlg.kpi.tt_580', locale)}
          />
          <KpiCard
            indicator={data.alertes_critiques}
            icon={<Shield className="h-4 w-4" />}
            tooltip={t('cdlg.kpi.tt_alertes', locale)}
          />
          <KpiCard
            indicator={data.qualification_requise}
            icon={<HelpCircle className="h-4 w-4" />}
            tooltip={t('cdlg.kpi.tt_qualif', locale)}
          />
        </div>
      </div>

      {/* Balance âgée fournisseurs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> {t('cdlg.kpi.aged_title', locale)}
            <Badge variant="outline" className="text-xs">{t('cdlg.kpi.aged_total', locale)} {fmt(totalAged)}</Badge>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm text-xs">
                  {t('cdlg.kpi.aged_tooltip', locale)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {([
              { key: "0-30", label: t('cdlg.kpi.aged_0_30', locale), color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
              { key: "31-60", label: t('cdlg.kpi.aged_31_60', locale), color: "bg-amber-100 text-amber-800 border-amber-200" },
              { key: "61-90", label: t('cdlg.kpi.aged_61_90', locale), color: "bg-orange-100 text-orange-800 border-orange-200" },
              { key: ">90", label: t('cdlg.kpi.aged_90', locale), color: "bg-red-100 text-red-800 border-red-200" },
            ] as const).map(b => {
              const v = data.aged_balance[b.key]
              const pct = totalAged > 0 ? (v / totalAged) * 100 : 0
              return (
                <div key={b.key} className={`rounded-lg border p-3 ${b.color}`}>
                  <div className="text-xs font-medium opacity-80">{b.label}</div>
                  <div className="text-lg font-bold mt-1">Rs {fmt(v)}</div>
                  <Progress value={pct} className="h-1 mt-2" />
                  <div className="text-[10px] mt-1 opacity-70">{pct.toFixed(1)}% {t('cdlg.kpi.aged_of_total', locale)}</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Synthèse factures + rapprochements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('cdlg.kpi.invoices', locale)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.inv_paid', locale)}</span>
              <Badge className="bg-emerald-100 text-emerald-800 border-0">{data.factures.paye} / {data.factures.total}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.inv_partial', locale)}</span>
              <span className="font-medium">{data.factures.partiel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.inv_pending', locale)}</span>
              <span className="font-medium">{data.factures.attente}</span>
            </div>
            <Progress value={data.factures.taux_paye} className="h-2 mt-2" />
            <div className="text-xs text-slate-500 text-right">{t('cdlg.kpi.inv_rate', locale)} {data.factures.taux_paye}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('cdlg.kpi.recon_title', locale)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.recon_locked', locale)}</span>
              <Badge className="bg-slate-900 text-white border-0">{data.reconciliations.locked}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.recon_validated', locale)}</span>
              <Badge className="bg-emerald-100 text-emerald-800 border-0">{data.reconciliations.validated}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.recon_draft', locale)}</span>
              <Badge variant="outline">{data.reconciliations.draft}</Badge>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-slate-600">{t('cdlg.kpi.recon_total', locale)}</span>
              <span className="font-semibold">{data.reconciliations.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> {t('cdlg.kpi.compliance_title', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.compliance_critical', locale)}</span>
              <Badge className={data.compliance.critical > 0 ? "bg-red-100 text-red-800 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                {data.compliance.critical}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('cdlg.kpi.compliance_high', locale)}</span>
              <Badge className={data.compliance.high > 0 ? "bg-amber-100 text-amber-800 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                {data.compliance.high}
              </Badge>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-slate-600">{t('cdlg.kpi.compliance_open', locale)}</span>
              <span className="font-semibold">{data.compliance.total_open}</span>
            </div>
            {data.compliance.critical > 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                {t('cdlg.kpi.compliance_action', locale)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
