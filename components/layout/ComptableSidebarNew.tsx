"use client"

import Link from "next/link"
import { usePathname, useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import { useState } from "react"
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
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    title: "Mon Cabinet",
    items: [
      { href: "/comptable", label: "Dashboard", icon: LayoutDashboard },
      { href: "/comptable/clients", label: "Mes Clients", icon: Users },
      { href: "/comptable/equipe", label: "Mon Equipe", icon: UsersRound },
    ],
  },
  {
    title: "Comptabilite",
    items: [
      { href: "/comptable/documents", label: "Documents & OCR", icon: FileText },
      { href: "/comptable/banque", label: "Banque & Rapprochement", icon: Landmark },
      { href: "/comptable/tva", label: "TVA MRA", icon: Receipt },
      { href: "/comptable/factures-clients", label: "Factures", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { href: "/comptable/charges-sociales", label: "Charges Sociales", icon: Calculator },
      { href: "/comptable/interco", label: "INTERCO", icon: Globe },
      { href: "/comptable/alertes", label: "Alertes", icon: AlertTriangle },
    ],
  },
]

function buildSocieteSection(clientId: string, societeId: string): NavSection {
  const base = `/comptable/clients/${clientId}/${societeId}`
  return {
    title: "Societe",
    items: [
      { href: `${base}`, label: "Vue d'ensemble", icon: LayoutDashboard },
      { href: `${base}/grand-livre`, label: "Grand Livre", icon: BookOpen },
      { href: `${base}/balance`, label: "Balance", icon: Calculator },
      { href: `${base}/bilan`, label: "Bilan & P&L", icon: FileSpreadsheet },
    ],
  }
}

export function ComptableSidebarNew() {
  const pathname = usePathname()
  const rawParams = useParams() as Record<string, string>
  const router = useRouter()
  const { profile } = useProfile()
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<string[]>([])

  const clientId = rawParams?.clientId ?? ""
  const societeId = rawParams?.societeId ?? ""
  const hasSociete = Boolean(clientId && societeId)

  const roleLabel =
    profile?.role === "comptable_dedie" ? "Assistant Comptable" : "Expert-Comptable"

  const sections = [...SECTIONS]
  if (hasSociete) {
    sections.splice(2, 0, buildSocieteSection(clientId, societeId))
  }

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) =>
      prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title]
    )
  }

  const isActive = (href: string) => {
    if (href === "/comptable") return pathname === "/comptable"
    return pathname === href || pathname.startsWith(href + "/")
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-all duration-300 overflow-y-auto",
        collapsed ? "w-16" : "w-64"
      )}
      style={{ backgroundColor: NAVY }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 flex-shrink-0">
        {!collapsed ? (
          <Link href="/comptable" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: GOLD }}
            >
              <span className="text-sm font-bold" style={{ color: NAVY }}>
                L
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold" style={{ color: GOLD }}>
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
            style={{ backgroundColor: GOLD }}
          >
            <span className="text-sm font-bold" style={{ color: NAVY }}>
              L
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {sections.map((section) => {
          const isSectionCollapsed = collapsedSections.includes(section.title)
          const hasActive = section.items.some((i) => isActive(i.href))

          return (
            <div key={section.title} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                    hasActive ? "text-white/80" : "text-white/40 hover:text-white/70"
                  )}
                  style={hasActive ? { color: GOLD } : undefined}
                >
                  <span>{section.title}</span>
                  {isSectionCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}
              {!isSectionCollapsed && (
                <div className="space-y-0.5 ml-1">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                          active
                            ? "font-semibold"
                            : "text-white/70 hover:bg-white/10 hover:text-white",
                          collapsed && "justify-center"
                        )}
                        style={
                          active
                            ? { backgroundColor: GOLD, color: NAVY }
                            : undefined
                        }
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="mb-1 w-full justify-center text-white/50 hover:bg-white/5 hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {!collapsed && <span className="ml-2">Reduire</span>}
        </Button>
        <Link
          href="/profil"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors"
        >
          <Settings className="w-4 h-4" />
          {!collapsed && <span>Mon profil</span>}
        </Link>
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Deconnexion</span>}
        </button>
      </div>
    </aside>
  )
}
