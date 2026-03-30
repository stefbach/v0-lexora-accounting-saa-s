"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  Briefcase,
  FileText,
  Settings,
  LogOut,
} from "lucide-react"

const MENU = [
  {
    section: "Administration",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/users", label: "Utilisateurs", icon: Users },
      { href: "/admin/clients", label: "Clients", icon: Briefcase },
      { href: "/admin/comptables", label: "Comptables", icon: UserCog },
      { href: "/admin/societes", label: "Societes", icon: Building2 },
      { href: "/admin/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    section: "Parametres",
    items: [
      { href: "/admin/parametres", label: "Configuration", icon: Settings },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside className="w-64 bg-[#1E2A4A] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 overflow-y-auto">
      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#C9A84C] rounded-lg flex items-center justify-center">
            <span className="text-[#1E2A4A] font-black text-sm">L</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">LEXORA</p>
            <p className="text-white/40 text-xs">Administration</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-4">
        {MENU.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
              {section}
            </p>
            <div className="mt-1 space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href, item.exact)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-[#C9A84C] text-[#1E2A4A] font-semibold"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Deconnexion</span>
        </button>
      </div>
    </aside>
  )
}
