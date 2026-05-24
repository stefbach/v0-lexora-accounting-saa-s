"use client"
import { ClientSidebarFull } from "@/components/layout/ClientSidebarFull"
import { ComptableSidebarNew } from "@/components/layout/ComptableSidebarNew"
import { SocieteActiveProvider } from "@/components/client/SocieteActiveProvider"
import { CabinetBanner } from "@/components/client/CabinetBanner"
import { FloatingPageHelp } from "@/components/help/FloatingPageHelp"
import { useProfile } from "@/hooks/use-profile"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

export function ClientLayoutShell({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile()
  // Détection du mode "Acting as" via cookie côté client. On lit le cookie
  // au montage (et seulement là — il n'évolue qu'au moment d'un appel
  // explicite à l'API /api/comptable/act-as). Permet de basculer le
  // sidebar entre vue cabinet et vue client.
  const [actingAs, setActingAs] = useState<boolean | null>(null)
  useEffect(() => {
    const hasCookie = typeof document !== "undefined" &&
      document.cookie.split(";").some(c => c.trim().startsWith("lexora_acting_as_societe="))
    setActingAs(hasCookie)
  }, [])

  if (loading || actingAs === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    )
  }

  const isComptable = profile?.role === "comptable" || profile?.role === "comptable_dedie"
  // En mode "Acting as", on force le sidebar CLIENT pour offrir une
  // expérience identique au client final (demande utilisateur :
  // "il doit avoir exactement la vue comptable et rh tout du client").
  const useClientSidebar = actingAs || !isComptable

  return (
    <SocieteActiveProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-[#0B0F2E] focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
      >
        Aller au contenu principal
      </a>
      <CabinetBanner />
      <div className="flex min-h-screen bg-gray-50">
        {useClientSidebar ? <ClientSidebarFull /> : <ComptableSidebarNew />}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-auto md:ml-64 focus:outline-none"
        >
          {children}
        </main>
        <FloatingPageHelp />
      </div>
    </SocieteActiveProvider>
  )
}
