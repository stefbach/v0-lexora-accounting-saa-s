"use client"

/**
 * Admin Health Dashboard — /admin/health
 *
 * Fetches /api/admin/health and renders each check as a card with
 *   - severity + status badge (rouge/orange/vert)
 *   - expand/collapse to view the first 10 failing rows as JSON.
 *
 * Read-only. The API is idempotent so the Refresh button can be
 * pressed freely without side effects.
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Activity,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

type Severity = "critical" | "warning" | "info"
type Status = "pass" | "fail" | "warn"

interface HealthCheck {
  check_id: string
  description: string
  severity: Severity
  status: Status
  count: number
  details: Record<string, unknown>[]
}

interface HealthResponse {
  generated_at: string
  duration_ms: number
  summary: { total: number; pass: number; fail: number; warn: number }
  checks: HealthCheck[]
}

const NAVY = "#0B0F2E"

function severityTone(severity: Severity, status: Status, locale: Locale): {
  bg: string; border: string; text: string; label: string; icon: LucideIcon
} {
  if (status === "pass") {
    return { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", label: t('adm.health.lbl_ok', locale), icon: CheckCircle2 }
  }
  if (status === "warn") {
    return { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", label: t('adm.health.lbl_warn', locale), icon: AlertTriangle }
  }
  // status === 'fail'
  if (severity === "critical") {
    return { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", label: t('adm.health.lbl_critical', locale), icon: XCircle }
  }
  if (severity === "warning") {
    return { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412", label: t('adm.health.lbl_attention', locale), icon: AlertTriangle }
  }
  return { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", label: t('adm.health.lbl_info', locale), icon: Activity }
}

function SeverityBadge({ severity, locale }: { severity: Severity; locale: Locale }) {
  const map: Record<Severity, { bg: string; text: string; label: string }> = {
    critical: { bg: "#FEE2E2", text: "#991B1B", label: t('adm.health.sev_critical', locale) },
    warning:  { bg: "#FEF3C7", text: "#92400E", label: t('adm.health.sev_warning', locale) },
    info:     { bg: "#DBEAFE", text: "#1E40AF", label: t('adm.health.sev_info', locale) },
  }
  const m = map[severity]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: m.bg, color: m.text }}
    >
      {m.label}
    </span>
  )
}

function StatusPill({ status, label }: { status: Status; label: string }) {
  const bg = status === "pass" ? "#10B981" : status === "fail" ? "#EF4444" : "#F59E0B"
  return (
    <span
      className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
      style={{ background: bg }}
    >
      {label}
    </span>
  )
}

function CheckCard({ check, locale }: { check: HealthCheck; locale: Locale }) {
  const [open, setOpen] = useState(false)
  const tone = severityTone(check.severity, check.status, locale)
  const Icon = tone.icon
  const hasDetails = check.details && check.details.length > 0
  const expandable = check.status !== "pass" && hasDetails

  return (
    <Card
      style={{
        borderColor: tone.border,
        borderLeft: `4px solid ${tone.text}`,
        background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -20px rgba(15,23,42,0.14)",
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
              style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <code className="text-[11px] font-mono font-semibold" style={{ color: NAVY }}>
                  {check.check_id}
                </code>
                <SeverityBadge severity={check.severity} locale={locale} />
                <StatusPill status={check.status} label={tone.label} />
              </div>
              <p className="text-sm font-medium" style={{ color: NAVY }}>
                {check.description}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {check.status === "pass"
                  ? t('adm.health.no_anomaly_short', locale)
                  : `${check.count} occurrence${check.count > 1 ? "s" : ""} ${locale === 'en' ? 'detected' : 'détectée' + (check.count > 1 ? 's' : '')}`}
              </p>
            </div>
          </div>

          {expandable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen((o: boolean) => !o)}
              className="shrink-0"
            >
              {open ? (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" /> {t('adm.health.hide', locale)}
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4 mr-1" /> {t('adm.health.see', locale)} {Math.min(10, check.details.length)} {t('adm.health.cases', locale)}
                </>
              )}
            </Button>
          )}
        </div>

        {expandable && open && (
          <div className="mt-4 rounded-lg border overflow-hidden" style={{ borderColor: tone.border }}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead style={{ background: tone.bg }}>
                  <tr>
                    <th
                      className="px-3 py-2 text-left font-bold uppercase tracking-wide"
                      style={{ color: tone.text, width: "2.5rem" }}
                    >
                      #
                    </th>
                    <th
                      className="px-3 py-2 text-left font-bold uppercase tracking-wide"
                      style={{ color: tone.text }}
                    >
                      {t('adm.health.details', locale)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {check.details.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                      <td className="px-3 py-2 font-mono text-gray-400 align-top">{i + 1}</td>
                      <td className="px-3 py-2 align-top">
                        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-gray-700">
                          {JSON.stringify(row, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminHealthPage() {
  const locale = getLocale()
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as HealthResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.health.err_default', locale))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [locale])

  useEffect(() => { load() }, [load])

  const summary = data?.summary

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('adm.health.breadcrumb', locale), href: "/admin" }, { label: t('adm.health.breadcrumb_current', locale) }]}
      kicker={t('adm.health.kicker', locale)}
      title={t('adm.health.title', locale)}
      subtitle={t('adm.health.subtitle', locale)}
      actions={
        <Button
          onClick={load}
          disabled={loading}
          className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t('adm.health.refresh', locale)}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('adm.health.total', locale)}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{summary.total}</p>
              </CardContent>
            </Card>
            <Card style={{ borderColor: "#A7F3D0" }}>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-green-700">{t('adm.health.passed', locale)}</p>
                <p className="text-2xl font-bold mt-1 text-green-700">{summary.pass}</p>
              </CardContent>
            </Card>
            <Card style={{ borderColor: "#FECACA" }}>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">{t('adm.health.failed', locale)}</p>
                <p className="text-2xl font-bold mt-1 text-red-700">{summary.fail}</p>
              </CardContent>
            </Card>
            <Card style={{ borderColor: "#FDE68A" }}>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{t('adm.health.warnings', locale)}</p>
                <p className="text-2xl font-bold mt-1 text-amber-700">{summary.warn}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {data && (
          <p className="text-xs text-gray-500">
            {t('adm.health.generated_at', locale)} {new Date(data.generated_at).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} — {t('adm.health.duration', locale)} {data.duration_ms} ms
          </p>
        )}

        {/* Body */}
        {loading ? (
          <Card>
            <CardContent className="py-16 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} />
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <XCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
              <p className="font-medium text-red-700">{t('adm.health.err_load_title', locale)}</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
            </CardContent>
          </Card>
        ) : !data ? (
          <Card><CardContent className="py-16 text-center text-gray-400">{t('adm.health.no_data', locale)}</CardContent></Card>
        ) : (
          <>
            {/* Failed / warn first, then pass */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                  {t('adm.health.anomalies_detected', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {data.checks.filter((c: HealthCheck) => c.status !== "pass").length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                    <p className="font-medium text-green-700">{t('adm.health.all_ok', locale)}</p>
                    <p className="text-sm text-gray-500 mt-1">{t('adm.health.no_anomaly', locale)}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.checks
                      .filter((c: HealthCheck) => c.status !== "pass")
                      .sort((a: HealthCheck, b: HealthCheck) => {
                        const order: Record<Status, number> = { fail: 0, warn: 1, pass: 2 }
                        const s = order[a.status] - order[b.status]
                        if (s !== 0) return s
                        const sev: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
                        return sev[a.severity] - sev[b.severity]
                      })
                      .map((c: HealthCheck) => <CheckCard key={c.check_id} check={c} locale={locale} />)}
                  </div>
                )}
              </CardContent>
            </Card>

            {data.checks.some((c: HealthCheck) => c.status === "pass") && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                    {t('adm.health.checks_ok', locale)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-3">
                    {data.checks.filter((c: HealthCheck) => c.status === "pass").map((c: HealthCheck) => (
                      <CheckCard key={c.check_id} check={c} locale={locale} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
