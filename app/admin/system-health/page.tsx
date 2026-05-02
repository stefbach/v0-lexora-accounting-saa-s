"use client"

/**
 * Admin System Health — /admin/system-health
 *
 * Vue KPI infrastructure (DB connect, migrations, cron freshness, table
 * counts, intégrité agrégée). Lecture seule.
 *
 * Complète /admin/health (focus comptable) en présentant un dashboard
 * "production readiness" rapide à scanner.
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Activity } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

type Status = "ok" | "warn" | "fail" | "unknown"
type Severity = "critical" | "warning" | "info"

interface Kpi {
  id: string
  label: string
  value: number | string | null
  status: Status
  severity: Severity
  hint?: string
  meta?: Record<string, unknown>
}

interface Response {
  generated_at: string
  duration_ms: number
  summary: { total: number; ok: number; warn: number; fail: number; unknown: number }
  kpis: Kpi[]
}

const NAVY = "#0B0F2E"

function statusTone(status: Status): { bg: string; border: string; text: string; icon: LucideIcon } {
  switch (status) {
    case "ok":
      return { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", icon: CheckCircle2 }
    case "warn":
      return { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", icon: AlertTriangle }
    case "fail":
      return { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: XCircle }
    default:
      return { bg: "#F1F5F9", border: "#E2E8F0", text: "#475569", icon: HelpCircle }
  }
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const tone = statusTone(kpi.status)
  const Icon = tone.icon
  return (
    <Card style={{ borderColor: tone.border, borderLeft: `4px solid ${tone.text}` }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            {kpi.label}
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-bold" style={{ color: NAVY }}>
          {kpi.value === null ? "—" : String(kpi.value)}
        </div>
        {kpi.hint && (
          <div className="text-[11px] text-gray-500 mt-1.5 leading-snug">{kpi.hint}</div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminSystemHealthPage() {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/system-health", { cache: "no-store" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as Response
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Administration", href: "/admin" }, { label: "Santé système" }]}
      kicker="Production readiness"
      title="Santé système"
      subtitle="Connectivité DB, fraicheur des crons, compteurs des tables critiques et intégrité agrégée."
      actions={
        <Button onClick={load} disabled={loading} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      }
    >
      <div className="space-y-6">
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Total</p>
              <p className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{data.summary.total}</p>
            </CardContent></Card>
            <Card style={{ borderColor: "#A7F3D0" }}><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-green-700">OK</p>
              <p className="text-2xl font-bold mt-1 text-green-700">{data.summary.ok}</p>
            </CardContent></Card>
            <Card style={{ borderColor: "#FDE68A" }}><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Warn</p>
              <p className="text-2xl font-bold mt-1 text-amber-700">{data.summary.warn}</p>
            </CardContent></Card>
            <Card style={{ borderColor: "#FECACA" }}><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Fail</p>
              <p className="text-2xl font-bold mt-1 text-red-700">{data.summary.fail}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Unknown</p>
              <p className="text-2xl font-bold mt-1 text-gray-500">{data.summary.unknown}</p>
            </CardContent></Card>
          </div>
        )}

        {data && (
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Généré le {new Date(data.generated_at).toLocaleString("fr-FR")} — {data.duration_ms} ms
          </p>
        )}

        {loading ? (
          <Card><CardContent className="py-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} />
          </CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-12 text-center">
            <XCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <p className="font-medium text-red-700">Erreur</p>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </CardContent></Card>
        ) : !data ? (
          <Card><CardContent className="py-16 text-center text-gray-400">Aucune donnée</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.kpis.map((k) => (
              <KpiCard key={k.id} kpi={k} />
            ))}
          </div>
        )}
      </div>
    </ClientPageShell>
  )
}
