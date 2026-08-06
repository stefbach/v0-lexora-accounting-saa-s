'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  canInstallCleanly,
  chromeIntentUrl,
  detectAndroidBrowser,
  type AndroidBrowser,
} from '@/lib/pwa-browser'

/** Événement Chromium non standard, absent des types DOM. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown'

/** Variable posée par le script de <head> (voir app/layout.tsx). */
type InstallStore = { evt: BeforeInstallPromptEvent | null }

function store(): InstallStore | undefined {
  return (window as unknown as { __lexoraInstall?: InstallStore }).__lexoraInstall
}

/**
 * Tout ce que l'interface a besoin de savoir sur l'installation :
 *
 *  - `installed`   : l'application tourne déjà en mode autonome (lancée depuis
 *                    l'écran d'accueil), il n'y a donc plus rien à proposer.
 *  - `canPrompt`   : le navigateur a fourni un événement d'installation, on
 *                    peut ouvrir la boîte de dialogue native.
 *  - `platform`    : détermine quelles instructions manuelles afficher quand
 *                    l'installation automatique n'existe pas — c'est le cas de
 *                    tous les iPhone et iPad, où seul Safari peut installer,
 *                    via « Partager → Sur l'écran d'accueil ».
 *  - `blocked`     : le navigateur Android propose l'installation mais celle-ci
 *                    échoue (Samsung Internet, navigateurs intégrés). Voir
 *                    lib/pwa-browser.ts. Dans ce cas `openInChrome` porte le
 *                    lien qui rouvre la page dans Chrome.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('unknown')
  const [browser, setBrowser] = useState<AndroidBrowser>('unknown')
  const [openInChrome, setOpenInChrome] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari iOS n'implémente pas display-mode et expose ce drapeau.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)

    const ua = window.navigator.userAgent
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS se présente comme un Mac depuis la version 13 ; l'écran tactile
      // est le seul indice fiable qui reste.
      (/Macintosh/.test(ua) && 'ontouchend' in document)

    if (isIOS) setPlatform('ios')
    else if (/Android/.test(ua)) setPlatform('android')
    else setPlatform('desktop')

    const androidBrowser = detectAndroidBrowser(ua)
    setBrowser(androidBrowser)
    if (!canInstallCleanly(androidBrowser)) {
      setOpenInChrome(chromeIntentUrl(window.location.href))
    }

    // `beforeinstallprompt` se déclenche très tôt, souvent AVANT que React ne
    // soit monté : un petit script dans <head> le capture dans une variable
    // globale (window.__lexoraInstall). On la lit au montage pour ne pas rater
    // l'événement, puis on écoute aussi les suivants.
    if (store()?.evt) setDeferred(store()!.evt)

    const onBeforeInstallPrompt = (event: Event) => {
      // Sans preventDefault, Chrome affiche sa propre mini-barre et l'événement
      // n'est plus réutilisable ensuite.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }

    // Émis par le script de <head> quand il capture l'événement avant nous.
    const onInstallable = () => {
      if (store()?.evt) setDeferred(store()!.evt)
    }

    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      const s = store()
      if (s) s.evt = null
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('lexora:installable', onInstallable)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('lexora:installable', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // L'événement ne peut être consommé qu'une fois.
    setDeferred(null)
    const s = store()
    if (s) s.evt = null
    return outcome
  }, [deferred])

  return {
    installed,
    // Samsung Internet fournit bien un événement d'installation : la boîte de
    // dialogue s'ouvre, l'utilisateur accepte, et c'est le système qui refuse
    // ensuite le paquet. Mieux vaut ne jamais l'ouvrir que de le mener jusqu'à
    // un avertissement de sécurité.
    canPrompt: deferred !== null && canInstallCleanly(browser),
    platform,
    browser,
    blocked: !canInstallCleanly(browser),
    openInChrome,
    promptInstall,
  }
}
