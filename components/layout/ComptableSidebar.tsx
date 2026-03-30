"use client"

import Link from "next/link"
import { usePathname, useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard, Users, UsersRound, AlertTriangle, LogOut, Building2, GitMerge,
  ChevronLeft, ChevronRight, BookOpen, Scale, FileText, TrendingUp, ArrowLeftRight,
  FileSpreadsheet, RotateCcw, BarChart3, Briefcase, FolderOpen, Landmark,
  Receipt, Calculator, CalendarClock, PieChart,
} from "lucide-react"
import { useState, useEffect } from "react"

interface NavItem {
  href: string | ((params: Record<string, string>) => string)
  label: string
  icon: React.ComponentType<{ className?: string }>
  section?: string
  requiresSociete?: boolean
  badge?: boolean
}

// ── SECTION "Tableau de bord" ────────────────────────────────────────────────
const dashboardNavItems: NavItem[] = [
  { href: "/comptable", label: "Tableau de bord", icon: LayoutDashboard, section: "Tableau de bord" },
]

// ── SECTION "Clients & Sociétés" ─────────────────────────────────────────────
const clientsNavItems: NavItem[] = [
  { href: "/comptable/mes-clients", label: "Mes Clients",   icon: UsersRound, section: "Clients & Sociétés" },
  { href: "/comptable/clients",  label: "Liste clients", icon: Users,     section: "Clients & Sociétés" },
  { href: "/comptable/societes", label: "Sociétés",      icon: Building2, section: "Clients & Sociétés" },
]

// ── SECTION "Documents" ──────────────────────────────────────────────────────
const documentsNavItems: NavItem[] = [
  { href: "/comptable/documents",      label: "Documents",      icon: FolderOpen, section: "Documents" },
  { href: "/comptable/rapprochement",  label: "Rapprochement",  icon: GitMerge,   section: "Documents" },
  { href: "/comptable/banque",         label: "Banque",         icon: Landmark,   section: "Documents" },
]

// ── SECTION "Déclarations MRA" ───────────────────────────────────────────────
const mraNavItems: NavItem[] = [
  { href: "/comptable/tva",             label: "TVA MRA",             icon: FileSpreadsheet, section: "Déclarations MRA" },
  { href: "/comptable/charges-sociales", label: "Charges sociales",   icon: Receipt,         section: "Déclarations MRA" },
]

// ── SECTION "Consolidation" ──────────────────────────────────────────────────
const consolidationNavItems: NavItem[] = [
  { href: "/comptable/interco", label: "INTERCO", icon: ArrowLeftRight, section: "Consolidation" },
]

// ── SECTION "Rapports" ───────────────────────────────────────────────────────
const rapportsNavItems: NavItem[] = [
  { href: "/comptable/rapports", label: "Rapports", icon: BarChart3, section: "Rapports" },
]

// ── SECTION "Administration" (liens vers d'autres modules) ───────────────────
const adminNavItems: NavItem[] = [
  { href: "/rh",              label: "RH & Paie",      icon: UsersRound,    section: "Administration" },
  { href: "/comptable/equipe", label: "Mon Équipe",    icon: UsersRound,    section: "Administration" },
  { href: "/comptable/alertes", label: "Alertes",      icon: AlertTriangle, section: "Administration", badge: true },
  { href: "/direction",       label: "Direction",      icon: PieChart,      section: "Administration" },
]

// ── Nav items liés à une société (clientId + societeId requis) ────────────────
const societeNavItems: NavItem[] = [
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/tableau-de-bord`,
    label: "Tableau de bord société",
    icon: LayoutDashboard,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/grand-livre`,
    label: "Grand Livre",
    icon: BookOpen,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/balance`,
    label: "Balance",
    icon: Scale,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/it-form3`,
    label: "IT Form 3 / IS",
    icon: FileText,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/far`,
    label: "FAR / Amortissements",
    icon: TrendingUp,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/annual-return`,
    label: "Annual Return ROC",
    icon: RotateCcw,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/previsionnel`,
    label: "Prévisionnel",
    icon: CalendarClock,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/simulations`,
    label: "Simulations",
    icon: Calculator,
    section: "Société",
    requiresSociete: true,
  },
  {
    href: (p) => `/comptable/clients/${p.clientId}/${p.societeId}/bilan`,
    label: "Bilan officiel",
    icon: Briefcase,
    section: "Société",
    requiresSociete: true,
  },
]

