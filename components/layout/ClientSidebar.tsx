"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard, FileText, LogOut, ChevronLeft, ChevronRight,
  DollarSign, Landmark, Calculator, Users as UsersIcon, Bell,
  Settings, Lightbulb, Building2, Calendar, Wallet,
} from "lucide-react"
import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
interface NavSection { label: string | null; items: NavItem[] }

const adminSocieteNav: NavSection[] = [
  { label: "Mon Espace", items: [
    { href: "/client", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/client/documents", label: "Mes Documents", icon: FileText },
    { href: "/client/societes", label: "Mes Sociétés", icon: Building2 },
  ]},
  { label: "Mes Finances", items: [
    { href: "/client/finances", label: "Mes Chiffres", icon: DollarSign },
    { href: "/client/tresorerie", label: "Trésorerie", icon: Landmark },
    { href: "/client/tva", label: "Ma TVA", icon: Calculator },
    { href: "/client/salaires", label: "Salaires & Charges", icon: Wallet },
    { href: "/client/conseils", label: "Conseils", icon: Lightbulb },
  ]},
  { label: "Mon Compte", items: [
    { href: "/client/equipe", label: "Mon Équipe", icon: UsersIcon },
    { href: "/client/alertes", label: "Mes Alertes", icon: Bell },
    { href: "/client/profil", label: "Mon Profil", icon: Settings },
  ]},
]

const adminFreelanceNav: NavSection[] = [
  { label: "Mon Espace", items: [
    { href: "/client", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/client/documents", label: "Mes Documents", icon: FileText },
  ]},
  { label: "Mes Finances", items: [
    { href: "/client/revenus-depenses", label: "Mes Revenus & Dépenses", icon: DollarSign },
    { href: "/client/tresorerie", label: "Trésorerie", icon: Landmark },
    { href: "/client/fiscal-freelance", label: "Mes Obligations Fiscales", icon: Calendar },
    { href: "/client/conseils", label: "Conseils", icon: Lightbulb },
  ]},
  { label: "Mon Compte", items: [
    { href: "/client/alertes", label: "Mes Alertes", icon: Bell },
    { href: "/client/profil", label: "Mon Profil", icon: Settings },
  ]},
]

const userNav: NavSection[] = [
  { label: null, items: [
    { href: "/client/documents", label: "Mes Documents", icon: FileText },
    { href: "/client/profil", label: "Mon Profil", icon: Settings },
  ]},
]

export function ClientSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const { profile } = useProfile()

  const role = profile?.role || "client_admin"
  const category = (profile as Record<string, unknown>)?.client_category as string | undefined
  const isUser = role === "client_user"
  const isFreelance = category === "individuel"

  let navSections: NavSection[]
  let roleLabel: string

  if (isUser) { navSections = userNav; roleLabel = "Utilisateur" }
  else if (isFreelance) { navSections = adminFreelanceNav; roleLabel = "Freelance" }
  else { navSections = adminSocieteNav; roleLabel = "Admin" }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside className={cn("sticky top-0 flex h-screen flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")} style={{ backgroundColor: "#1E2A4A" }}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        {!collapsed ? (
          <Link href="/client" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C" }}><span className="text-sm font-bold text-white">L</span></div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold" style={{ color: "#C9A84C" }}>Lexora</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">{roleLabel}</span>
            </div>
          </Link>
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C" }}><span className="text-sm font-bold text-white">L</span></div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <nav className="flex flex-col gap-1">
          {navSections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.label && !collapsed && (
                <p className="mt-4 mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">{section.label}</p>
              )}
              {section.label && collapsed && <div className="my-2 mx-3 border-t border-white/10" />}
              {section.items.map((item) => {
                const isActive = item.href === "/client" ? pathname === "/client" : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      isActive ? "bg-white/10 shadow-sm" : "text-white/70 hover:bg-white/5 hover:text-white", collapsed && "justify-center")}
                    style={isActive ? { color: "#C9A84C" } : undefined}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/10 p-3">
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)} className="mb-2 w-full justify-center text-white/70 hover:bg-white/5 hover:text-white">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">Réduire</span>}
        </Button>
        <button onClick={handleSignOut} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white", collapsed && "justify-center")}>
          <LogOut className="h-5 w-5 shrink-0" />{!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  )
}
