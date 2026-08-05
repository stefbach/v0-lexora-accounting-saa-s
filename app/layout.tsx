import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { LenisProvider } from '@/components/LenisProvider'
import { Toaster } from '@/components/ui/sonner'
import ServiceWorkerRegister from '@/components/pwa/service-worker-register'
import InstallBanner from '@/components/pwa/install-banner'
import { t, getLocale } from '@/lib/i18n'
import { THEME_COLOR } from '@/lib/pwa-spaces'
import './globals.css'

export function generateMetadata(): Metadata {
  const locale = getLocale()
  return {
    title: t('uimkt.meta.title', locale),
    description: t('uimkt.meta.description', locale),
    generator: 'v0.app',
    // Rend le site installable : c'est ce lien qui déclenche « Installer
    // l'application » sur Android et sur les navigateurs Chromium de bureau.
    //
    // Le manifeste est un fichier statique de /public et non une route
    // app/manifest.ts : la route de fichier s'impose à toute l'application et
    // empêcherait les espaces (comptable, RH, salarié…) de servir le leur —
    // ils s'installeraient tous sous l'identité de l'application publique.
    manifest: '/manifest.webmanifest',
    applicationName: 'Lexora',
    appleWebApp: {
      // iOS n'utilise pas le manifeste : sans ces méta-données, l'icône ajoutée
      // à l'écran d'accueil rouvre une simple fenêtre Safari avec sa barre.
      capable: true,
      title: 'Lexora',
      // « default » et non « black-translucent » : ce dernier fait dessiner la
      // page SOUS la barre d'état, et rien dans globals.css ne compense les
      // marges de sécurité (env(safe-area-inset-*)).
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        {
          url: '/icon-light-32x32.png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/icon-dark-32x32.png',
          media: '(prefers-color-scheme: dark)',
        },
        {
          url: '/icon.svg',
          type: 'image/svg+xml',
        },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  }
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <head>
        {/* Capture de l'événement d'installation le plus tôt possible. Chrome
            émet `beforeinstallprompt` avant l'hydratation de React ; sans cette
            capture précoce, la bannière et la boîte de dialogue ratent
            l'événement et ne peuvent plus proposer « Installer ». */}
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`
            (function () {
              window.__lexoraInstall = window.__lexoraInstall || { evt: null };
              window.addEventListener('beforeinstallprompt', function (e) {
                e.preventDefault();
                window.__lexoraInstall.evt = e;
                window.dispatchEvent(new Event('lexora:installable'));
              });
              window.addEventListener('appinstalled', function () {
                window.__lexoraInstall.evt = null;
              });
            })();
          `}
        </Script>
      </head>
      <body className="font-sans antialiased">
        <LenisProvider>{children}</LenisProvider>
        <Toaster richColors position="top-right" />
        <InstallBanner />
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  )
}
