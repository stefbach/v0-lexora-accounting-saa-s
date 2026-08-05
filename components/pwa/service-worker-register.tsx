'use client'

import { useEffect } from 'react'

/**
 * Enregistre /sw.js une fois la page chargée.
 *
 * L'enregistrement est repoussé après l'événement `load` : un service worker
 * qui s'installe pendant le premier rendu se met en concurrence avec le
 * chargement des scripts de la page et retarde l'affichage.
 *
 * Le service worker est aussi ce qui rend l'application installable :
 * sans lui, Chrome ne déclenche jamais « Installer l'application ».
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // En développement, les fichiers de /_next/ changent à chaque
    // recompilation : un cache actif y sert des morceaux périmés.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => undefined)
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Un enregistrement refusé (navigation privée, réglages d'entreprise,
        // navigateur ancien) ne doit rien casser : le site reste un site.
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
