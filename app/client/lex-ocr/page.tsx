"use client"

/**
 * Page /client/lex-ocr — Agent Lex OCR (contrôle qualité OCR).
 */

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  ScanText,
  Sparkles,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  FileText,
  Check,
  ArrowRight,
  Ban,
  Eye,
  EyeOff,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from "@/lib/i18n"

interface Alert {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  document_id?: string
  document_nom?: string
  details?: any
}

function getCodeLabels(locale: Locale): Record<string, string> {
  return {
    OCR_ERROR: t('core.lex.label_ocr_error', locale),
    ORPHAN_OCR: t('core.lex.label_orphan_ocr', locale),
    ORPHAN_RELEVE: t('core.lex.label_orphan_releve', locale),
    DUPLICATE_INVOICE: t('core.lex.label_duplicate_invoice', locale),
    MISSING_FIELDS: t('core.lex.label_missing_fields', locale),
    MISMATCH_AMOUNT: t('core.lex.label_mismatch_amount', locale),
    MISMATCH_DATE: t('core.lex.label_mismatch_date', locale),
    MISMATCH_TIERS: t('core.lex.label_mismatch_tiers', locale),
    MISMATCH_CURRENCY: t('core.lex.label_mismatch_currency', locale),
    WRONG_SOCIETE: t('core.lex.label_wrong_societe', locale),
    MISMATCH_RELEVE_TX: t('core.lex.label_mismatch_releve_tx', locale),
  }
}

// Construit un identifiant stable pour une alerte (pour suivi local)
function alertKey(a: Alert): string {
  const facId = a.details?.facture_id || ""
  const docId = a.document_id || ""
  const num = a.details?.numero || ""
  const ids = a.details?.facture_ids ? a.details.facture_ids.join(",") : ""
  return `${a.code}|${facId}|${docId}|${num}|${ids}`
}

const RESOLVED_KEY = "lex-ocr-resolved-v1"

