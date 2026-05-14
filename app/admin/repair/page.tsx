"use client"

/**
 * Admin Repair Dashboard — /admin/repair
 *
 * UI pour appliquer les 6 actions de réparation codifiées à partir des
 * fixes SQL manuels. Dry-run par défaut : rien ne modifie la base tant
 * que l'utilisateur n'a pas cliqué "Appliquer".
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Play, AlertTriangle, CheckCircle2, XCircle, Wrench } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

interface Action {
  id: string
  label: string
  severity: "safe" | "destructive"
}

interface RepairResult {
  action: string
  status: "pass" | "fail" | "skipped"
  affected: number
  message: string
  details?: unknown[]
}

interface RepairResponse {
  societe_id: string
  dry_run: boolean
  duration_ms: number
  results: RepairResult[]
}

const NAVY = "#0B0F2E"

export default function AdminRepairPage() {
  const locale = getLocale()
  const [actions, setActions] = useState<Action[]>([])
  const [societeId, setSocieteId] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RepairResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load actions list
  useEffect(() => {
    fetch("/api/admin/repair")
      .then(r => r.json())
      .then(d => setActions(d.actions || []))
      .catch(() => setError(t('adm.repair.cannot_load', locale)))
  }, [])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(actions.map(a => a.id)))
  const clearAll = () => setSelected(new Set())

  const run = useCallback(async (dryRun: boolean) => {
    if (!societeId || selected.size === 0) return
    if (!dryRun && !confirm(
      `${t('adm.repair.confirm_prefix', locale)} ${selected.size} ${t('adm.repair.confirm_actions', locale)} ${societeId} ?\n\n` +
      `${t('adm.repair.confirm_warn', locale)}`
    )) return

    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch("/api/admin/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          actions: Array.from(selected),
          dry_run: dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.repair.network_err', locale))
    } finally {
      setLoading(false)
    }
  }, [societeId, selected])

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('adm.repair.breadcrumb', locale), href: "/admin" }, { label: t('adm.repair.breadcrumb_current', locale) }]}
      kicker={t('adm.repair.kicker', locale)}
      title={t('adm.repair.title', locale)}
      subtitle={t('adm.repair.subtitle', locale)}
    >
      <div className="space-y-4">
        {/* Société selector */}
        <Card>
          <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('adm.repair.target', locale)}</CardTitle></CardHeader>
          <CardContent>
            <Label htmlFor="societe-id" className="text-xs">{t('adm.repair.uuid', locale)}</Label>
            <Input
              id="societe-id"
              placeholder="ex: 1826dde7-7b41-4d14-bc75-d8d22dfc75fb"
              value={societeId}
              onChange={e => setSocieteId(e.target.value)}
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              {t('adm.repair.uuid_hint', locale)} <code className="bg-gray-100 px-1 rounded">SELECT id FROM societes WHERE nom ILIKE &apos;%...%&apos;</code>
            </p>
          </CardContent>
        </Card>

        {/* Actions picker */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[#0B0F2E] text-base">
              {t('adm.repair.actions_label', locale)} ({selected.size}/{actions.length} {t('adm.repair.selected', locale)})
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>{t('adm.repair.all', locale)}</Button>
              <Button variant="outline" size="sm" onClick={clearAll}>{t('adm.repair.none', locale)}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {actions.map(a => (
              <label key={a.id} className="flex items-start gap-3 p-3 rounded border hover:bg-gray-50 cursor-pointer">
                <Checkbox
                  checked={selected.has(a.id)}
                  onCheckedChange={() => toggle(a.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: NAVY }}>{a.label}</span>
                    <Badge variant={a.severity === "destructive" ? "destructive" : "secondary"} className="text-[10px]">
                      {a.severity === "destructive" ? t('adm.repair.destructive', locale) : t('adm.repair.safe', locale)}
                    </Badge>
                  </div>
                  <code className="text-[10px] text-gray-400 font-mono">{a.id}</code>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => run(true)}
            disabled={!societeId || selected.size === 0 || loading}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {t('adm.repair.dry_run', locale)}
          </Button>
          <Button
            onClick={() => run(false)}
            disabled={!societeId || selected.size === 0 || loading}
            variant="destructive"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
            {t('adm.repair.apply', locale)}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div>
                <p className="font-semibold text-red-800">{t('adm.repair.error', locale)}</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
                {t('adm.repair.results', locale)} {result.dry_run && <Badge variant="secondary">DRY-RUN</Badge>}
                <span className="ml-auto text-xs font-normal text-gray-500">
                  {result.duration_ms} ms
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.results.map((r, i) => {
                const isFail = r.status === "fail"
                const Icon = isFail ? XCircle : r.status === "pass" ? CheckCircle2 : AlertTriangle
                const color = isFail ? "text-red-600" : r.status === "pass" ? "text-green-600" : "text-amber-600"
                return (
                  <div key={i} className="p-3 rounded border">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-[11px] font-mono font-semibold" style={{ color: NAVY }}>
                            {r.action}
                          </code>
                          <Badge variant={isFail ? "destructive" : "secondary"} className="text-[10px]">
                            {r.status.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {r.affected} {t('adm.repair.affected', locale)}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{r.message}</p>
                        {r.details && Array.isArray(r.details) && r.details.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 cursor-pointer">
                              {t('adm.repair.view_details', locale)} ({r.details.length})
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-50 rounded text-[10px] font-mono overflow-x-auto">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}
