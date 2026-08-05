'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Download, Plus, Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { useInstallPrompt, type InstallPlatform } from './use-install-prompt'

/**
 * Invitation à installer l'application, en page d'accueil.
 *
 * La bannière du bas d'écran ne suffit pas : elle se retire quand le
 * navigateur n'offre pas d'installation automatique et que l'appareil n'est
 * pas un iPhone — c'est-à-dire sur la plupart des ordinateurs, d'où Lexora est
 * précisément utilisé. Beaucoup de visiteurs ne verraient donc jamais qu'une
 * application existe.
 *
 * Cette boîte, elle, a toujours quelque chose à proposer : la boîte de
 * dialogue native lorsqu'elle existe, sinon la marche à suivre de l'appareil
 * détecté. Un refus vaut trente jours de silence.
 */
const DISMISS_KEY = 'lexora:install-dialog-dismissed-at'
const DISMISS_DAYS = 30
/** Laisser la page d'accueil se poser avant d'ouvrir quoi que ce soit. */
const DELAY_MS = 4000
/**
 * Ouvre la boîte tout de suite et oublie un refus précédent. Sert à la faire
 * revenir sans vider le stockage du navigateur : lexora.mu/?install=1
 */
const FORCE_PARAM = 'install'

const STEPS: Record<InstallPlatform, { key: string; icon: typeof Share }[]> = {
  ios: [
    { key: 'pwa.steps.ios.1', icon: Share },
    { key: 'pwa.steps.ios.2', icon: Plus },
    { key: 'pwa.steps.ios.3', icon: Check },
  ],
  android: [
    { key: 'pwa.steps.android.1', icon: Share },
    { key: 'pwa.steps.android.2', icon: Plus },
    { key: 'pwa.steps.android.3', icon: Check },
  ],
  desktop: [
    { key: 'pwa.steps.desktop.1', icon: Download },
    { key: 'pwa.steps.desktop.2', icon: Check },
  ],
  unknown: [
    { key: 'pwa.steps.unknown.1', icon: Share },
    { key: 'pwa.steps.unknown.2', icon: Plus },
  ],
}

export default function InstallDialog() {
  const [locale, setLocale] = useState<Locale>('fr')
  const { installed, canPrompt, platform, promptInstall } = useInstallPrompt()
  const [open, setOpen] = useState(false)
  const boite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocale(getLocale())
  }, [])

  useEffect(() => {
    if (installed || typeof window === 'undefined') return

    const force = new URLSearchParams(window.location.search).get(FORCE_PARAM) === '1'

    if (force) {
      try {
        window.localStorage.removeItem(DISMISS_KEY)
      } catch {
        // Sans stockage il n'y avait de toute façon rien à oublier.
      }
      setOpen(true)
      return
    }

    try {
      const refuseLe = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
      if (refuseLe && Date.now() - refuseLe < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    } catch {
      // Navigation privée : pas de mémoire, on propose quand même.
    }

    const timer = window.setTimeout(() => setOpen(true), DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [installed])

  /**
   * Fermeture sur refus : la croix, l'arrière-plan, Échap, « Plus tard ». Seule
   * celle-ci fait taire la boîte pour un mois.
   */
  const refuser = () => {
    setOpen(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Sans stockage la boîte reviendra à la prochaine visite. Acceptable.
    }
  }

  // Échap ferme, et le défilement de la page est gelé tant que la boîte est
  // ouverte — sinon l'arrière-plan bouge sous le doigt sur mobile.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') refuser()
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    // Le focus va sur la boîte, pas sur la croix : le lecteur d'écran annonce
    // la boîte, et aucun anneau de focus ne vient souligner le bouton de
    // fermeture comme s'il était l'action principale.
    boite.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  /**
   * Fermeture après une action qui va dans notre sens — installation lancée,
   * ou départ vers le guide. Ce n'est pas un refus : on referme sans rien
   * mémoriser, pour que la boîte reste disponible si l'utilisateur revient
   * sans avoir installé.
   */
  const fermerSansRefus = () => setOpen(false)

  if (installed || !open) return null

  const steps = STEPS[platform] ?? STEPS.unknown

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-dialog-titre"
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={refuser}
        className="absolute inset-0 cursor-default bg-[#0B0F2E]/50 backdrop-blur-sm"
      />

      <div
        ref={boite}
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border bg-background shadow-2xl focus:outline-none"
      >
        <button
          type="button"
          onClick={refuser}
          aria-label={t('pwa.close', locale)}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-6 pt-8 text-center sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden="true"
            width={64}
            height={64}
            className="mx-auto h-16 w-16 rounded-[18px] shadow-lg"
          />

          <h2 id="install-dialog-titre" className="mt-5 text-[19px] font-bold leading-tight sm:text-[21px]">
            {t('pwa.dialog.title', locale)}
          </h2>
          <p className="mx-auto mt-2.5 max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">
            {t('pwa.dialog.body', locale)}
          </p>

          {canPrompt ? (
            <Button
              className="mt-6 w-full py-3"
              onClick={async () => {
                const outcome = await promptInstall()
                if (outcome !== 'unavailable') fermerSansRefus()
              }}
            >
              <Download className="h-4 w-4" />
              {t('pwa.install_now', locale)}
            </Button>
          ) : (
            <>
              {/* Aucune installation automatique ici : on montre la marche à
                  suivre plutôt que de renvoyer le visiteur sans rien. */}
              <ol className="mt-6 space-y-2.5 text-left">
                {steps.map((step) => (
                  <li key={step.key} className="flex items-start gap-3 rounded-2xl bg-muted px-3.5 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                      <step.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="pt-1 text-[13px] leading-snug">{t(step.key, locale)}</span>
                  </li>
                ))}
              </ol>

              <Button asChild className="mt-5 w-full py-3">
                <Link href="/installer" onClick={fermerSansRefus}>
                  <Smartphone className="h-4 w-4" />
                  {t('pwa.see_guide', locale)}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}

          <button
            type="button"
            onClick={refuser}
            className="mt-3 w-full py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('pwa.later', locale)}
          </button>
        </div>
      </div>
    </div>
  )
}
