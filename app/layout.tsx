import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { LenisProvider } from '@/components/LenisProvider'
import { Toaster } from '@/components/ui/sonner'
import { t, getLocale } from '@/lib/i18n'
import './globals.css'

export function generateMetadata(): Metadata {
  const locale = getLocale()
  return {
    title: t('uimkt.meta.title', locale),
    description: t('uimkt.meta.description', locale),
    generator: 'v0.app',
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
    ],
      apple: '/apple-icon.png',
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <LenisProvider>{children}</LenisProvider>
        <Toaster richColors position="top-right" />
        <Analytics />
      </body>
    </html>
  )
}
