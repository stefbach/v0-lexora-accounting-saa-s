"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard, Users, UsersRound, AlertTriangle, LogOut,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { useState } from "react"

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }> }

const navItems: NavItem[] = [
  { href: "/comptable",         label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/comptable/clients", label: "Mes Clients",     icon: Users },
  { href: "/comptable/equipe",  label: "Mon Équipe",      icon: UsersRound },
  { href: "/comptable/alertes", label: "Alertes",         icon: AlertTriangle },
  { href: "/rh",                 label: "RH & Paie",       icon: Users },
  { href: "/direction",          label: "Direction",       icon: Building2 },
]

export function ComptableSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const { profile } = useProfile()
  const roleLabel = profile?.role === "comptable_dedie" ? "Comptable dédié" : "Comptable"

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside
      className={cn("sticky top-0 flex h-screen flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")}
      style={{ backgroundColor: "#1E2A4A" }}
    >
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        {!collapsed ? (
          <Link href="/comptable" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C" }}>
              <span className="text-sm font-bold text-white">L</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold" style={{ color: "#C9A84C" }}>Lexora</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">{roleLabel}</span>
            </div>
          </Link>
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C" }}>
            <span className="text-sm font-bold text-white">L</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!collapsed && (
          <div className="mb-4 rounded-lg bg-white/5 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">Portail Comptable</p>
          </div>
        )}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.href === "/comptable" ? pathname === "/comptable" : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive ? "bg-white/10 shadow-sm" : "text-white/70 hover:bg-white/5 hover:text-white",
                  collapsed && "justify-center")}
                style={isActive ? { color: "#C9A84C" } : undefined}>
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-3">
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)}
          className="mb-2 w-full justify-center text-white/70 hover:bg-white/5 hover:text-white">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">Réduire</span>}
        </Button>
        <button onClick={handleSignOut}
          className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white", collapsed && "justify-center")}>
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  )
}
