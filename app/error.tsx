'use client'

import { ErrorState } from '@/components/ui/error-state'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState error={error} reset={reset} homeHref="/" />
}
