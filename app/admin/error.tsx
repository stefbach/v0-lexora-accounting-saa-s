'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function AdminSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      homeHref="/admin"
      title="Erreur dans l'espace admin"
    />
  )
}
