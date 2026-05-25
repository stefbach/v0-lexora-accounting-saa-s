import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Composants Skeleton standardisés pour les états de chargement Lexora.
 *
 * - SkeletonPage : structure complète d'une page (titre + KPI + contenu)
 * - SkeletonList : liste verticale d'éléments (ex: factures, employés)
 * - SkeletonCard : une carte d'aperçu (KPI, dashboard tile)
 * - SkeletonForm : formulaire (labels + inputs + boutons)
 * - SkeletonTable : tableau de données (headers + rows)
 *
 * Tous accessibles : role="status" + aria-busy + sr-only text pour
 * lecteurs d'écran (WCAG 2.1 AA).
 */

interface SkeletonProps {
  className?: string
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 sm:p-6 space-y-3',
        className,
      )}
      role="status"
      aria-busy="true"
      aria-label="Chargement en cours"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-8 w-3/5" />
      <Skeleton className="h-3 w-1/4" />
      <span className="sr-only">Chargement de la carte…</span>
    </div>
  )
}

export function SkeletonList({
  rows = 6,
  className,
}: SkeletonProps & { rows?: number }) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-busy="true"
      aria-label="Chargement de la liste"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border bg-card p-3 sm:p-4"
        >
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 hidden sm:block" />
        </div>
      ))}
      <span className="sr-only">Chargement de la liste…</span>
    </div>
  )
}

export function SkeletonTable({
  rows = 8,
  cols = 5,
  className,
}: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div
      className={cn('rounded-lg border bg-card overflow-hidden', className)}
      role="status"
      aria-busy="true"
      aria-label="Chargement du tableau"
    >
      {/* Header */}
      <div
        className="grid gap-3 border-b bg-muted/40 p-3 sm:p-4"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-3/4" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-3 p-3 sm:p-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Chargement du tableau…</span>
    </div>
  )
}

export function SkeletonForm({
  fields = 5,
  className,
}: SkeletonProps & { fields?: number }) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 sm:p-6 space-y-5 max-w-2xl',
        className,
      )}
      role="status"
      aria-busy="true"
      aria-label="Chargement du formulaire"
    >
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-1/5" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-24" />
      </div>
      <span className="sr-only">Chargement du formulaire…</span>
    </div>
  )
}

interface SkeletonPageProps extends SkeletonProps {
  /** Affiche une rangée de KPI cards en haut */
  showKpis?: boolean
  /** Nombre de KPI cards (par défaut 4) */
  kpiCount?: number
  /** Variant principal du contenu */
  variant?: 'table' | 'list' | 'form' | 'cards'
  /** Affiche un titre + sous-titre */
  showHeader?: boolean
}

export function SkeletonPage({
  className,
  showKpis = true,
  kpiCount = 4,
  variant = 'table',
  showHeader = true,
}: SkeletonPageProps) {
  return (
    <div
      className={cn('p-4 sm:p-6 space-y-6', className)}
      role="status"
      aria-busy="true"
      aria-label="Chargement de la page"
    >
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-7 w-1/3 sm:w-1/4" />
          <Skeleton className="h-4 w-2/3 sm:w-1/2" />
        </div>
      )}

      {showKpis && (
        <div
          className="grid gap-3 sm:gap-4"
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          }}
        >
          {Array.from({ length: kpiCount }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {variant === 'table' && <SkeletonTable />}
      {variant === 'list' && <SkeletonList />}
      {variant === 'form' && <SkeletonForm />}
      {variant === 'cards' && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      <span className="sr-only">Chargement de la page…</span>
    </div>
  )
}
