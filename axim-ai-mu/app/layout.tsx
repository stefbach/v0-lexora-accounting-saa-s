import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AXON AI — Chaque métier, un agent IA autonome",
  description:
    "Agents IA vocaux et intelligents pour les entreprises de Maurice et d'Afrique francophone. Déployez votre premier agent en 48 heures.",
  keywords: [
    "agent IA",
    "intelligence artificielle",
    "Maurice",
    "Mauritius",
    "vocal AI",
    "WhatsApp automation",
    "AXON AI"
  ],
  openGraph: {
    title: "AXON AI — Chaque métier, un agent IA autonome",
    description:
      "Votre entreprise ne dort plus, ne s'arrête jamais. Agents IA vocaux et textuels déployés en 48h.",
    url: "https://axon-ai.mu",
    siteName: "AXON AI",
    locale: "fr_MU",
    type: "website"
  }
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-axon-ink text-axon-txt antialiased">
        {children}
      </body>
    </html>
  )
}
