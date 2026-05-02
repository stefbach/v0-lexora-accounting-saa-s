"use client"

/**
 * Admin Audit Trail — /admin/audit-trail
 *
 * Liste les actions critiques (paie verrouillage, clôture, reset société,
 * exports DGI, etc.) en agrégeant app_audit_log + paie_audit_log.
 *
 * Lecture seule. Filtres : source, préfixe d'action, société.
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Shield, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface AuditEntry {
  id: string
  source: "app" | "paie"
  action: string
  user_id: string | null
  user_email: string | null
  societe_id: string | null
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

interface AuditResponse {
  generated_at: string
  count: number
  entries: AuditEntry[]
}

const NAVY = "#0B0F2E"

/**
 * Map action prefix → criticité visuelle. Permet de teinter les badges sans
 * dépendre d'une colonne de plus côté DB.
 */
function actionTone(action: string): { bg: string; text: string; label: string } {
  const a = action.toLowerCase()
  if (a.startsWith("societe.reset") || a.includes(".delete") || a.includes(".purge")) {
    return { bg: "#FEE2E2", text: "#991B1B", label: "DESTRUCTIF" }
  }
  if (a.startsWith("cloture.") || a.startsWith("paie.verrouillage") || a.startsWith("paie.deverrouillage")) {
    return { bg: "#FEF3C7", text: "#92400E", label: "CLE" }
  }
  if (a.startsWith("export.") || a.startsWith("paie.export")) {
    return { bg: "#DBEAFE", text: "#1E40AF", label: "EXPORT" }
  }
  return { bg: "#F1F5F9", text: "#334155", label: "INFO" }
}

function Row({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const tone = actionTone(entry.action)
  const detailsKeys = Object.keys(entry.details || {})
  const expandable = detailsKeys.length > 0

  return (
    <div className="border-b last:border-b-0 border-gray-100">
      <div className="px-4 py-3 grid grid-cols-12 gap-3 items-start text-sm">
        <div className="col-span-12 md:col-span-3 font-mono text-xs">
          <div className="font-semibold" style={{ color: NAVY }}>
            {new Date(entry.created_at).toLocaleString("fr-FR")}
          </div>
          <div className="text-gray-500 mt-0.5">
            {entry.source === "paie" ? "paie_audit_log" : "app_audit_log"}
          </div>
        </div>
        <div className="col-span-12 md:col-span-3">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mr-2"
            style={{ background: tone.bg, color: tone.text }}
          >
            {tone.label}
          </span>
          <code className="text-xs font-mono font-semibold" style={{ color: NAVY }}>
            {entry.action}
          </code>
        </div>
        <div className="col-span-12 md:col-span-3 text-xs">
          <div className="text-gray-700">{entry.user_email || entry.user_id || "—"}</div>
          {entry.ip_address && <div className="text-gray-400 font-mono mt-0.5">{entry.ip_address}</div>}
        </div>
        <div className="col-span-12 md:col-span-2 text-xs">
          <div className="text-gray-700">{entry.target_type || "—"}</div>
          {entry.target_id && (
            <div className="text-gray-400 font-mono mt-0.5 truncate">{entry.target_id}</div>
          )}
        </div>
        <div className="col-span-12 md:col-span-1 text-right">
          {expandable && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>
      {open && expandable && (
        <div className="px-4 pb-3 -mt-1">
          <pre className="text-[11px] font-mono bg-gray-50 border rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function AdminAuditTrailPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState("")
  const [source, setSource] = useState<"all" | "app" | "paie">("all")
  const [limit, setLimit] = useState(100)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (actionFilter) params.set("action", actionFilter)
      params.set("source", source)
      params.set("limit", String(limit))
      const res = await fetch(`/api/admin/audit-trail?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as AuditResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [actionFilter, source, limit])

  useEffect(() => { load() }, [load])

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Administration", href: "/admin" }, { label: "Audit trail" }]}
      kicker="Supervision"
      title="Audit trail"
      subtitle="Trace immuable des actions critiques : clôtures, verrouillages paie, resets, exports DGI."
      actions={
        <Button onClick={load} disabled={loading} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Source
              </label>
              <div className="mt-1 flex gap-1">
                {(["all", "app", "paie"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={source === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSource(s)}
                  >
                    {s === "all" ? "Toutes" : s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Préfixe d'action (ex: cloture., paie.verrouillage)
              </label>
              <Input
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="cloture."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Limite
              </label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.min(500, Math.max(10, parseInt(e.target.value, 10) || 100)))}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}>
              <Shield className="w-4 h-4" />
              {data ? `${data.count} action${data.count > 1 ? "s" : ""}` : "Chargement…"}
            </CardTitle>
            {data && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {new Date(data.generated_at).toLocaleString("fr-FR")}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} />
              </div>
            ) : error ? (
              <div className="py-12 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                <p className="font-medium text-red-700">Erreur</p>
                <p className="text-sm text-gray-500 mt-1">{error}</p>
              </div>
            ) : !data || data.entries.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                Aucune action ne correspond aux filtres.
              </div>
            ) : (
              <div className="divide-y">
                {data.entries.map((e) => (
                  <Row key={`${e.source}:${e.id}`} entry={e} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
