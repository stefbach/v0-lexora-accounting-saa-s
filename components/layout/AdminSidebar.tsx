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
  ShieldAlert,
  Wrench,
  Activity,
  Brain,
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
      { href: "/admin/lexora-tooling", label: "Lexora Tooling (IA)", icon: Brain },
    ],
  },
  {
    section: "Maintenance", sectionKey: "admin.maintenance_section",
    items: [
      { href: "/admin/repair", label: "Réparation comptable", labelKey: "admin.repair", icon: Wrench },
      { href: "/admin/health", label: "Santé système", labelKey: "admin.health", icon: Activity },
    ],
  },
  {
    section: "Parametres", sectionKey: "admin.settings_section",
    items: [
      { href: "/admin/parametres", label: "Configuration", labelKey: "admin.configuration", icon: Settings },
      { href: "/admin/reset-societe", label: "Reset société", labelKey: "admin.reset_societe", icon: ShieldAlert, danger: true },
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
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir la navigation"
        className="fixed top-4 left-4 z-50 md:hidden inline-flex items-center gap-2 rounded-full px-3 py-2 text-white shadow-lg backdrop-blur"
        style={{
          backgroundColor: "rgba(16,24,71,0.85)",
          border: "1px solid rgba(212,175,55,0.35)",
          boxShadow: "0 8px 20px -8px rgba(0,0,0,0.5)",
        }}
      >
        <Menu className="w-4 h-4" />
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: "#D4AF37", boxShadow: "0 0 8px #D4AF37" }}
        />
      </button>

      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" />}

      <aside data-lenis-prevent
        className={`w-64 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{
          background:
            "radial-gradient(ellipse 140% 50% at 50% 0%, rgba(65,145,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 140% 40% at 50% 100%, rgba(212,175,55,0.08) 0%, transparent 70%), #0B0F2E",
          borderRight: "1px solid rgba(212,175,55,0.12)",
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>

        <div className="p-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}>
          <Link href="/admin" className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>LE</span>
              <span className="text-lg font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em" }}>X</span>
              <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>ORA</span>
              <span className="ml-2 relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#2ECC8A" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#2ECC8A", boxShadow: "0 0 6px #2ECC8A" }} />
              </span>
            </div>
            <div
              className="mt-1 h-[2px] w-12 rounded-full"
              aria-hidden="true"
              style={{ background: "linear-gradient(90deg, #D4AF37 0%, transparent 100%)" }}
            />
            <span className="mt-2 inline-block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#A8AFC7" }}>
              {t('admin.administration', locale)}
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-3">
          {MENU.map(({ section, sectionKey, items }) => {
            const hasActive = items.some((i: any) => isActive(i.href, i.exact))
            return (
              <div key={section}>
                <div
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase rounded-md"
                  style={{ color: hasActive ? "#D4AF37" : "#6B7390", letterSpacing: "0.18em" }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1 w-1 rounded-full"
                    style={{
                      backgroundColor: hasActive ? "#D4AF37" : "rgba(212,175,55,0.28)",
                      boxShadow: hasActive ? "0 0 4px #D4AF37" : "none",
                    }}
                  />
                  <span>{sectionKey ? t(sectionKey, locale) : section}</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {items.map((item: any) => {
                    const Icon = item.icon
                    const active = isActive(item.href, item.exact)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                          active ? "text-[#0B0F2E] font-semibold" : item.danger ? "text-[#FCA5A5] hover:text-white" : "text-white/70 hover:text-white"
                        )}
                        style={
                          active
                            ? {
                                background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                                boxShadow:
                                  "0 8px 24px -8px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                              }
                            : undefined
                        }
                      >
                        {!active && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                            style={{
                              background:
                                "linear-gradient(135deg, rgba(65,145,255,0.14) 0%, rgba(232,234,252,0.06) 100%)",
                            }}
                          />
                        )}
                        {active && (
                          <span
                            aria-hidden="true"
                            className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full"
                            style={{
                              backgroundColor: "#0B0F2E",
                              boxShadow: "0 0 8px rgba(11,15,46,0.6)",
                            }}
                          />
                        )}
                        <Icon className="w-4 h-4 flex-shrink-0 relative" style={{ color: active ? "#0B0F2E" : undefined }} />
                        <span className="truncate relative">{item.labelKey ? t(item.labelKey, locale) : item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="px-3 py-4 flex-shrink-0 space-y-2" style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}>
          <div className="flex justify-center">
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
            style={{ color: "#A8AFC7" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.14)"
              e.currentTarget.style.color = "#FCA5A5"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = "#A8AFC7"
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout', locale)}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
