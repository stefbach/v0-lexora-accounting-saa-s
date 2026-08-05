'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { useInstallPrompt } from './use-install-prompt'

const DISMISS_KEY = 'lexora:install-dismissed-at'
/** Un refus vaut un mois de silence. */
const DISMISS_DAYS = 30
/** On laisse la page s'installer avant de solliciter l'utilisateur. */
const DELAY_MS = 8000

/**
 * Parcours où une bannière n'a rien à faire : authentification, signature de
 * contrat, onboarding, et la page d'installation elle-même.
 *
 * Les espaces applicatifs (/comptable, /rh, /client…) ne sont volontairement
 * PAS exclus : c'est là que l'installation a le plus de valeur, et c'est de
 * ces pages que le navigateur retient le bon manifeste — installer depuis
 * /comptable donne « Lexora Comptable » et non l'application publique.
 */
const MUTED_PREFIXES = [
  '/auth',
  '/login',
  // Prise de rendez-vous : c'est le tunnel de conversion du site public,
  // rien ne doit venir s'intercaler entre le choix du créneau et la
  // confirmation.
  '/rdv',
  '/onboarding',
  '/signer-contrat',
  '/installer',
]

/**
 * Bannière discrète, ancrée en bas d'écran.
 *
 * Elle ne s'affiche que lorsqu'elle a réellement quelque chose à proposer :
 * une boîte de dialogue native, ou — sur iPhone et iPad, où l'installation
 * automatique n'existe pas — le renvoi vers le guide. Sur un navigateur de
 * bureau sans installation automatique, elle se retire : l'encart de la page
 * d'accueil et /installer prennent le relais.
 */
export default function InstallBanner() {
  const [locale, setLocale] = useState<Locale>('fr')
  const pathname = usePathname()
  const { installed, canPrompt, platform, promptInstall } = useInstallPrompt()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setLocale(getLocale())
  }, [])

  useEffect(() => {
    if (installed) return
    if (typeof window === 'undefined') return

    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    } catch {
      // Stockage indisponible (navigation privée) : on affiche, sans mémoire.
    }

    const timer = window.setTimeout(() => setVisible(true), DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [installed])

  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Sans stockage, la bannière reviendra à la prochaine visite. Acceptable.
    }
  }

  if (installed || !visible) return null
  if (pathname && MUTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  // Sur iOS aucune boîte de dialogue d'installation n'existe : le seul chemin
  // est le menu Partager de Safari, expliqué sur la page dédiée.
  const manualOnly = !canPrompt
  if (manualOnly && platform !== 'ios') return null

  return (
    <div
      role="complementary"
      aria-label={t('pwa.banner.aria', locale)}
      className="fixed inset-x-4 bottom-4 z-40 md:left-6 md:right-auto md:max-w-sm"
    >
      <div className="flex items-center gap-3 rounded-2xl border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur sm:p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-11 sm:w-11">
          {manualOnly ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight sm:text-[13.5px]">
            <span className="sm:hidden">{t('pwa.install', locale)}</span>
            <span className="hidden sm:inline">{t('pwa.banner.title', locale)}</span>
          </p>
          <p className="mt-0.5 hidden text-[11.5px] leading-snug text-muted-foreground sm:block">
            {t('pwa.banner.subtitle', locale)}
          </p>
        </div>

        {manualOnly ? (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/installer" onClick={dismiss}>
              {t('pwa.how', locale)}
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            onClick={async () => {
              const outcome = await promptInstall()
              if (outcome !== 'unavailable') dismiss()
            }}
          >
            {t('pwa.install_short', locale)}
          </Button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label={t('pwa.dismiss', locale)}
          className="-mr-1 flex shrink-0 items-center justify-center self-center rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
