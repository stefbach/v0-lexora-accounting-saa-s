"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LogOut } from "lucide-react"
import Link from "next/link"

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-[#1E2A4A] text-white px-6 py-3 flex items-center justify-between">
        <Link href="/client/assistant" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C9A84C] rounded-lg flex items-center justify-center">
            <span className="text-[#1E2A4A] font-black text-sm">L</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base">LEXORA</span>
            <span className="text-white/40 text-sm hidden sm:inline">|</span>
            <span className="text-white/60 text-sm hidden sm:inline">
              Espace Assistant
            </span>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Deconnexion</span>
        </button>
      </header>

      {/* Content */}
      <main>{children}</main>
    </div>
  )
}