function resolveHref(item: NavItem, params: Record<string, string>): string {
  if (typeof item.href === "function") return item.href(params)
  return item.href
}

function NavSection({
  items,
  params,
  pathname,
  collapsed,
  criticalAlertCount = 0,
}: {
  items: NavItem[]
  params: Record<string, string>
  pathname: string
  collapsed: boolean
  criticalAlertCount?: number
}) {
  let lastSection: string | undefined = undefined

  return (
    <>
      {items.map((item, index) => {
        const href = resolveHref(item, params)
        const isActive = href === "/comptable" ? pathname === "/comptable" : pathname.startsWith(href)
        const showSectionHeader = !collapsed && item.section && item.section !== lastSection
        if (item.section) lastSection = item.section

        return (
          <div key={`${href}-${item.label}-${index}`}>
            {showSectionHeader && (
              <div className="mt-4 mb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {item.section}
                </p>
              </div>
            )}
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive ? "bg-white/10 shadow-sm" : "text-white/70 hover:bg-white/5 hover:text-white",
                collapsed && "justify-center"
              )}
              style={isActive ? { color: "#C9A84C" } : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && criticalAlertCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {criticalAlertCount > 99 ? "99+" : criticalAlertCount}
                </span>
              )}
            </Link>
          </div>
        )
      })}
    </>
  )
}

export function ComptableSidebar() {
  const pathname = usePathname()
  const rawParams = useParams() as Record<string, string>
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [criticalAlertCount, setCriticalAlertCount] = useState(0)
  const { profile } = useProfile()

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const res = await fetch("/api/comptable/alertes")
        if (res.ok) {
          const data = await res.json()
          setCriticalAlertCount(data.counts?.critical || 0)
        }
      } catch {
        // Silently fail
      }
    }
    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
  const roleLabel = profile?.role === "comptable_dedie" ? "Comptable dédié" : "Comptable"

  const clientId = rawParams?.clientId ?? ""
  const societeId = rawParams?.societeId ?? ""
  const routeParams = { clientId, societeId }

  const hasSociete = Boolean(clientId && societeId)

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      style={{ backgroundColor: "#1E2A4A" }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        {!collapsed ? (
          <Link href="/comptable" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#C9A84C" }}
            >
              <span className="text-sm font-bold text-white">L</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold" style={{ color: "#C9A84C" }}>
                Lexora
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                {roleLabel}
              </span>
            </div>
          </Link>
        ) : (
          <div
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#C9A84C" }}
          >
            <span className="text-sm font-bold text-white">L</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        {!collapsed && (
          <div className="mb-4 rounded-lg bg-white/5 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">
              Portail Comptable
            </p>
          </div>
        )}

        <nav className="flex flex-col gap-0.5">
          {/* ── Tableau de bord ── */}
          <NavSection items={dashboardNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Clients & Sociétés ── */}
          <NavSection items={clientsNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Société spécifique (si contexte clientId+societeId disponible) ── */}
          {hasSociete && (
            <NavSection items={societeNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />
          )}

          {/* ── Documents ── */}
          <NavSection items={documentsNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Déclarations MRA ── */}
          <NavSection items={mraNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Consolidation ── */}
          <NavSection items={consolidationNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Rapports ── */}
          <NavSection items={rapportsNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} />

          {/* ── Administration ── */}
          <NavSection items={adminNavItems} params={routeParams} pathname={pathname} collapsed={collapsed} criticalAlertCount={criticalAlertCount} />
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="mb-2 w-full justify-center text-white/70 hover:bg-white/5 hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">Réduire</span>}
        </Button>
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  )
}
