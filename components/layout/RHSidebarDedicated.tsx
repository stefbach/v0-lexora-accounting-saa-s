"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Clock, Users, Calendar, CreditCard, TrendingUp, FileText, Banknote, Gavel, Receipt, Settings, LogOut, ArrowLeft, Menu, X } from "lucide-react"

const LINKS = [
  { href: '/rh', label: 'Tableau de bord', icon: Clock, exact: true },
  { href: '/rh/employes', label: 'Employés', icon: Users },
  { href: '/rh/pointage', label: 'Pointage', icon: Clock },
  { href: '/rh/conges', label: 'Absences & Congés', icon: Calendar },
  { href: '/rh/paie', label: 'Paie & Bulletins', icon: CreditCard },
  { href: '/rh/paie/primes', label: 'Primes & OT', icon: TrendingUp },
  { href: '/rh/paie/exports-mra', label: 'Exports MRA', icon: FileText },
  { href: '/rh/exports/virement', label: 'Virements bancaires', icon: Banknote },
  { href: '/rh/paie/parametres', label: 'Paramètres paie', icon: Settings },
]

export function RHSidebarDedicated() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-50 md:hidden bg-[#1E2A4A] text-white p-2 rounded-lg shadow-lg">
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />}

    <aside className={`w-60 bg-[#1E2A4A] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Mobile close button */}
      <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
        <X className="w-5 h-5" />
      </button>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#C9A84C] rounded-lg flex items-center justify-center">
            <span className="text-[#1E2A4A] font-black text-sm">L</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">LEXORA</p>
            <p className="text-white/40 text-xs">Module RH & Paie</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Retour à l'espace principal */}
        <Link href="/client/tableau-de-bord"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#C9A84C] hover:bg-[#C9A84C]/20 text-sm transition-colors mb-3 border border-[#C9A84C]/30">
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          <span>Retour espace client</span>
        </Link>
        <div className="border-b border-white/10 mb-2" />
        {LINKS.map(l => {
          const Icon = l.icon
          const active = isActive(l.href, l.exact)
          return (
            <Link key={l.href} href={l.href}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-[#C9A84C] text-[#1E2A4A] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{l.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-1">
        <Link href="/profil" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors">
          <Settings className="w-4 h-4" /><span>Mon profil</span>
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors">
          <LogOut className="w-4 h-4" /><span>Déconnexion</span>
        </button>
      </div>
    </aside>
    </>
  )
}