export default function LexOcrPage() {
  const locale = getLocale()
  const CODE_LABELS = getCodeLabels(locale)
  const { societeId } = useSocieteActive()
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(
    null
  )
  const [acting, setActing] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [showResolved, setShowResolved] = useState(false)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Charge les alertes marquées comme résolues (localStorage, par société)
  useEffect(() => {
    if (!societeId) return
    try {
      const raw = localStorage.getItem(`${RESOLVED_KEY}:${societeId}`)
      if (raw) setResolved(new Set(JSON.parse(raw)))
    } catch { /* noop */ }
  }, [societeId])

  const persistResolved = useCallback(
    (next: Set<string>) => {
      if (!societeId) return
      try {
        localStorage.setItem(
          `${RESOLVED_KEY}:${societeId}`,
          JSON.stringify(Array.from(next))
        )
      } catch { /* noop */ }
    },
    [societeId]
  )

  const markResolved = useCallback(
    (a: Alert) => {
      const k = alertKey(a)
      setResolved((prev) => {
        const n = new Set(prev)
        n.add(k)
        persistResolved(n)
        return n
      })
      showToast(t('core.lex.alert_resolved', locale))
    },
    [persistResolved]
  )

  const unmarkResolved = useCallback(
    (a: Alert) => {
      const k = alertKey(a)
      setResolved((prev) => {
        const n = new Set(prev)
        n.delete(k)
        persistResolved(n)
        return n
      })
      showToast(t('core.lex.alert_reshown', locale))
    },
    [persistResolved]
  )

  const callAction = useCallback(
    async (payload: Record<string, any>): Promise<boolean> => {
      if (!societeId) return false
      setActing(JSON.stringify(payload))
      try {
        const res = await fetch("/api/agent/alerts/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societeId, ...payload }),
        })
        const d = await res.json()
        if (!res.ok) {
          showToast(d?.error || t('core.lex.action_error', locale), "error")
          return false
        }
        return true
      } catch (e: any) {
        showToast(e?.message || t('core.lex.network_error', locale), "error")
        return false
      } finally {
        setActing(null)
      }
    },
    [societeId]
  )

  const handleApplyOcr = useCallback(
    async (a: Alert) => {
      const facture_id = a.details?.facture_id
      const field = a.details?.field
      const ocr_value = a.details?.ocr_value
      if (!facture_id || !field) return
      const fields: Record<string, any> = {}
      fields[field] = ocr_value
      const ok = await callAction({
        action: "apply_ocr_to_facture",
        facture_id,
        fields,
      })
      if (ok) {
        showToast(`${t('core.lex.ocr_applied', locale)} (${field}) — ${t('core.lex.relaunch_to_check', locale)}`)
        markResolved(a)
      }
    },
    [callAction, markResolved]
  )

  const handleAnnuleFacture = useCallback(
    async (facture_id: string, a: Alert) => {
      const ok = await callAction({ action: "annule_facture", facture_id })
      if (ok) {
        showToast(t('core.lex.invoice_cancelled', locale))
        markResolved(a)
      }
    },
    [callAction, markResolved]
  )

  const handleAnalyze = useCallback(async () => {
    if (!societeId) return
    setAnalyzing(true)
    try {
      const res = await fetch("/api/agent/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || t('core.lex.lex_ocr_error', locale), "error")
        return
      }
      setResult(d)
      showToast(`${t('core.lex.lex_ocr_score_msg', locale)} ${d.score}/100 — ${d.alerts.length} ${t('core.lex.alerts_count_word_one', locale)}`)
    } catch (e: any) {
      showToast(e?.message || t('core.lex.network_error', locale), "error")
    } finally {
      setAnalyzing(false)
    }
  }, [societeId])

  const alerts: Alert[] = result?.alerts || []
  const summary = result?.summary || {}

  const visibleAlerts = showResolved
    ? alerts
    : alerts.filter((a) => !resolved.has(alertKey(a)))

  const filteredAlerts =
    filter === "all" ? visibleAlerts : visibleAlerts.filter((a) => a.severity === filter)

  const resolvedCount = alerts.filter((a) => resolved.has(alertKey(a))).length

  const score = result?.score || 0
  const severity = result?.severity || "ok"
  const headerColor =
    severity === "critical"
      ? "border-red-300 bg-gradient-to-br from-red-50 to-rose-50"
      : severity === "warning"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"
        : "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50"
  const scoreColor =
    score >= 80 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700"

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 p-3 text-white shadow-md">
                <ScanText className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                  Lex OCR
                  <Badge className="bg-indigo-600 text-white text-[10px] uppercase">
                    {t('core.lex.ai_agent', locale)}
                  </Badge>
                </h1>
                <p className="text-sm text-indigo-700/80 mt-0.5">
                  {t('core.lex.header_subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/client/documents">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1.5" />
                  {t('core.lex.documents', locale)}
                </Button>
              </Link>
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !societeId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('core.lex.analyzing_dots', locale)}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('core.lex.launch_lex_ocr', locale)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('core.lex.company_unavailable', locale)}
            </CardContent>
          </Card>
        ) : !result ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Bot className="h-12 w-12 mx-auto text-indigo-300 mb-3" />
              <p className="font-medium text-sm">{t('core.lex.launch_to_start', locale)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('core.lex.agent_desc', locale)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score */}
            <div className={`rounded-xl border-2 p-4 ${headerColor}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-600 p-2.5 text-white shadow-md">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold">{t('core.lex.quality_control', locale)}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.total_documents} {t('core.lex.docs_analyzed', locale)} ·{" "}
                      {summary.factures_creees} {t('core.lex.factures', locale)} · {summary.releves_crees} {t('core.lex.releves', locale)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
                  <div className="text-xs text-muted-foreground">{t('core.lex.health_suffix', locale)}</div>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiCard label={t('core.lex.kpi_docs_error', locale)} value={summary.docs_en_erreur || 0} tone="rose" accent={summary.docs_en_erreur > 0} />
              <KpiCard label={t('core.lex.kpi_orphans', locale)} value={summary.docs_orphelins || 0} tone="rose" accent={summary.docs_orphelins > 0} />
              <KpiCard label={t('core.lex.kpi_missing_fields', locale)} value={summary.docs_champs_manquants || 0} tone="amber" accent={summary.docs_champs_manquants > 0} />
              <KpiCard label={t('core.lex.kpi_dup_invoices', locale)} value={summary.doublons_facture || 0} tone="amber" accent={summary.doublons_facture > 0} />
              <KpiCard label={t('core.lex.kpi_mismatch_amount', locale)} value={summary.mismatches_montant || 0} tone="amber" accent={summary.mismatches_montant > 0} />
              <KpiCard label={t('core.lex.kpi_mismatch_tiers', locale)} value={summary.mismatches_tiers || 0} tone="blue" />
            </div>

            {/* Filtre sévérité */}
            <Card>
              <CardContent className="p-3">
                <div className="flex gap-1 flex-wrap">
                  {(
                    [
                      { v: "all", label: t('core.lex.f_all', locale), count: alerts.length },
                      { v: "critical", label: t('core.lex.f_critical', locale), count: alerts.filter((a) => a.severity === "critical").length, color: "border-red-300" },
                      { v: "warning", label: t('core.lex.f_warning', locale), count: alerts.filter((a) => a.severity === "warning").length, color: "border-amber-300" },
                      { v: "info", label: t('core.lex.f_info', locale), count: alerts.filter((a) => a.severity === "info").length, color: "border-blue-300" },
                    ] as const
                  ).map((opt: any) => (
                    <button
                      key={opt.v}
                      onClick={() => setFilter(opt.v as any)}
                      className={`px-3 py-1 text-xs rounded border ${
                        filter === opt.v
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : `border-muted hover:border-indigo-300`
                      }`}
                    >
                      {opt.label} ({opt.count})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Alertes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    {t('core.lex.alerts_count', locale)} ({filteredAlerts.length})
                  </span>
                  {resolvedCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResolved((v) => !v)}
                      className="h-7 text-xs"
                    >
                      {showResolved ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 mr-1" />
                          {t('core.lex.hide_resolved', locale)} ({resolvedCount})
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          {t('core.lex.show_resolved', locale)} ({resolvedCount})
                        </>
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredAlerts.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
                    <p className="text-sm font-medium">
                      {filter === "all"
                        ? alerts.length === 0
                          ? t('core.lex.no_anomaly', locale)
                          : t('core.lex.all_handled', locale)
                        : `${t('core.lex.no_alert_with_severity', locale)} ${filter}`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAlerts.map((a, i) => {
                      const Icon =
                        a.severity === "critical"
                          ? XCircle
                          : a.severity === "warning"
                            ? AlertTriangle
                            : Info
                      const cls =
                        a.severity === "critical"
                          ? "border-red-300 bg-red-50 text-red-900"
                          : a.severity === "warning"
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-blue-300 bg-blue-50 text-blue-900"
                      const isResolved = resolved.has(alertKey(a))
                      const actingThis = !!acting && acting.includes(a.details?.facture_id || "___")
                      return (
                        <div
                          key={i}
                          className={`rounded border-l-4 p-3 ${cls} flex items-start gap-3 ${
                            isResolved ? "opacity-60" : ""
                          }`}
                        >
                          <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">
                                {CODE_LABELS[a.code] || a.code}
                              </Badge>
                              {a.document_nom && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  {a.document_nom.slice(0, 50)}
                                </Badge>
                              )}
                              {isResolved && (
                                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
                                  {t('core.lex.resolved', locale)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 break-words">{a.message}</p>

                            {/* Boutons d'action contextuels */}
                            {!isResolved && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(a.code === "MISMATCH_AMOUNT" ||
                                  a.code === "MISMATCH_DATE" ||
                                  a.code === "MISMATCH_TIERS" ||
                                  a.code === "MISMATCH_CURRENCY") &&
                                  a.details?.facture_id && (
                                    <>
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                        disabled={actingThis}
                                        onClick={() => handleApplyOcr(a)}
                                      >
                                        {actingThis ? (
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                          <ArrowRight className="h-3 w-3 mr-1" />
                                        )}
                                        {t('core.lex.apply_ocr', locale)}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => markResolved(a)}
                                      >
                                        <Check className="h-3 w-3 mr-1" />
                                        {t('core.lex.ok_keep_db', locale)}
                                      </Button>
                                      <Link
                                        href={`/client/factures/${a.details.facture_id}`}
                                      >
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                        >
                                          <FileText className="h-3 w-3 mr-1" />
                                          {t('core.lex.open_invoice', locale)}
                                        </Button>
                                      </Link>
                                    </>
                                  )}

                                {a.code === "DUPLICATE_INVOICE" &&
                                  Array.isArray(a.details?.facture_ids) &&
                                  a.details.facture_ids.map((fid: string, idx: number) => (
                                    <Button
                                      key={fid}
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                      disabled={!!acting}
                                      onClick={() => handleAnnuleFacture(fid, a)}
                                    >
                                      <Ban className="h-3 w-3 mr-1" />
                                      {t('core.lex.cancel_idx', locale)} #{idx + 1}
                                    </Button>
                                  ))}

                                {a.code === "MISSING_FIELDS" && a.details?.facture_id && (
                                  <Link href={`/client/factures/${a.details.facture_id}`}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                    >
                                      <FileText className="h-3 w-3 mr-1" />
                                      {t('core.lex.complete_invoice', locale)}
                                    </Button>
                                  </Link>
                                )}

                                {(a.code === "OCR_ERROR" ||
                                  a.code === "ORPHAN_OCR" ||
                                  a.code === "ORPHAN_RELEVE") &&
                                  a.document_id && (
                                    <Link href={`/client/documents`}>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        {t('core.lex.view_document', locale)}
                                      </Button>
                                    </Link>
                                  )}

                                {/* Marquer résolu — toujours dispo */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-emerald-700 hover:bg-emerald-100"
                                  onClick={() => markResolved(a)}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {t('core.lex.mark_resolved', locale)}
                                </Button>
                              </div>
                            )}

                            {isResolved && (
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => unmarkResolved(a)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  {t('core.lex.reshow', locale)}
                                </Button>
                              </div>
                            )}

                            {a.details && (
                              <details className="mt-2 text-[11px]">
                                <summary className="cursor-pointer text-muted-foreground">
                                  {t('core.lex.detail', locale)}
                                </summary>
                                <pre className="mt-1 p-2 bg-white/50 rounded font-mono overflow-x-auto">
                                  {JSON.stringify(a.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function KpiCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string
  value: number
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-green-200 bg-green-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-muted bg-card"
  return (
    <Card className={`${cls} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
