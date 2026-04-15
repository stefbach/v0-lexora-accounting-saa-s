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
import MonEspaceSalarieLink from "@/components/rh/MonEspaceSalarieLink"
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
  UserCog,
  Banknote,
  BarChart3,
  ArrowLeft,
  Gavel,
  Upload,
  Download,
  CalendarDays,
  Target,
  ClipboardList,
  FilePen,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface NavItem {
  href: string
  label: string
  labelKey?: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  titleKey?: string
  items: NavItem[]
}

/* ------------------------------------------------------------------ */
/*  MODE CABINET — Sidebar minimal (Dashboard, Clients, Équipe)        */
/* ------------------------------------------------------------------ */
const CABINET_SECTIONS: NavSection[] = [
  {
    title: "Mon Cabinet",
    titleKey: "comptable.my_firm",
    items: [
      { href: "/comptable", label: "Dashboard", labelKey: "admin.dashboard", icon: LayoutDashboard },
      { href: "/comptable/clients", label: "Mes Clients", labelKey: "comptable.my_clients", icon: Users },
      { href: "/comptable/equipe", label: "Mon Équipe", labelKey: "comptable.my_team", icon: UsersRound },
      { href: "/comptable/contrats", label: "Contrats clients", icon: FilePen },
      { href: "/juridique/contrats", label: "Générateur IA (juridique)", icon: Gavel },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  MODE CLIENT — Mêmes rubriques que ClientSidebarFull                */
/*  Quand le comptable navigue sur /client/* il voit tout              */
/* ------------------------------------------------------------------ */
const CLIENT_SECTIONS: NavSection[] = [
  {
    title: "Mon Espace",
    items: [
      { href: "/client/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/client/documents", label: "Mes Documents", icon: FileText },
    ],
  },
  {
    title: "Facturation",
    items: [
      { href: "/client/factures", label: "Factures clients", icon: FileSpreadsheet },
      { href: "/client/fournisseurs", label: "Fournisseurs", icon: Banknote },
    ],
  },
  {
    title: "Comptabilité",
    items: [
      { href: "/client/banque", label: "Banque", icon: Landmark },
      { href: "/client/rapprochement", label: "Rapprochement", icon: CreditCard },
      { href: "/client/rapprochement-mensuel", label: "Rapprochement mensuel", icon: FileSpreadsheet },
      { href: "/client/ecritures", label: "Écritures & OD", icon: FilePen },
      { href: "/client/grand-livre", label: "Grand Livre", icon: BookOpen },
    ],
  },
  {
    title: "États Financiers",
    items: [
      { href: "/client/bilan", label: "Bilan & P&L", icon: BookOpen },
      { href: "/client/previsionnel", label: "Prévisionnel", icon: TrendingUp },
      { href: "/client/echeances", label: "Échéances", icon: CalendarDays },
    ],
  },
  {
    title: "Fiscal MRA",
    items: [
      { href: "/client/tva", label: "TVA MRA", icon: Receipt },
      { href: "/client/itform3", label: "IT Form 3 / IS", icon: FileText },
      { href: "/client/salaires-compta", label: "Salaires — Plan comptable", icon: CreditCard },
    ],
  },
  {
    title: "RH & Paie",
    items: [
      { href: "/rh", label: "Module RH complet", icon: UserCog },
      { href: "/rh/paie", label: "Bulletins de paie", icon: FileSpreadsheet },
      { href: "/rh/import-paie", label: "Import paie Excel", icon: Upload },
      { href: "/rh/paie/exports-mra", label: "Exports MRA", icon: Download },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Per-société section (when in /comptable/clients/[id]/[societeId])  */
/* ------------------------------------------------------------------ */
function buildSocieteSection(clientId: string, societeId: string, societeName: string): NavSection {
  const base = `/comptable/clients/${clientId}/${societeId}`
  return {
    title: societeName || "Société",
    items: [
      { href: `${base}/tableau-de-bord`, label: "Tableau de bord", icon: LayoutDashboard },
      { href: `${base}/grand-livre`, label: "Grand Livre", icon: BookOpen },
      { href: `${base}/balance`, label: "Balance", icon: BarChart3 },
      { href: `${base}/bilan`, label: "Bilan & P&L", icon: FileSpreadsheet },
      { href: `${base}/it-form3`, label: "IT Form 3", icon: FileText },
      { href: `${base}/previsionnel`, label: "Prévisionnel", icon: TrendingUp },
      { href: `${base}/far`, label: "FAR / Amortissements", icon: Target },
      { href: `${base}/annual-return`, label: "Annual Return", icon: ClipboardList },
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
  const [societeName, setSocieteName] = useState("")

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const clientId = rawParams?.clientId ?? ""
  const societeId = rawParams?.societeId ?? ""
  const hasSociete = Boolean(clientId && societeId)

  // Detect context: are we in /client/* pages or /comptable/* pages?
  const isClientContext = pathname.startsWith("/client/") || pathname.startsWith("/rh/") || pathname.startsWith("/rh")

  // Fetch société name when in société context
  useEffect(() => {
    if (!hasSociete) { setSocieteName(""); return }
    fetch(`/api/comptable/societes`)
      .then(r => r.json())
      .then(d => {
        const societes = d.societes || []
        const found = societes.find((s: any) => s.id === societeId)
        if (found?.nom) setSocieteName(found.nom)
      })
      .catch(() => {})
  }, [clientId, societeId, hasSociete])

  const roleLabel =
    profile?.role === "comptable_dedie" ? "Assistant Comptable" : "Expert-Comptable"

  // Build sections based on context
  let sections: NavSection[]
  if (isClientContext) {
    // In client pages: show client-like sidebar
    sections = [...CLIENT_SECTIONS]
  } else if (hasSociete) {
    // In /comptable/clients/[clientId]/[societeId]/*: show cabinet + société sections
    sections = [
      ...CABINET_SECTIONS,
      buildSocieteSection(clientId, societeId, societeName),
    ]
  } else {
    // Default: just the cabinet
    sections = [...CABINET_SECTIONS]
  }

  const toggleSection = (title: string) => {
    setCollapsedSections(prev =>
      prev.includes(title) ? prev.filter(s => s !== title) : [...prev, title]
    )
  }

  const isActive = (href: string) => {
    const hrefPath = href.split("?")[0]
    if (hrefPath === "/comptable") return pathname === "/comptable"
    if (hrefPath === "/rh") return pathname === "/rh" || pathname.startsWith("/rh/")
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
        className="fixed top-4 left-4 z-50 md:hidden bg-[#0B0F2E] text-white p-2 rounded-lg shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />
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
        {/* Mobile close */}
        <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 flex-shrink-0">
          {!collapsed ? (
            <Link href="/comptable" className="flex items-center gap-2">
              <div className="flex flex-col min-w-0">
                <div className="flex items-baseline">
                  <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
                  <span className="text-base font-bold" style={{ color: GOLD, letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
                  <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
                </div>
                <span className="text-[10px] font-light tracking-wider truncate" style={{ color: "#4A5490" }}>
                  {roleLabel}
                </span>
              </div>
            </Link>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#141C4A", border: "1px solid #1E2760" }}>
              <span className="text-sm font-bold" style={{ color: "#E8EAFC" }}>L<span style={{ color: GOLD }}>X</span></span>
            </div>
          )}
        </div>

        {/* Context banner: "Retour cabinet" when in client context */}
        {isClientContext && !collapsed && (
          <Link
            href="/comptable"
            className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-xs font-semibold" style={{ color: GOLD }}>Retour espace cabinet</span>
          </Link>
        )}

        {/* Société context banner */}
        {hasSociete && !collapsed && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 flex-shrink-0" style={{ backgroundColor: `${GOLD}18` }}>
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-xs font-semibold truncate" style={{ color: GOLD }}>
              {societeName || societeId}
            </span>
            <Link href="/comptable/clients" className="ml-auto text-white/40 hover:text-white/80 text-xs whitespace-nowrap">← Tous</Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sections.map(section => {
            const isSectionCollapsed = collapsedSections.includes(section.title)
            const hasActive = section.items.some(i => isActive(i.href))

            return (
              <div key={section.title} className="mb-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                      hasActive ? "text-[#D4AF37]" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <span className="truncate text-left">{section.title}</span>
                    {isSectionCollapsed ? <ChevronRight className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                  </button>
                )}

                {(!isSectionCollapsed || collapsed) && (
                  <div className={cn("space-y-0.5", !collapsed && "ml-1")}>
                    {section.items.map(item => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                            active ? "font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white",
                            collapsed && "justify-center"
                          )}
                          style={active ? { backgroundColor: GOLD, color: NAVY } : undefined}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
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

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center text-white/50 hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span className="ml-2">Réduire</span></>}
          </Button>

          {/* TÂCHE 8 — lien Mon espace salarié si comptable type='interne'
              (mig 137 a employe_id renseigné). Le composant détecte
              automatiquement et masque pour 'externe' / 'dedie'. */}
          {!collapsed && <MonEspaceSalarieLink compact />}

          <Link
            href="/profil"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors",
              collapsed && "justify-center"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Mon Profil</span>}
          </Link>

          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors",
              collapsed && "justify-center"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
