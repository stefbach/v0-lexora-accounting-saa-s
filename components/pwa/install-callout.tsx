'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Download, Laptop, Smartphone, Tablet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { useInstallPrompt } from './use-install-prompt'

/**
 * Encart « installez l'application » posé sur les pages publiques.
 *
 * Il fait deux choses selon ce que le navigateur permet : soit il ouvre
 * directement la boîte de dialogue d'installation, soit il renvoie vers
 * /installer, où la marche à suivre est détaillée appareil par appareil. Il
 * disparaît entièrement quand l'application est déjà installée : proposer
 * d'installer ce qui l'est déjà décrédibilise le reste de la page.
 */
export default function InstallCallout() {
  const [locale, setLocale] = useState<Locale>('fr')
  const { installed, canPrompt, promptInstall } = useInstallPrompt()

  useEffect(() => {
    setLocale(getLocale())
  }, [])

  if (installed) return null

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-[#0B0F2E] px-6 py-10 text-white md:px-12 md:py-12">
      <div className="relative z-10 flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
        <div className="max-w-xl text-center lg:text-left">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
            {t('pwa.callout.eyebrow', locale)}
          </span>
          <h2 className="mt-4 text-[22px] font-bold leading-tight text-white md:text-[28px]">
            {t('pwa.callout.title', locale)}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-white/70 md:text-[15px]">
            {t('pwa.callout.body', locale)}
          </p>

          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
            <li className="flex items-center gap-1.5 text-[12.5px] text-white/60">
              <Smartphone className="h-3.5 w-3.5 text-[#4191FF]" />
              {t('pwa.callout.phones', locale)}
            </li>
            <li className="flex items-center gap-1.5 text-[12.5px] text-white/60">
              <Tablet className="h-3.5 w-3.5 text-[#4191FF]" />
              {t('pwa.callout.tablets', locale)}
            </li>
            <li className="flex items-center gap-1.5 text-[12.5px] text-white/60">
              <Laptop className="h-3.5 w-3.5 text-[#4191FF]" />
              {t('pwa.callout.desktop', locale)}
            </li>
          </ul>
        </div>

        <div className="flex w-full flex-col items-center gap-3 sm:w-auto">
          {canPrompt && (
            <Button size="lg" className="w-full sm:w-auto" onClick={() => promptInstall()}>
              <Download className="h-4 w-4" />
              {t('pwa.install', locale)}
            </Button>
          )}
          {canPrompt ? (
            <Link
              href="/installer"
              className="text-[13.5px] font-medium text-white/70 transition-colors hover:text-white"
            >
              {t('pwa.see_guide', locale)}
            </Link>
          ) : (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/installer">
                {t('pwa.how_to_install', locale)}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
