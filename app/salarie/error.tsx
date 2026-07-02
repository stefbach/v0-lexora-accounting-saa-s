'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function SalarieSegmentError({
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
      homeHref="/salarie"
      title="Erreur dans l'espace salarié"
    />
  )
}
