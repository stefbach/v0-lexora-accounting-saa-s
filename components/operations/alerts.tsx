import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Info, CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { severityColor, severityRank, type Severity } from './format'

export type AlertItem = {
  severity: Severity
  title: string
  detail?: React.ReactNode
  /** Recommandation actionnable (mise en avant sous le détail). */
  recommendation?: React.ReactNode
  /** Lien du CTA. Si absent mais `onAction` fourni → bouton. */
  href?: string
  /** Libellé du CTA. */
  cta?: string
  /** Handler du CTA (alternatif à href). */
  onAction?: () => void
}

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

function AlertRow({ item }: { item: AlertItem }) {
  const palette = severityColor(item.severity)
  const Icon = SEVERITY_ICON[item.severity] ?? Info
  return (
    <div
      className="rounded-lg border bg-white p-3 pl-4"
      style={{ borderLeft: `3px solid ${palette.border}`, backgroundColor: palette.bg }}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className="w-4 h-4 mt-0.5 shrink-0"
          style={{ color: palette.hex }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0B0F2E] leading-snug">
            {item.title}
          </p>
          {item.detail && (
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.detail}</p>
          )}
          {item.recommendation && (
            <p
              className="text-xs mt-1.5 font-medium leading-relaxed"
              style={{ color: palette.hex }}
            >
              {item.recommendation}
            </p>
          )}
          {(item.href || item.onAction) && item.cta && (
            item.href ? (
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline"
                style={{ color: palette.hex }}
              >
                {item.cta}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={item.onAction}
                className="inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline"
                style={{ color: palette.hex }}
              >
                {item.cta}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

export type AlertsPanelProps = {
  items: AlertItem[]
  className?: string
  /** Rendu quand la liste est vide (sinon rien n'est affiché). */
  emptyState?: React.ReactNode
}

/**
 * Liste d'alertes/insights triée par sévérité (danger → success), chaque
 * entrée en card à bordure gauche colorée + CTA optionnel. Façon bloc
 * "Alertes & Rappels" du tableau de bord.
 */
export function AlertsPanel({ items, className, emptyState }: AlertsPanelProps) {
  if (!items || items.length === 0) {
    return emptyState ? <>{emptyState}</> : null
  }
  const sorted = [...items].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  )
  return (
    <div className={cn('space-y-2', className)} role="list">
      {sorted.map((item, i) => (
        <div role="listitem" key={i}>
          <AlertRow item={item} />
        </div>
      ))}
    </div>
  )
}
