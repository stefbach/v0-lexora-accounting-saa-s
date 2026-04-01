"use client"
import { ClientSidebarFull } from "@/components/layout/ClientSidebarFull"
import { ComptableSidebarNew } from "@/components/layout/ComptableSidebarNew"
import { useProfile } from "@/hooks/use-profile"
import { Loader2 } from "lucide-react"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  // Comptable/comptable_dedie accessing client pages: show comptable sidebar
  const isComptable = profile?.role === "comptable" || profile?.role === "comptable_dedie"

  return (
    <div className="flex min-h-screen bg-gray-50">
      {isComptable ? <ComptableSidebarNew /> : <ClientSidebarFull />}
      <main className="flex-1 overflow-auto md:ml-64">{children}</main>
    </div>
  )
}
