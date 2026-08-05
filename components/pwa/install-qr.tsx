'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, QrCode, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { t, getLocale, type Locale } from '@/lib/i18n'

/**
 * Passerelle ordinateur → téléphone.
 *
 * L'installation sur mobile doit se faire depuis le mobile : un utilisateur
 * assis devant son ordinateur n'a aucun moyen simple d'y arriver, à part se
 * retaper l'adresse sur son téléphone. Le QR code supprime cette étape.
 *
 * Le code est généré dans le navigateur à partir de l'origine réellement
 * servie : en préproduction il renvoie vers la préproduction, en production
 * vers le site public. Rien n'est codé en dur, rien ne peut se désynchroniser.
 */
export default function InstallQr({ path = '/installer' }: { path?: string }) {
  const [locale, setLocale] = useState<Locale>('fr')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLocale(getLocale())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(path, window.location.origin)
    url.searchParams.set('source', 'qr')
    const href = url.toString()
    setTarget(href)

    let cancelled = false
    QRCode.toDataURL(href, {
      // Correction haute : le pictogramme posé au centre masque une partie des
      // modules, il faut de quoi les reconstruire.
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 640,
      margin: 1,
      color: { dark: '#0B0F2EFF', light: '#FFFFFFFF' },
    })
      .then((result) => {
        if (!cancelled) setDataUrl(result)
      })
      .catch(() => {
        // Sans QR code, le lien affiché en dessous suffit.
      })

    return () => {
      cancelled = true
    }
  }, [path])

  const copy = async () => {
    if (!target) return
    try {
      await navigator.clipboard.writeText(target)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le lien
      // reste sélectionnable à la main juste au-dessus du bouton.
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card p-6 text-center sm:flex-row sm:p-8 sm:text-left">
      <div className="relative flex h-[168px] w-[168px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white p-2 shadow-sm">
        {dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt={t('pwa.qr.alt', locale)} className="h-full w-full" />
            {/* Pictogramme au centre : rend le code identifiable d'un coup
                d'œil sans gêner la lecture grâce à la correction haute. */}
            <span className="pointer-events-none absolute flex h-11 w-11 items-center justify-center rounded-xl border-[3px] border-white bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" aria-hidden="true" className="h-full w-full rounded-lg" />
            </span>
          </>
        ) : (
          <QrCode className="h-12 w-12 animate-pulse text-muted-foreground/30" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Smartphone className="h-3.5 w-3.5" />
          {t('pwa.qr.title', locale)}
        </span>

        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {t('pwa.qr.body', locale)}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl border bg-muted px-3 py-2 text-left text-[12px] text-muted-foreground">
            {target || '…'}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={!target}
            className="shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('pwa.qr.copied', locale) : t('pwa.qr.copy', locale)}
          </Button>
        </div>
      </div>
    </div>
  )
}
