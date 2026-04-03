"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  Briefcase,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react"

const MENU = [
  {
    section: "Administration", sectionKey: "admin.administration",
    items: [
      { href: "/admin", label: "Dashboard", labelKey: "admin.dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/users", label: "Utilisateurs", labelKey: "admin.users", icon: Users },
      { href: "/admin/clients", label: "Clients", labelKey: "admin.clients", icon: Briefcase },
      { href: "/admin/comptables", label: "Comptables", labelKey: "admin.accountants", icon: UserCog },
      { href: "/admin/societes", label: "Societes", labelKey: "admin.companies", icon: Building2 },
      { href: "/admin/documents", label: "Documents", labelKey: "admin.documents", icon: FileText },
      { href: "/admin/services", label: "Services & Plans", labelKey: "admin.services", icon: Settings },
    ],
  },
  {
    section: "Parametres", sectionKey: "admin.settings_section",
    items: [
      { href: "/admin/parametres", label: "Configuration", labelKey: "admin.configuration", icon: Settings },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = getLocale()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

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
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-50 md:hidden bg-[#0B0F2E] text-white p-2 rounded-lg shadow-lg">
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />}

    <aside className={`w-64 bg-[#0B0F2E] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Mobile close button */}
      <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
        <X className="w-5 h-5" />
      </button>

      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
              <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
            </div>
            <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490" }}>{t('admin.administration', locale)}</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-4">
        {MENU.map(({ section, sectionKey, items }) => (
          <div key={section}>
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
              {sectionKey ? t(sectionKey, locale) : section}
            </p>
            <div className="mt-1 space-y-0.5">
              {items.map((item: any) => {
                const Icon = item.icon
                const active = isActive(item.href, item.exact)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-[#D4AF37] text-[#0B0F2E] font-semibold"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.labelKey ? t(item.labelKey, locale) : item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-2">
        <div className="flex justify-center">
          <LanguageSwitcher />
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('common.logout', locale)}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
