import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type OpsEmptyProps = {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  /** CTA optionnel (bouton, lien) rendu sous la description. */
  action?: React.ReactNode
  className?: string
}

/**
 * État vide soigné pour les dashboards Opérations (jamais un tableau blanc).
 * Icône en pastille + titre + description + CTA optionnel.
 */
export function OpsEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: OpsEmptyProps) {
  return (
    <Empty className={cn('border', className)}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export type OpsSkeletonProps = {
  /** Nombre de cartes KPI simulées (défaut 4). */
  kpis?: number
  /** Afficher un bloc graphique sous les KPI (défaut true). */
  chart?: boolean
  /** Nombre de lignes de tableau simulées sous le chart (défaut 0). */
  rows?: number
  className?: string
}

/**
 * Skeleton de chargement d'un dashboard Opérations : rangée de KPI + bloc
 * graphique (+ lignes de tableau optionnelles). Remplace tout spinner centré.
 */
export function OpsSkeleton({
  kpis = 4,
  chart = true,
  rows = 0,
  className,
}: OpsSkeletonProps) {
  return (
    <div
      className={cn('space-y-4', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Chargement en cours…</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: kpis }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-4">
              <Skeleton className="w-8 h-8 rounded-lg mb-3" />
              <Skeleton className="h-3 w-2/3 mb-2" />
              <Skeleton className="h-6 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      {chart && (
        <Card className="py-0">
          <CardContent className="p-5">
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </CardContent>
        </Card>
      )}
      {rows > 0 && (
        <Card className="py-0">
          <CardContent className="p-5 space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
