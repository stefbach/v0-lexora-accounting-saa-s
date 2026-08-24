import * as React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type SectionCardProps = {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  /** Slot d'actions aligné à droite du header (boutons, selects, filtres). */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Classe appliquée au corps (CardContent). */
  contentClassName?: string
}

/**
 * Card titrée standard des dashboards Opérations : header (titre + sous-titre
 * + slot actions) puis contenu. Base de tous les blocs de section.
 */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  const hasHeader = title != null || subtitle != null || actions != null
  return (
    <Card className={cn('py-0 overflow-hidden', className)}>
      {hasHeader && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-5 pt-5 pb-0">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-[#0B0F2E] leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </CardHeader>
      )}
      <CardContent className={cn('p-5', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

export type ChartCardProps = SectionCardProps & {
  /** Hauteur de la zone graphique en px (défaut 260). */
  height?: number
}

/**
 * SectionCard optimisée pour un graphique recharts : réserve une zone de
 * hauteur fixe. Envelopper le `<ResponsiveContainer>` (width/height="100%")
 * directement dans les enfants.
 *
 * @example
 * <ChartCard title="Ventes par jour" height={280}>
 *   <ResponsiveContainer width="100%" height="100%">
 *     <BarChart data={data}>…</BarChart>
 *   </ResponsiveContainer>
 * </ChartCard>
 */
export function ChartCard({
  height = 260,
  children,
  contentClassName,
  ...rest
}: ChartCardProps) {
  return (
    <SectionCard {...rest} contentClassName={cn('pt-3', contentClassName)}>
      <div style={{ width: '100%', height }}>{children}</div>
    </SectionCard>
  )
}
