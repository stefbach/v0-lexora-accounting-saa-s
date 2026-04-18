"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Health {
  has_rates: boolean
  latest_date: string | null
  currencies: string[]
  stale: boolean
  hours_since_last: number | null
}

interface Props {
  /** show inline mini badge (default) or full card with refresh button */
  compact?: boolean
  /** enable manual refresh button (requires auth) */
  allowRefresh?: boolean
}

export function FxRateStatusBadge({ compact = true, allowRefresh = false }: Props) {
  const [health, setHealth] = useState<Health | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const res = await fetch("/api/taux-change/health")
      if (res.ok) setHealth(await res.json())
    } catch {}
  }

  useEffect(() => { load() }, [])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch("/api/comptable/taux-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_from_api" }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur refresh")
      toast.success("Taux mis à jour depuis l'API")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally { setRefreshing(false) }
  }

  if (!health) return null

  if (compact) {
    if (!health.has_rates) {
      return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />FX: aucun taux</Badge>
    }
    if (health.stale) {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          FX {health.hours_since_last}h
        </Badge>
      )
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        FX à jour ({health.currencies.length} devises)
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {health.stale ? (
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      )}
      <span>
        Taux FX : <strong>{health.latest_date || "—"}</strong>
        {health.hours_since_last !== null && ` (${health.hours_since_last}h)`}
        {" — "}{health.currencies.length} devise(s)
      </span>
      {allowRefresh && (
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      )}
    </div>
  )
}
