'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function RapprochementError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState error={error} reset={reset} homeHref="/comptable" />
}
