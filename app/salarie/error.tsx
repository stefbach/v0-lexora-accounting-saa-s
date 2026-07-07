'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/error-state'

export default function SalarieSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Reporte le crash de rendu vers le log serveur (visible Vercel). Les
  // erreurs de rendu ne déclenchent pas window.onerror ; on les envoie ici
  // depuis le boundary pour ne pas les perdre.
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        scope: 'salarie.error-boundary',
        message: error?.message || 'render error',
        stack: error?.stack || '',
        source: error?.digest ? `digest:${error.digest}` : '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      })
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-errors', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/client-errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      /* la télémétrie ne doit jamais casser la page d'erreur */
    }
  }, [error])

  return (
    <ErrorState
      error={error}
      reset={reset}
      homeHref="/salarie"
      title="Erreur dans l'espace salarié"
    />
  )
}
