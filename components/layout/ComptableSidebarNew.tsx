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
      { href: "/client/tiers-consolidation", label: "Consolider tiers", icon: UsersRound },
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
      {/* Mobile trigger — glassmorphic pill */}
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

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside data-lenis-prevent
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-all duration-300 overflow-y-auto",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0"
        )}
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
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo block */}
        <div
          className="flex h-20 items-center justify-between px-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}
        >
          {!collapsed ? (
            <Link href="/comptable" className="flex flex-col">
              <div className="flex items-baseline">
                <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>LE</span>
                <span className="text-lg font-bold" style={{ color: GOLD, letterSpacing: "0.04em" }}>X</span>
                <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>ORA</span>
                <span className="ml-2 relative flex h-2 w-2" aria-hidden="true">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: "#2ECC8A" }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: "#2ECC8A", boxShadow: "0 0 6px #2ECC8A" }}
                  />
                </span>
              </div>
              <div
                className="mt-1 h-[2px] w-12 rounded-full"
                aria-hidden="true"
                style={{ background: "linear-gradient(90deg, #D4AF37 0%, transparent 100%)" }}
              />
              <span
                className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] truncate"
                style={{ color: "#A8AFC7" }}
              >
                {roleLabel}
              </span>
            </Link>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#141C4A", border: "1px solid #1E2760" }}>
              <span className="text-sm font-bold" style={{ color: "#E8EAFC" }}>L<span style={{ color: GOLD }}>X</span></span>
            </div>
          )}
        </div>

        {/* Context banner: "Retour cabinet" */}
        {isClientContext && !collapsed && (
          <Link
            href="/comptable"
            className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-xl transition-colors flex-shrink-0"
            style={{
              color: GOLD,
              border: "1px solid rgba(212,175,55,0.30)",
              background:
                "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)",
            }}
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs font-semibold">Retour espace cabinet</span>
          </Link>
        )}

        {/* Société context banner */}
        {hasSociete && !collapsed && (
          <div
            className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0"
            style={{
              backgroundColor: `${GOLD}1F`,
              border: `1px solid ${GOLD}44`,
            }}
          >
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-xs font-semibold truncate" style={{ color: GOLD }}>
              {societeName || societeId}
            </span>
            <Link href="/comptable/clients" className="ml-auto text-white/40 hover:text-white/80 text-xs whitespace-nowrap">← Tous</Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
          {sections.map(section => {
            const isSectionCollapsed = collapsedSections.includes(section.title)
            const hasActive = section.items.some(i => isActive(i.href))

            return (
              <div key={section.title}>
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="group w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase rounded-md transition-colors"
                    style={{
                      color: hasActive ? GOLD : "#6B7390",
                      letterSpacing: "0.18em",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1 w-1 rounded-full"
                        style={{
                          backgroundColor: hasActive ? GOLD : "rgba(212,175,55,0.28)",
                          boxShadow: hasActive ? `0 0 4px ${GOLD}` : "none",
                        }}
                      />
                      <span className="truncate">{section.title}</span>
                    </span>
                    {isSectionCollapsed ? <ChevronRight className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                  </button>
                )}

                {(!isSectionCollapsed || collapsed) && (
                  <div className="mt-1 space-y-0.5">
                    {section.items.map(item => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                            active ? "font-semibold" : "text-white/70 hover:text-white",
                            collapsed && "justify-center"
                          )}
                          style={
                            active
                              ? {
                                  background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                                  color: NAVY,
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
                          {active && !collapsed && (
                            <span
                              aria-hidden="true"
                              className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full"
                              style={{
                                backgroundColor: NAVY,
                                boxShadow: "0 0 8px rgba(11,15,46,0.6)",
                              }}
                            />
                          )}
                          <Icon className="w-4 h-4 flex-shrink-0 relative" />
                          {!collapsed && <span className="truncate relative">{item.label}</span>}
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
        <div
          className="p-3 flex-shrink-0 space-y-1"
          style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}
        >
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
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm transition-all",
              collapsed && "justify-center"
            )}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(232,234,252,0.06)" }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent" }}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Mon Profil</span>}
          </Link>

          <button
            onClick={handleSignOut}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all",
              collapsed && "justify-center"
            )}
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
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
