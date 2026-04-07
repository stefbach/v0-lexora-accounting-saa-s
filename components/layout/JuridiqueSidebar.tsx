"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Scale, FileText, Users, ShieldCheck, Settings, LogOut } from "lucide-react"

const LINKS = [
  { href: '/juridique', label: 'Tableau de bord', icon: Scale, exact: true },
  { href: '/rh/employes', label: 'Employés (lecture)', icon: Users },
]

export function JuridiqueSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-60 bg-[#0B0F2E] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
              <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
            </div>
            <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490" }}>Module Juridique</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {LINKS.map(l => {
          const Icon = l.icon
          const active = isActive(l.href, l.exact)
          return (
            <Link key={l.href} href={l.href}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-[#D4AF37] text-[#0B0F2E] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
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
  )
}
