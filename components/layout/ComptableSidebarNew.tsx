"use client"

import Link from "next/link"
import { usePathname, useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import {
  LayoutDashboard,
  Users,
  UsersRound,
  FileText,
  Landmark,
  Receipt,
  Calculator,
  BookOpen,
  Globe,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Settings,
  FileSpreadsheet,
  Menu,
  X,
  Building2,
  CreditCard,
  TrendingUp,
  Target,
  ClipboardList,
  CalendarDays,
  UserCog,
  Banknote,
  BarChart3,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface NavItem {
  href: string
  label: string
  labelKey?: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  titleKey?: string
  /** When true, render with gold accent even when not active */
  isClientContext?: boolean
  items: NavItem[]
}

/* ------------------------------------------------------------------ */
/*  Static top-level sections (no client context required)            */
/* ------------------------------------------------------------------ */
const STATIC_SECTIONS: NavSection[] = [
  {
    title: "Mon Cabinet",
    titleKey: "comptable.my_firm",
    items: [
      { href: "/comptable", label: "Dashboard", labelKey: "admin.dashboard", icon: LayoutDashboard },
      { href: "/comptable/clients", label: "Mes Clients", labelKey: "comptable.my_clients", icon: Users },
      { href: "/comptable/equipe", label: "Mon Équipe", labelKey: "comptable.my_team", icon: UsersRound },
    ],
  },
  {
    title: "Comptabilité",
    titleKey: "acc.accounting",
    items: [
      { href: "/comptable/documents", label: "Documents & OCR", labelKey: "nav.documents", icon: FileText },
      { href: "/comptable/banque", label: "Banque", labelKey: "acc.bank", icon: Landmark },
      { href: "/comptable/rapprochement", label: "Rapprochement", labelKey: "acc.reconciliation", icon: CreditCard },
      { href: "/comptable/grand-livre", label: "Grand Livre", labelKey: "fin.general_ledger", icon: BookOpen },
      { href: "/comptable/tva", label: "TVA MRA", labelKey: "tax.vat", icon: Receipt },
      { href: "/comptable/factures-clients", label: "Factures clients", labelKey: "comptable.invoices", icon: FileSpreadsheet },
      { href: "/comptable/fournisseurs", label: "Fournisseurs", labelKey: "acc.suppliers", icon: Banknote },
    ],
  },
  {
    title: "Social & Paie",
    titleKey: "hr.hr_payroll",
    items: [
      { href: "/comptable/charges-sociales", label: "Charges sociales", labelKey: "comptable.social_charges", icon: Calculator },
      { href: "/comptable/salaires", label: "Salaires", labelKey: "hr.payslips", icon: CreditCard },
      { href: "/rh", label: "RH & Paie", labelKey: "hr.hr_payroll", icon: UserCog },
    ],
  },
  {
    title: "Fiscal",
    titleKey: "comptable.fiscal",
    items: [
      { href: "/comptable/tva", label: "TVA MRA", labelKey: "tax.vat", icon: Receipt },
      { href: "/comptable/interco", label: "INTERCO", labelKey: "comptable.interco", icon: Globe },
      { href: "/comptable/alertes", label: "Alertes", labelKey: "nav.alerts", icon: AlertTriangle },
    ],
  },
  {
    title: "États Financiers",
    titleKey: "fin.financial_statements",
    items: [
      { href: "/comptable/rapports/balance", label: "Balance", labelKey: "comptable.balance", icon: BarChart3 },
      { href: "/comptable/rapports/bilan", label: "Bilan & P&L", labelKey: "fin.balance_sheet", icon: BookOpen },
      { href: "/comptable/rapports/previsionnel", label: "Prévisionnel", labelKey: "fin.forecast", icon: TrendingUp },
      { href: "/comptable/rapports/simulations", label: "Simulations", labelKey: "fin.simulations", icon: Target },
      { href: "/comptable/rapports/annual-return", label: "Annual Return", labelKey: "tax.annual_return", icon: ClipboardList },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Per-société section built from URL params                          */
/* ------------------------------------------------------------------ */
function buildClientSection(
  clientId: string,
  societeId: string,
  societeName: string,
): NavSection {
  const base = `/comptable/clients/${clientId}/${societeId}`
  return {
    title: societeName ? `Client: ${societeName}` : `Client: ${societeId}`,
    isClientContext: true,
    items: [
      { href: `${base}/tableau-de-bord`, label: "Vue d'ensemble", labelKey: "comptable.overview", icon: LayoutDashboard },
      { href: `${base}/grand-livre`, label: "Grand Livre", labelKey: "fin.general_ledger", icon: BookOpen },
      { href: `${base}/balance`, label: "Balance", labelKey: "comptable.balance", icon: BarChart3 },
      { href: `${base}/bilan`, label: "Bilan & P&L", labelKey: "fin.balance_sheet", icon: FileSpreadsheet },
      { href: `${base}/previsionnel`, label: "Prévisionnel", labelKey: "fin.forecast", icon: TrendingUp },
      { href: `${base}/simulations`, label: "Simulations", labelKey: "fin.simulations", icon: Target },
      { href: `${base}/it-form3`, label: "IT Form 3", labelKey: "tax.it_form3", icon: FileText },
      { href: `${base}/annual-return`, label: "Annual Return", labelKey: "tax.annual_return", icon: ClipboardList },
      { href: `${base}/far`, label: "Fournisseurs (FAR)", labelKey: "acc.suppliers", icon: Banknote },
      { href: `/comptable/salaires?clientId=${clientId}&societeId=${societeId}`, label: "Salaires", labelKey: "hr.payslips", icon: CreditCard },
      { href: `/comptable/rapprochement?clientId=${clientId}&societeId=${societeId}`, label: "Rapprochement", labelKey: "acc.reconciliation", icon: Landmark },
    ],
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function ComptableSidebarNew() {
  const pathname = usePathname()
  const rawParams = useParams() as Record<string, string>
  const router = useRouter()
  const { profile } = useProfile()
  const locale = getLocale()

  const [collapsed, setCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<string[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [societeName, setSocieteName] = useState<string>("")

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const clientId = rawParams?.clientId ?? ""
  const societeId = rawParams?.societeId ?? ""
  const hasSociete = Boolean(clientId && societeId)

  // Fetch société name when context changes
  useEffect(() => {
    if (!hasSociete) { setSocieteName(""); return }
    const fetchName = async () => {
      try {
        const res = await fetch(`/api/comptable/clients?clientId=${clientId}`)
        if (!res.ok) return
        const data = await res.json()
        const societes: { id: string; nom: string }[] = data.societes || data.clients || []
        const found = societes.find((s) => s.id === societeId)
        if (found?.nom) setSocieteName(found.nom)
      } catch {
        // Keep empty — the ID will be shown as fallback
      }
    }
    fetchName()
  }, [clientId, societeId, hasSociete])

  const roleLabel =
    profile?.role === "comptable_dedie" ? "Assistant Comptable" : "Expert-Comptable"

  // Build section list: client section first when in société context
  const sections: NavSection[] = []
  if (hasSociete) {
    sections.push(buildClientSection(clientId, societeId, societeName))
  }
  sections.push(...STATIC_SECTIONS)

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) =>
      prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title]
    )
  }

  const isActive = (href: string) => {
    // Strip query string for comparison
    const hrefPath = href.split("?")[0]
    if (hrefPath === "/comptable") return pathname === "/comptable"
    return pathname === hrefPath || pathname.startsWith(hrefPath + "/")
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden bg-[#1E2A4A] text-white p-2 rounded-lg shadow-lg"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-all duration-300 overflow-y-auto",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0"
        )}
        style={{ backgroundColor: NAVY }}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 flex-shrink-0">
          {!collapsed ? (
            <Link href="/comptable" className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: GOLD }}
              >
                <span className="text-sm font-bold" style={{ color: NAVY }}>L</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-lg font-semibold leading-tight" style={{ color: GOLD }}>Lexora</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/50 truncate">
                  {roleLabel}
                </span>
              </div>
            </Link>
          ) : (
            <div
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: GOLD }}
            >
              <span className="text-sm font-bold" style={{ color: NAVY }}>L</span>
            </div>
          )}
        </div>

        {/* Client context banner (expanded mode only) */}
        {hasSociete && !collapsed && (
          <div
            className="flex items-center gap-2 px-4 py-2 border-b border-white/10 flex-shrink-0"
            style={{ backgroundColor: `${GOLD}18` }}
          >
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-xs font-semibold truncate" style={{ color: GOLD }}>
              {societeName || societeId}
            </span>
            <Link
              href="/comptable/clients"
              className="ml-auto text-white/40 hover:text-white/80 text-xs whitespace-nowrap transition-colors"
              title="Tous les clients"
            >
              ← Tous
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sections.map((section) => {
            const isSectionCollapsed = collapsedSections.includes(section.title)
            const hasActive = section.items.some((i) => isActive(i.href))
            const isClientContext = section.isClientContext

            return (
              <div key={section.title} className="mb-1">
                {/* Section header — hidden when sidebar is icon-only collapsed */}
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                      hasActive || isClientContext
                        ? "text-[#C9A84C]"
                        : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <span className="truncate text-left">
                      {section.titleKey ? t(section.titleKey, locale) : section.title}
                    </span>
                    {isSectionCollapsed ? (
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 flex-shrink-0" />
                    )}
                  </button>
                )}

                {/* Items — always show in icon-only mode; respect collapse in expanded mode */}
                {(!isSectionCollapsed || collapsed) && (
                  <div className={cn("space-y-0.5", !collapsed && "ml-1")}>
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          title={collapsed ? (item.labelKey ? t(item.labelKey, locale) : item.label) : undefined}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                            active
                              ? "font-semibold"
                              : "text-white/70 hover:bg-white/10 hover:text-white",
                            collapsed && "justify-center"
                          )}
                          style={active ? { backgroundColor: GOLD, color: NAVY } : undefined}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {!collapsed && (
                            <span className="truncate">
                              {item.labelKey ? t(item.labelKey, locale) : item.label}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 flex-shrink-0 space-y-1">
          {!collapsed && (
            <div className="flex justify-center mb-2">
              <LanguageSwitcher />
            </div>
          )}

          {/* Collapse / expand toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center text-white/50 hover:bg-white/5 hover:text-white"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">{t("comptable.collapse", locale)}</span>
              </>
            )}
          </Button>

          {/* Profile */}
          <Link
            href="/profil"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors",
              collapsed && "justify-center"
            )}
            title={collapsed ? t("account.my_profile", locale) : undefined}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{t("account.my_profile", locale)}</span>}
          </Link>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors",
              collapsed && "justify-center"
            )}
            title={collapsed ? t("common.logout", locale) : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{t("common.logout", locale)}</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
