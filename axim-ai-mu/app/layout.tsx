import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AXIM AI MU",
  description: "AXIM AI MU — powered by Next.js 14 + Supabase"
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  )
}
