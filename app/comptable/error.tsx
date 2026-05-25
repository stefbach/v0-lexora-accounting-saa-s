'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function ComptableSegmentError({
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
      homeHref="/comptable"
      title="Erreur dans l'espace comptable"
    />
  )
}
