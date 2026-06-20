"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"
import { Scale, FileText, Users, ShieldCheck, Settings, LogOut, FileSignature, Menu, X, Gavel, MessageSquareText, FolderOpen, LayoutGrid, FolderKanban, ArrowLeft } from "lucide-react"

const LINKS = [
  { href: '/juridique', label: 'Tableau de bord', labelKey: 'comp.legal_sidebar.dashboard', icon: Scale, exact: true },
  { href: '/juridique/dossiers', label: 'Dossiers', labelKey: 'comp.legal_sidebar.matters', icon: FolderKanban },
  { href: '/juridique/departements', label: 'Départements', labelKey: 'comp.legal_sidebar.departments', icon: LayoutGrid },
  { href: '/juridique/conseil', label: 'Conseil juridique', labelKey: 'comp.legal_sidebar.advice', icon: MessageSquareText },
  { href: '/juridique/conseil-rh', label: 'Conseil RH & Social', labelKey: 'comp.legal_sidebar.advice_hr', icon: Users },
  { href: '/juridique/contentieux', label: 'Contentieux', labelKey: 'comp.legal_sidebar.litigation', icon: Gavel },
  { href: '/juridique/contrats', label: 'Générateur de contrats', labelKey: 'comp.legal_sidebar.contract_generator', icon: FileSignature },
  { href: '/juridique/documents', label: 'Documents', labelKey: 'comp.legal_sidebar.documents', icon: FolderOpen },
  { href: '/juridique/conformite', label: 'Conformité & délais', labelKey: 'comp.legal_sidebar.compliance', icon: ShieldCheck },
  { href: '/rh/employes', label: 'Employés (lecture)', labelKey: 'comp.legal_sidebar.employees_readonly', icon: Users },
]

export function JuridiqueSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = getLocale()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation (mobile)
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
      <button
        onClick={() => setMobileOpen(true)}
        aria-label={t('comp.sidebar.open_nav', locale)}
        className="fixed top-4 left-4 z-50 md:hidden print:hidden inline-flex items-center gap-2 rounded-full px-3 py-2 text-white shadow-lg backdrop-blur"
        style={{
          background: "linear-gradient(135deg, rgba(11,15,46,0.92) 0%, rgba(11,15,46,0.78) 100%)",
          border: "1px solid rgba(212,175,55,0.30)",
        }}
      >
        <Menu className="w-4 h-4" />
        <span className="text-xs font-semibold tracking-wide">LEX</span>
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

    <aside data-lenis-prevent
      className={`w-60 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      style={{
        background:
          "radial-gradient(ellipse 140% 50% at 50% 0%, rgba(65,145,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 140% 40% at 50% 100%, rgba(212,175,55,0.08) 0%, transparent 70%), #0B0F2E",
        borderRight: "1px solid rgba(212,175,55,0.12)",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <button
        onClick={() => setMobileOpen(false)}
        className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10"
        aria-label={t('comp.sidebar.close_nav', locale)}
      >
        <X className="w-5 h-5" />
      </button>
      <div className="p-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}>
        <div className="flex flex-col">
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
            {t('comp.legal_sidebar.module_title', locale)}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <Link
          href="/redirect"
          className="group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white transition-all duration-200 mb-1"
          style={{ border: "1px solid rgba(232,234,252,0.12)" }}
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          <span className="relative">{t('comp.legal_sidebar.back', locale)}</span>
        </Link>
        {LINKS.map(l => {
          const Icon = l.icon
          const active = isActive(l.href, l.exact)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                active ? "text-[#0B0F2E] font-semibold" : "text-white/70 hover:text-white"
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
              <span className="relative">{l.labelKey ? t(l.labelKey, locale) : l.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 flex-shrink-0 space-y-1" style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}>
        <Link
          href="/profil"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm transition-all"
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(232,234,252,0.06)" }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent" }}
        >
          <Settings className="w-4 h-4" /><span>{t('comp.legal_sidebar.my_profile', locale)}</span>
        </Link>
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
          <LogOut className="w-4 h-4" /><span>{t('common.logout', locale)}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
