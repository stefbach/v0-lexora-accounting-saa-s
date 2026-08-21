import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatPct, hexToRgba } from './format'

/** Navy Lexora par défaut. */
const DEFAULT_COLOR = '#0B0F2E'

export type KpiTrend = {
  /** Variation en pourcentage (ex. +12.5 pour +12,5 %). */
  value: number
  /** Libellé optionnel (ex. "vs mois dernier"). */
  label?: string
  /**
   * Sens "positif" de la variation. Par défaut une hausse est verte.
   * Pour un KPI où monter est mauvais (ex. rebut, DSO), passer `invert`.
   */
  invert?: boolean
}

export type KpiCardProps = {
  label: string
  /** Valeur déjà formatée (ex. formatMUR(x)) ou nombre brut. */
  value: React.ReactNode
  icon?: LucideIcon
  /** Couleur d'accent en hex (pastille + valeur). Défaut navy. */
  color?: string
  /** Petit texte gris sous la valeur (contexte, unité, sous-total). */
  hint?: string
  /** Variation optionnelle affichée avec flèche + couleur. */
  trend?: KpiTrend
  className?: string
}

/**
 * Carte KPI générique des tableaux de bord Opérations.
 * Pastille icône colorée + label xs gris + valeur lg bold colorée + variation.
 * Généralisée depuis le `KpiCard` de app/client/tableau-de-bord/page.tsx.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  color = DEFAULT_COLOR,
  hint,
  trend,
  className,
}: KpiCardProps) {
  const trendPositive =
    trend != null && (trend.invert ? trend.value < 0 : trend.value > 0)
  const trendNegative =
    trend != null && (trend.invert ? trend.value > 0 : trend.value < 0)
  const trendColor = trendPositive
    ? '#0F766E'
    : trendNegative
      ? '#9F1239'
      : '#64748B'
  const TrendIcon = trend == null || trend.value === 0
    ? null
    : trend.value > 0
      ? ArrowUpRight
      : ArrowDownRight

  return (
    <Card className={cn('py-0 h-full', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          {Icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: hexToRgba(color, 0.1) }}
              aria-hidden="true"
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          )}
          {trend != null && (
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ color: trendColor, backgroundColor: hexToRgba(trendColor, 0.08) }}
              title={trend.label}
            >
              {TrendIcon && <TrendIcon className="w-3 h-3" aria-hidden="true" />}
              {formatPct(trend.value, 1, true)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">{label}</p>
        <p
          className="text-lg font-bold mt-0.5 tabular-nums leading-tight"
          style={{ color }}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  )
}

const LG_COLS: Record<3 | 4 | 6, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-6',
}

export type KpiGridProps = {
  children: React.ReactNode
  /** Nombre de colonnes en desktop (lg). Défaut 4. */
  cols?: 3 | 4 | 6
  className?: string
}

/**
 * Grille responsive de cartes KPI :
 * 2 colonnes (mobile) → 3 (sm) → `cols` (lg, défaut 4).
 */
export function KpiGrid({ children, cols = 4, className }: KpiGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 gap-3',
        LG_COLS[cols],
        className,
      )}
    >
      {children}
    </div>
  )
}
