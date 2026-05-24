'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function RhSegmentError({
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
      homeHref="/rh"
      title="Erreur dans l'espace RH"
    />
  )
}
