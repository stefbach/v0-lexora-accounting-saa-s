'use client'

import * as React from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertsPanel, type AlertItem } from './alerts'
import { OpsEmpty } from './states'
import type { Severity } from './format'

/** Modules Opérations exposant des insights IA. */
export type OperationsModule = 'inventaire' | 'pos' | 'production' | 'jobs'

/** Forme d'un insight renvoyé par /api/client/operations/insights. */
export type OperationsInsight = {
  severity: Severity
  title: string
  detail?: string
  recommendation?: string
}

export type OperationsInsightsProps = {
  module: OperationsModule
  societeId: string | null
  /** Données agrégées du module (bornées côté serveur). */
  payload: Record<string, unknown>
  /** Libellé du bouton de déclenchement. */
  label?: string
  className?: string
}

/**
 * Bloc d'insights IA "à la demande" pour les dashboards Opérations.
 *
 * ⚠️ N'appelle PAS l'IA au chargement (pour ne pas ralentir la page) : l'appel
 * ne part qu'au clic sur "Analyser avec l'IA". Rend ensuite les cartes via
 * AlertsPanel. Gère loading / erreur / vide proprement.
 */
export function OperationsInsights({
  module,
  societeId,
  payload,
  label = 'Analyser avec l’IA',
  className,
}: OperationsInsightsProps) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [insights, setInsights] = React.useState<OperationsInsight[] | null>(null)

  const analyze = React.useCallback(async () => {
    if (!societeId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/client/operations/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, societe_id: societeId, payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Analyse indisponible pour le moment.')
        setInsights(null)
        return
      }
      const list: OperationsInsight[] = Array.isArray(data?.insights)
        ? data.insights
        : []
      setInsights(list)
      if (data?.error) setError(data.error)
    } catch {
      setError('Erreur réseau — impossible de contacter l’assistant.')
      setInsights(null)
    } finally {
      setLoading(false)
    }
  }, [module, societeId, payload, loading])

  const items: AlertItem[] = (insights ?? []).map((ins) => ({
    severity: ins.severity,
    title: ins.title,
    detail: ins.detail,
    recommendation: ins.recommendation,
  }))

  const hasRun = insights !== null

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(212,175,55,0.12)' }}
            aria-hidden="true"
          >
            <Sparkles className="w-4 h-4 text-[#A88925]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0B0F2E] leading-tight">
              Analyse IA
            </p>
            <p className="text-[11px] text-gray-500">
              Recommandations générées à la demande
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={hasRun ? 'outline' : 'default'}
          onClick={analyze}
          disabled={loading || !societeId}
          aria-label={label}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Analyse…
            </>
          ) : hasRun ? (
            <>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Relancer
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {label}
            </>
          )}
        </Button>
      </div>

      {error && (
        <p
          className="text-xs text-[#9F1239] bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-lg px-3 py-2 mb-2"
          role="alert"
        >
          {error}
        </p>
      )}

      {hasRun && !error && items.length === 0 && (
        <OpsEmpty
          icon={Sparkles}
          title="Aucun signal notable"
          description="L’IA n’a pas détecté d’anomalie ou d’opportunité prioritaire sur ces données."
        />
      )}

      {items.length > 0 && <AlertsPanel items={items} />}
    </div>
  )
}
