'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  /** Error captured by the Next.js error boundary (or any other source). */
  error?: Error & { digest?: string }
  /** Reset callback provided by the Next.js error boundary. */
  reset?: () => void
  /** Optional custom title. */
  title?: string
  /** Optional custom user-friendly description. */
  description?: string
  /** Optional URL for the "Retour au tableau de bord" button. Defaults to `/`. */
  homeHref?: string
  /** Optional className for the wrapper. */
  className?: string
}

/**
 * Reusable error state component used by all Next.js segment error.tsx files
 * and anywhere a recoverable error needs to be displayed.
 */
export function ErrorState({
  error,
  reset,
  title = 'Une erreur est survenue',
  description,
  homeHref = '/',
  className,
}: ErrorStateProps) {
  // Log the error in dev for easier debugging.
  useEffect(() => {
    if (error && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[ErrorState]', error)
    }
  }, [error])

  const friendly =
    description ??
    "Quelque chose s'est mal passé pendant le chargement de cette page. " +
      'Vous pouvez réessayer ou revenir au tableau de bord.'

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center',
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-7" aria-hidden="true" />
      </div>

      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{friendly}</p>
        {error?.digest && (
          <p className="text-xs text-muted-foreground/70">
            Référence&nbsp;: <code>{error.digest}</code>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <Button onClick={() => reset()} className="gap-2">
            <RefreshCw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        )}
        <Button asChild variant="outline" className="gap-2">
          <Link href={homeHref}>
            <Home className="size-4" aria-hidden="true" />
            Retour au tableau de bord
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default ErrorState
